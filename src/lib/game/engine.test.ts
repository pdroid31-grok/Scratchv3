import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auctionBonusOpen, auctionCellOpen, auctionExtraSteps, auctionRevealDone, auctionRunning, auctionShown, AUCTION_REVEAL_STEPS, buildLots, cinematicFromTransition, consumeRerollFx, emptyCount, lotIds, nightWinner, rerollCinematicKind } from "./auction";
import { applyAction, lobbyState, startAuction, type GameState } from "./engine";
import { listingFromRoom, liveSeriesScore } from "./lobby-list";
import { applyPrize, bagLegend, HALFTIME_BAG, prizeLabel, redactHalftime, type Prize } from "./halftime";
import { clipDisplayName, hostedNightKey, nightKey, opponentKey, planHostedNightWrite, isBankCommish } from "./stats-shared";
import { parseRankTab } from "./rank-tabs";
import { hostedMatchView, historyLineScore } from "./hosted-match";
import { clampAvatar, isUnlocked, longestDayStreak, parseOwned, pickPrize, silverSecondDayCount, sniperWeekHit, walletBalance, PRIZE_AVATARS, WIN_PAY, BOX_COST, GOLDEN_COST, boxPoolOwnedCount, hitBananaScore, hitBoxAddict, justUnlockedBanana, justUnlockedScratchLook, BOX_ADDICT_POOL_NEED, BANANA_SCORE_UNDER, avatarById, hitHeavyHitterScore, skipHeavyHitterWeek, stampDayGap, lostGapHit, earlyBirdDayCount, nightOwlDayCount, comebackKidHit, freeFallHit, EARLY_BIRD_NEED, NIGHT_OWL_NEED, FEAT_TRACK_FROM, DOUBLE_DONUT_FROM, NEGATIVE_FROM, FEAT_SCRATCH_POINTS, THRIFTY_NEED, IRON_BOOT_POINTS, featWeekFromW3, hitFlashTotal, thriftyHit, OVERHEAD_FROM, MIRROR_FROM, OVERHEAD_SCORE, lineupSignature, overheadPassed, mirrorUserIds, TWIN_FROM, twinUserIds, LOST_GAP_DAYS, HEAVY_HITTER_PPR, lumpedUpHit, weeklyRealZeroCount, doubleDonutHit, isExactZeroScore, isNegativeScore, lookSource } from "./avatars";
import { PLAYERS } from "./players";
import { ratingFromPpr } from "./ratings";
import { emptyRoster, type Roster } from "./types";

function named(state: GameState): GameState {
  return { ...state, names: ["Alex", "Sam"] };
}

function openMin(state: GameState, index: 0 | 1 = 0): GameState {
  const actor = state.currentBidder;
  const picked = applyAction(state, { type: "selectChoice", index }, actor);
  return applyAction(picked, { type: "placeBid", amount: 1 }, actor);
}

describe("applyAction turn lock", () => {
  it("ignores a bid from the seat that is not on the clock", () => {
    const started = named(startAuction("Alex", "Sam"));
    const actor = started.currentBidder === 0 ? 1 : 0;
    const next = applyAction(started, { type: "placeBid", amount: 1 }, actor as 0 | 1);
    assert.equal(next, started);
    assert.equal(next.currentBid, 0);
  });

  it("lets either GM chat without moving the clock", () => {
    const started = named(startAuction("Alex", "Sam"));
    const bidder = started.currentBidder;
    const other = bidder === 0 ? 1 : 0;
    const next = applyAction(started, { type: "chat", text: "  let’s go  " }, other);
    assert.equal(next.phase, started.phase);
    assert.equal(next.currentBidder, bidder);
    assert.equal(next.chat?.[0]?.text, "let’s go");
    assert.equal(next.chat?.[0]?.seat, other);
    const empty = applyAction(started, { type: "chat", text: "   " }, other);
    assert.equal(empty.chat?.length ?? 0, 0);
  });

  it("refuses an opening bid until a name is picked", () => {
    const started = named(startAuction("Alex", "Sam"));
    const actor = started.currentBidder;
    const next = applyAction(started, { type: "placeBid", amount: 1 }, actor);
    assert.equal(next.currentBid, 0);
    assert.equal(next.choice, null);
  });

  it("accepts an opening bid from the nominator after a pick and flips the clock", () => {
    const started = named(startAuction("Alex", "Sam"));
    const actor = started.currentBidder;
    const next = openMin(started, 0);
    assert.equal(next.currentBid, 1);
    assert.equal(next.bidHolder, actor);
    assert.equal(next.currentBidder, actor === 0 ? 1 : 0);
    assert.equal(next.choice, 0);
  });

  it("sells the picked name when the other GM passes, then the loser opens next", () => {
    const started = named(startAuction("Alex", "Sam"));
    const opener = started.currentBidder;
    const other = opener === 0 ? 1 : 0;
    const lot = started.lots[0];
    assert.ok(lot);
    const bid = openMin(started, 1);
    const sold = applyAction(bid, { type: "pass" }, other);
    assert.equal(sold.phase, "sold");
    assert.equal(sold.lastSale?.seat, opener);
    assert.equal(sold.lastSale?.price, 1);
    assert.equal(sold.lastSale?.lot.player.id, lot.other.id);
    const next = applyAction(sold, { type: "advance" });
    assert.equal(next.lotIndex, 1);
    if (next.phase === "bidding") {
      assert.equal(next.nominator, other);
    }
  });

  it("lets either seat rematch from results and deals a fresh board", () => {
    const started = named(startAuction("Alex", "Sam"));
    const opener = started.currentBidder;
    const other = opener === 0 ? 1 : 0;
    const bid = openMin(started);
    const sold = applyAction(bid, { type: "pass" }, other);
    let state = sold;
    let steps = 0;
    while (state.phase !== "results") {
      if (++steps > 80) throw new Error(`stuck in ${state.phase}`);
      if (state.phase === "sold") {
        state = applyAction(state, { type: "advance" });
        continue;
      }
      if (state.phase === "halftime") {
        state = applyAction(state, { type: "pickBox", index: 0 }, 0);
        state = applyAction(state, { type: "pickBox", index: 1 }, 1);
        state = applyAction(state, { type: "advance" });
        continue;
      }
      if (state.phase === "unopposed") {
        const picked = applyAction(state, { type: "selectChoice", index: 0 }, state.currentBidder);
        state = applyAction(picked, { type: "claim" }, state.currentBidder);
        continue;
      }
      const actor = state.currentBidder;
      const opened = openMin(state);
      const passer = opened.currentBidder;
      state = applyAction(opened, { type: "pass" }, passer);
    }
    const waiting = applyAction(state, { type: "rematch" }, 1);
    assert.equal(waiting.phase, "results");
    assert.deepEqual(waiting.rematchReady, [false, true]);
    const again = applyAction(waiting, { type: "rematch" }, 0);
    assert.notEqual(again.phase, "results");
    assert.equal(again.names[0], "Alex");
    assert.equal(again.names[1], "Sam");
    assert.equal(again.cash[0], 25);
    assert.equal(again.cash[1], 25);
    assert.equal(again.sales.length, 0);
    assert.equal(again.discards.length, 0);
    assert.equal(again.rerollFx, null);
    assert.equal(again.lots.length, 12);
    assert.equal(again.choice, null);
    assert.equal(again.halftime, null);
    assert.deepEqual(again.bonus, [0, 0]);
    assert.equal(state.nights, 1);
    assert.deepEqual(again.series, state.series);
    assert.equal(again.nights, 1);
    const previous = new Set(lotIds(state.lots));
    for (const id of lotIds(again.lots)) {
      assert.equal(previous.has(id), false, `rematch reused ${id}`);
    }
  });

  it("carries both GMs' avatars into a rematch", () => {
    const started = startAuction("Alex", "Sam", {
      avatars: ["holy", "farmer"],
      userIds: ["u-alex", "u-sam"],
    });
    assert.deepEqual(started.avatars, ["holy", "farmer"]);
    const done = {
      ...started,
      phase: "results" as const,
    };
    const again = applyAction(done, { type: "rematch" });
    assert.deepEqual(again.avatars, ["holy", "farmer"]);
    assert.deepEqual(again.userIds, ["u-alex", "u-sam"]);
  });

  it("lets the picker shuffle both names once for $2 before a bid", () => {
    const started = named(startAuction("Alex", "Sam"));
    const picker = started.currentBidder;
    const lot = started.lots[started.lotIndex];
    assert.ok(lot);
    const before = [lot.player.id, lot.other.id];
    const shuffled = applyAction(started, { type: "shuffleLot" }, picker);
    assert.equal(shuffled.cash[picker], 23);
    assert.equal(shuffled.shuffleUsed[picker], true);
    assert.equal(shuffled.choice, null);
    const next = shuffled.lots[shuffled.lotIndex];
    assert.ok(next);
    assert.equal(next.slot, lot.slot);
    assert.equal(before.includes(next.player.id), false);
    assert.equal(before.includes(next.other.id), false);
    assert.notEqual(next.player.id, next.other.id);
    assert.equal(shuffled.discards.length, 0);
    assert.equal(shuffled.rerollFx, null);
    const again = applyAction(shuffled, { type: "shuffleLot" }, picker);
    assert.equal(again.cash[picker], 23);
    assert.equal(again.lots[again.lotIndex]?.player.id, next.player.id);
  });

  it("lets a GM pay for only one reroll a night", () => {
    const started = named(startAuction("Alex", "Sam"));
    const seat = started.currentBidder;
    const forced = {
      ...started,
      phase: "unopposed" as const,
      currentBidder: seat,
      choice: 0 as const,
      lotRerolled: false,
      rerollUsed: [false, false] as [boolean, boolean],
    };
    const once = applyAction(forced, { type: "reroll" }, seat);
    assert.equal(once.rerollUsed[seat], true);
    assert.equal(once.lotRerolled, true);
    assert.equal(once.cash[seat], started.cash[seat] - 2);
    const nextLot = {
      ...once,
      phase: "unopposed" as const,
      lotRerolled: false,
      choice: 0 as const,
      currentBidder: seat,
    };
    const twice = applyAction(nextLot, { type: "reroll" }, seat);
    assert.equal(twice.cash[seat], once.cash[seat]);
    assert.equal(twice.lots[twice.lotIndex]?.player.id, nextLot.lots[nextLot.lotIndex]?.player.id);
  });

  it("refuses a shuffle after the opening bid", () => {
    const started = named(startAuction("Alex", "Sam"));
    const picker = started.currentBidder;
    const picked = applyAction(started, { type: "selectChoice", index: 0 }, picker);
    const opened = applyAction(picked, { type: "placeBid", amount: 1 }, picker);
    const ids = lotIds([opened.lots[opened.lotIndex]!]);
    const after = applyAction(opened, { type: "shuffleLot" }, opened.currentBidder);
    assert.deepEqual(lotIds([after.lots[after.lotIndex]!]), ids);
  });

  it("reveals auction grades home then away, 1.5s a cell", () => {
    const t0 = 1_000_000;
    assert.equal(auctionShown(t0, t0), 1);
    assert.equal(auctionShown(t0, t0 + 1499), 1);
    assert.equal(auctionShown(t0, t0 + 1500), 2);
    assert.equal(auctionShown(t0, t0 + 11 * 1500), AUCTION_REVEAL_STEPS);
    assert.equal(auctionCellOpen(1, 0, 0), true);
    assert.equal(auctionCellOpen(1, 0, 1), false);
    assert.equal(auctionCellOpen(2, 0, 1), true);
    const empty = [emptyRoster(), emptyRoster()] as [Roster, Roster];
    assert.deepEqual(auctionRunning(empty, 0), [0, 0]);
  });

  it("adds a halftime overall after the last rating, then names the winner", () => {
    assert.equal(auctionExtraSteps([0, 0]), 0);
    assert.equal(auctionExtraSteps([5, 0]), 2);
    assert.equal(auctionExtraSteps([0, -10]), 2);
    assert.equal(auctionBonusOpen(AUCTION_REVEAL_STEPS, [5, 0]), false);
    assert.equal(auctionBonusOpen(AUCTION_REVEAL_STEPS + 1, [5, 0]), true);
    assert.equal(auctionBonusOpen(AUCTION_REVEAL_STEPS + 1, [0, 0]), false);
    assert.equal(auctionRevealDone(AUCTION_REVEAL_STEPS, [0, 0]), true);
    assert.equal(auctionRevealDone(AUCTION_REVEAL_STEPS, [5, 0]), false);
    assert.equal(auctionRevealDone(AUCTION_REVEAL_STEPS + 1, [5, 0]), false);
    assert.equal(auctionRevealDone(AUCTION_REVEAL_STEPS + 2, [5, 0]), true);
    const t0 = 1_000_000;
    assert.equal(auctionShown(t0, t0 + 12 * 1500, 2), AUCTION_REVEAL_STEPS + 1);
    assert.equal(auctionShown(t0, t0 + 13 * 1500, 2), AUCTION_REVEAL_STEPS + 2);
  });

  it("keeps the second GM on results until they also rematch", () => {
    const done = { ...named(startAuction("Alex", "Sam")), phase: "results" as const };
    const first = applyAction(done, { type: "rematch" }, 0);
    assert.equal(first.phase, "results");
    assert.deepEqual(first.rematchReady, [true, false]);
    const backed = applyAction(first, { type: "cancelRematch" }, 0);
    assert.deepEqual(backed.rematchReady, [false, false]);
    const againFirst = applyAction(backed, { type: "rematch" }, 0);
    const dealt = applyAction(againFirst, { type: "rematch" }, 1);
    assert.notEqual(dealt.phase, "results");
    assert.equal(dealt.names[0], "Alex");
    assert.equal(dealt.names[1], "Sam");
    assert.deepEqual(dealt.rematchReady, [false, false]);
  });

  it("opens a four-box draw after six lots and applies both picks", () => {
    let state = named(startAuction("Alex", "Sam"));
    let steps = 0;
    while (state.phase !== "halftime") {
      if (++steps > 80) throw new Error(`stuck in ${state.phase}`);
      if (state.phase === "sold") {
        state = applyAction(state, { type: "advance" });
        continue;
      }
      if (state.phase === "unopposed") {
        const picked = applyAction(state, { type: "selectChoice", index: 0 }, state.currentBidder);
        state = applyAction(picked, { type: "claim" }, state.currentBidder);
        continue;
      }
      const opened = openMin(state);
      state = applyAction(opened, { type: "pass" }, opened.currentBidder);
    }
    assert.equal(state.sales.length, 6);
    assert.ok(state.halftime);
    assert.equal(state.halftime.boxes[0].length, 4);
    assert.equal(state.halftime.boxes[1].length, 4);
    assert.equal(HALFTIME_BAG.filter((p) => p.kind === "nothing").length, 5);
    assert.equal(HALFTIME_BAG.filter((p) => p.kind === "cash" && p.amount > 0).length, 4);
    assert.equal(HALFTIME_BAG.filter((p) => p.kind === "cash" && p.amount < 0).length, 3);
    assert.equal(HALFTIME_BAG.filter((p) => p.kind === "reroll").length, 1);
    assert.deepEqual(
      HALFTIME_BAG.filter((p) => p.kind === "points").map((p) => p.amount).sort((a, b) => a - b),
      [-3, -1, 3, 5],
    );

    const forced = {
      ...state,
      cash: [10, 10] as [number, number],
      bonus: [0, 0] as [number, number],
      freeRerolls: [0, 0] as [number, number],
      halftime: {
        boxes: [
          [
            { kind: "cash" as const, amount: 5 },
            { kind: "nothing" as const, amount: 0 },
            { kind: "points" as const, amount: 3 },
            { kind: "reroll" as const, amount: 1 },
          ],
          [
            { kind: "cash" as const, amount: -2 },
            { kind: "nothing" as const, amount: 0 },
            { kind: "points" as const, amount: -1 },
            { kind: "nothing" as const, amount: 0 },
          ],
        ] as [Prize[], Prize[]],
        picks: [null, null] as [number | null, number | null],
        applied: false,
        ready: [false, false] as [boolean, boolean],
      },
    };
    const after0 = applyAction(forced, { type: "pickBox", index: 0 }, 0);
    assert.equal(after0.halftime?.picks[0], 0);
    assert.equal(after0.halftime?.applied, false);
    const after1 = applyAction(after0, { type: "pickBox", index: 0 }, 1);
    assert.equal(after1.halftime?.applied, true);
    assert.equal(after1.cash[0], 15);
    assert.equal(after1.cash[1], 8);
    const afterReroll = applyAction(forced, { type: "pickBox", index: 3 }, 0);
    const done = applyAction(afterReroll, { type: "pickBox", index: 2 }, 1);
    assert.equal(done.freeRerolls[0], 1);
    assert.equal(done.bonus[1], -1);
    const nextLot = applyAction(done, { type: "advance" });
    assert.notEqual(nextLot.phase, "halftime");
    assert.equal(nextLot.lotIndex, 6);
    const wait = applyAction(done, { type: "advance" }, 0);
    assert.equal(wait.phase, "halftime");
    assert.deepEqual(wait.halftime?.ready, [true, false]);
    const both = applyAction(wait, { type: "advance" }, 1);
    assert.notEqual(both.phase, "halftime");
    assert.equal(both.lotIndex, 6);
  });

  it("refunds a mystery-box take that would strand a GM and issues a 10-point loan", () => {
    let state = named(startAuction("Alex", "Sam"));
    let steps = 0;
    while (state.phase !== "halftime") {
      if (++steps > 80) throw new Error(`stuck in ${state.phase}`);
      if (state.phase === "sold") {
        state = applyAction(state, { type: "advance" });
        continue;
      }
      if (state.phase === "unopposed") {
        const picked = applyAction(state, { type: "selectChoice", index: 0 }, state.currentBidder);
        state = applyAction(picked, { type: "claim" }, state.currentBidder);
        continue;
      }
      const opened = openMin(state);
      state = applyAction(opened, { type: "pass" }, opened.currentBidder);
    }
    const seat = emptyCount(state.rosters[0]) >= emptyCount(state.rosters[1]) ? 0 : 1;
    const other = seat === 0 ? 1 : 0;
    const need = emptyCount(state.rosters[seat]);
    assert.ok(need >= 1);
    const hit = -Math.min(3, need);
    const forced = {
      ...state,
      cash: seat === 0 ? [need, 20] as [number, number] : [20, need] as [number, number],
      bonus: [0, 0] as [number, number],
      loans: [],
      halftime: {
        boxes: [
          seat === 0
            ? [
                { kind: "cash" as const, amount: hit },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
              ]
            : [
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
              ],
          seat === 1
            ? [
                { kind: "cash" as const, amount: hit },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
              ]
            : [
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
                { kind: "nothing" as const, amount: 0 },
              ],
        ] as [Prize[], Prize[]],
        picks: [null, null] as [number | null, number | null],
        applied: false,
        ready: [false, false] as [boolean, boolean],
      },
    };
    const after0 = applyAction(forced, { type: "pickBox", index: 0 }, 0);
    const after1 = applyAction(after0, { type: "pickBox", index: 0 }, 1);
    assert.equal(after1.halftime?.applied, true);
    assert.equal(after1.cash[seat], need);
    assert.equal(after1.bonus[seat], -10);
    assert.equal(after1.loans.length, 1);
    assert.equal(after1.loans[0]?.seat, seat);
    assert.ok((after1.loans[0]?.taken ?? 0) > 0);
    assert.equal(after1.bonus[other], 0);
    assert.equal(after1.cash[other], 20);
  });

  it("floors cash at zero and keeps overall points signed", () => {
    assert.deepEqual(applyPrize(1, 0, 0, { kind: "cash", amount: -3 }), {
      cash: 0,
      bonus: 0,
      freeRerolls: 0,
    });
    assert.deepEqual(applyPrize(10, 2, 0, { kind: "points", amount: -3 }), {
      cash: 10,
      bonus: -1,
      freeRerolls: 0,
    });
    assert.deepEqual(applyPrize(8, 0, 0, { kind: "reroll", amount: 1 }), {
      cash: 8,
      bonus: 0,
      freeRerolls: 1,
    });
    const nothing = bagLegend().find((row) => row.prize.kind === "nothing");
    assert.equal(nothing?.count, 5);
    assert.equal(prizeLabel({ kind: "nothing", amount: 0 }), "Empty");
  });

  it("keeps unopened slips sealed until both GMs have picked", () => {
    const forced = {
      phase: "halftime" as const,
      cash: [10, 10] as [number, number],
      bonus: [0, 0] as [number, number],
      freeRerolls: [0, 0] as [number, number],
      names: ["Alex", "Sam"] as [string, string],
      halftime: {
        boxes: [
          [
            { kind: "cash" as const, amount: 5 },
            { kind: "nothing" as const, amount: 0 },
            { kind: "points" as const, amount: 3 },
            { kind: "reroll" as const, amount: 1 },
          ],
          [
            { kind: "cash" as const, amount: -2 },
            { kind: "nothing" as const, amount: 0 },
            { kind: "points" as const, amount: -1 },
            { kind: "cash" as const, amount: 2 },
          ],
        ] as [Prize[], Prize[]],
        picks: [null, null] as [number | null, number | null],
        applied: false,
        ready: [false, false] as [boolean, boolean],
      },
    };
    const hidden = redactHalftime(forced).halftime;
    assert.equal(hidden?.boxes[0][0]?.kind, "sealed");
    assert.equal(hidden?.boxes[1][3]?.kind, "sealed");
    const after0 = applyAction(forced as never, { type: "pickBox", index: 0 }, 0);
    const redacted = redactHalftime(after0).halftime;
    assert.equal(redacted?.picks[0], 0);
    assert.equal(redacted?.boxes[0][0]?.kind, "sealed");
    assert.equal(redacted?.boxes[0][1]?.kind, "sealed");
    assert.equal(redacted?.boxes[1][0]?.kind, "sealed");
    const after1 = applyAction(after0, { type: "pickBox", index: 3 }, 1);
    assert.equal(after1.halftime?.applied, true);
    const shown = redactHalftime(after1).halftime;
    assert.equal(shown?.boxes[0][1]?.kind, "nothing");
    assert.equal(shown?.boxes[1][3]?.kind, "cash");
  });
});

describe("lot pairs", () => {
  it("deals twelve same-position pairs with twenty-four unique names", () => {
    const lots = buildLots();
    assert.equal(lots.length, 12);
    const ids = new Set<string>();
    for (const lot of lots) {
      assert.equal(lot.player.position, lot.slot);
      assert.equal(lot.other.position, lot.slot);
      assert.notEqual(lot.player.id, lot.other.id);
      ids.add(lot.player.id);
      ids.add(lot.other.id);
    }
    assert.equal(ids.size, 24);
  });

  it("skips last night's names when avoiding them", () => {
    const first = buildLots();
    const avoid = lotIds(first);
    const second = buildLots(avoid);
    assert.equal(second.length, 12);
    const reused = lotIds(second).filter((id) => avoid.includes(id));
    assert.deepEqual(reused, []);
  });

  it("gives every listed name a real shot instead of locking the first and last at each position", () => {
    const seen = new Map<string, number>();
    for (const player of PLAYERS) seen.set(player.id, 0);
    const nights = 800;
    for (let i = 0; i < nights; i++) {
      for (const lot of buildLots()) {
        seen.set(lot.player.id, (seen.get(lot.player.id) ?? 0) + 1);
        seen.set(lot.other.id, (seen.get(lot.other.id) ?? 0) + 1);
      }
    }
    const missing = PLAYERS.filter((player) => (seen.get(player.id) ?? 0) === 0).map((p) => p.name);
    assert.deepEqual(missing, []);
    const qbs = PLAYERS.filter((p) => p.position === "QB").sort(
      (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
    );
    const first = seen.get(qbs[0]!.id) ?? 0;
    const second = seen.get(qbs[1]!.id) ?? 0;
    const last = seen.get(qbs[qbs.length - 1]!.id) ?? 0;
    assert.ok(first < nights * 0.2, `top QB dealt ${first}/${nights}`);
    assert.ok(last < nights * 0.2, `last QB dealt ${last}/${nights}`);
    const ratio = Math.max(first, second) / Math.max(1, Math.min(first, second));
    assert.ok(ratio < 4, `QB #1 vs #2 deal ratio ${ratio.toFixed(2)} (${first} vs ${second})`);
  });
});

describe("series", () => {
  it("tallies the night on results and carries the record into a rematch", () => {
    const started = named(startAuction("Alex", "Sam"));
    const lot = started.lots[0];
    assert.ok(lot);
    const sold: GameState = {
      ...started,
      phase: "sold",
      lotIndex: started.lots.length - 1,
      lastSale: { lot, seat: 0, price: 1, unopposed: false },
      rosters: [{ ...emptyRoster(), QB: lot }, emptyRoster()],
      cash: [8, 12],
      series: [1, 0],
      nights: 1,
      bonus: [0, 0],
    };
    const results = applyAction(sold, { type: "advance" });
    assert.equal(results.phase, "results");
    assert.equal(results.nights, 2);
    assert.deepEqual(results.series, [2, 0]);
    assert.equal(nightWinner(sold.rosters, sold.bonus, sold.cash), 0);
    const hosted = hostedMatchView(results);
    assert.ok(hosted);
    assert.equal(hosted.kind, "auction");
    assert.equal(hosted.winner, 0);
    assert.deepEqual(hosted.series, [1, 0]);
    assert.equal(hosted.scores[0] > hosted.scores[1], true);
    const oneSided = hostedMatchView({
      ...results,
      userIds: ["user-signed-in", null],
    });
    assert.ok(oneSided);
    assert.equal(oneSided.winner, 0);
    assert.equal(oneSided.userIds[0], "user-signed-in");
    assert.equal(oneSided.userIds[1], null);
    assert.deepEqual(historyLineScore("elimination", 1, 496, 554, 1, 3), [1, 3]);
    assert.deepEqual(historyLineScore("elimination", 1, 496, 554, null, null), [0, 1]);
    assert.deepEqual(historyLineScore("auction", 1, 535, 543, 0, 1), [535, 543]);
    assert.equal(walletBalance(1, ["poor"], 0), WIN_PAY);
    assert.equal(walletBalance(4, ["poor", "holy"], 0), 4 * WIN_PAY - BOX_COST);

    const again = applyAction(results, { type: "rematch" });
    assert.notEqual(again.phase, "results");
    assert.deepEqual(again.series, [2, 0]);
    assert.equal(again.nights, 2);
    const previous = new Set(lotIds(results.lots));
    for (const id of lotIds(again.lots)) {
      assert.equal(previous.has(id), false, `rematch reused ${id}`);
    }
  });

  it("breaks a grade tie on leftover cash", () => {
    const lot = buildLots()[0];
    assert.ok(lot);
    const rosters: [Roster, Roster] = [
      { ...emptyRoster(), QB: lot },
      { ...emptyRoster(), QB: lot },
    ];
    assert.equal(nightWinner(rosters, [0, 0], [3, 7]), 1);
    assert.equal(nightWinner(rosters, [2, 0], [0, 9]), 0);
    assert.equal(nightWinner(rosters, [0, 0], [4, 4]), null);
  });
});

describe("rerollCinematicKind", () => {
  it("fires upgrade when the replacement grades higher", () => {
    assert.equal(rerollCinematicKind(84, 91), "upgrade");
  });

  it("fires bust when the replacement grades lower", () => {
    assert.equal(rerollCinematicKind(88, 70), "bust");
  });

  it("stays quiet on a wash", () => {
    assert.equal(rerollCinematicKind(85, 85), null);
  });
});

describe("cinematicFromTransition", () => {
  it("plays for a joiner who was already in unopposed when seq ticks", () => {
    const prev = { phase: "unopposed", rerollFx: null, discards: [] };
    const next = {
      phase: "unopposed",
      rerollFx: { seq: 1, before: 90, after: 70, at: Date.now() },
      discards: [{ player: { rating: 90 }, kept: { rating: 70 } }],
    };
    assert.equal(cinematicFromTransition(prev, next), "bust");
  });

  it("plays an upgrade when the replacement grades higher", () => {
    const prev = { phase: "unopposed", rerollFx: null, discards: [] };
    const next = {
      phase: "unopposed",
      rerollFx: { seq: 1, before: 82, after: 94, at: Date.now() },
      discards: [{ player: { rating: 82 }, kept: { rating: 94 } }],
    };
    assert.equal(cinematicFromTransition(prev, next), "upgrade");
  });

  it("falls back to discards if rerollFx is missing on the wire", () => {
    const prev = { phase: "unopposed", rerollFx: null, discards: [] };
    const next = {
      phase: "unopposed",
      rerollFx: null,
      discards: [{ player: { rating: 88 }, kept: { rating: 70 } }],
    };
    assert.equal(cinematicFromTransition(prev, next), "bust");
  });

  it("does not replay a stale reroll when hydrating from setup", () => {
    const prev = { phase: "setup", rerollFx: null, discards: [] };
    const next = {
      phase: "unopposed",
      rerollFx: { seq: 1, before: 90, after: 70, at: Date.now() - 60_000 },
      discards: [{ player: { rating: 90 }, kept: { rating: 70 } }],
    };
    assert.equal(cinematicFromTransition(prev, next), null);
  });
});

describe("consumeRerollFx", () => {
  it("plays a new seq for a live client even if the stamp is a bit old", () => {
    const fx = { seq: 2, before: 80, after: 94, at: Date.now() - 12_000 };
    assert.equal(consumeRerollFx(1, fx, Date.now(), false).kind, "upgrade");
  });

  it("skips history when hydrating a stale seq", () => {
    const fx = { seq: 1, before: 90, after: 70, at: Date.now() - 60_000 };
    const got = consumeRerollFx(0, fx, Date.now(), true);
    assert.equal(got.kind, null);
    assert.equal(got.seq, 1);
  });

  it("does not re-fire the same seq", () => {
    const fx = { seq: 1, before: 80, after: 70, at: Date.now() };
    assert.equal(consumeRerollFx(1, fx).kind, null);
  });
});

describe("player pool", () => {
  it("keeps at least 200 unique 80-plus names in the dark", () => {
    assert.ok(PLAYERS.length >= 200, `pool is ${PLAYERS.length}`);
  });

  it("gives each name one career card, not a team-era slice", () => {
    const names = PLAYERS.map((p) => p.name);
    assert.equal(new Set(names).size, names.length);
    const brady = PLAYERS.find((p) => p.name === "Tom Brady");
    assert.ok(brady);
    assert.equal(brady.years, "2000–2022");
    assert.equal(brady.team, "NE");
    assert.deepEqual(brady.teams, ["NE", "TB"]);
    const kelce = PLAYERS.find((p) => p.name === "Travis Kelce");
    assert.ok(kelce, "Travis Kelce should be in the pool");
    assert.equal(kelce.position, "TE");
    assert.equal(kelce.team, "KC");
    assert.ok(kelce.rating >= 93, `Kelce ${kelce.rating}`);
    const fitz = PLAYERS.find((p) => p.name === "Larry Fitzgerald");
    assert.ok(fitz);
    assert.equal(fitz.years, "2004–2020");
    const gates = PLAYERS.find((p) => p.name === "Antonio Gates");
    assert.ok(gates);
    assert.equal(gates.years, "2003–2018");
  });

  it("rates players on their best PPR season, not career pile", () => {
    const cmc = PLAYERS.find((p) => p.name === "Christian McCaffrey");
    const puka = PLAYERS.find((p) => p.name === "Puka Nacua");
    const brady = PLAYERS.find((p) => p.name === "Tom Brady");
    const jeanty = PLAYERS.find((p) => p.name === "Ashton Jeanty");
    assert.ok(cmc && puka && brady && jeanty);
    assert.equal(cmc.peakYear, 2019);
    assert.ok(cmc.rating >= 96, `CMC ${cmc.rating}`);
    assert.ok(puka.rating >= 93, `Puka ${puka.rating}`);
    assert.ok(brady.rating <= 94, `Brady ${brady.rating}`);
    assert.ok(jeanty.rating >= 85, `Jeanty ${jeanty.rating}`);
    assert.equal(ratingFromPpr("RB", 471.2), 97);
    assert.equal(ratingFromPpr("WR", 439.5), 97);
    assert.equal(ratingFromPpr("TE", 330.9), 97);
    const missing = PLAYERS.filter((p) => !p.peakYear).map((p) => p.name);
    assert.equal(missing.length, 0, `no best-season for ${missing.join(", ")}`);
    const noTeams = PLAYERS.filter((p) => !p.teams?.length).map((p) => p.name);
    assert.equal(noTeams.length, 0, `no franchise marks for ${noTeams.join(", ")}`);
  });

  it("keeps last-decade legends with their actual peak year", () => {
    const peaks: [string, number, number][] = [
      ["Eli Manning", 2015, 83],
      ["Carson Palmer", 2015, 85],
      ["Robert Griffin III", 2012, 86],
      ["Marshawn Lynch", 2014, 89],
      ["Jamaal Charles", 2013, 93],
      ["Chris Johnson", 2009, 94],
      ["Arian Foster", 2010, 94],
      ["Steve Smith", 2005, 92],
      ["Josh Gordon", 2013, 90],
      ["Brandon Marshall", 2015, 92],
      ["Ben Roethlisberger", 2018, 88],
      ["Le'Veon Bell", 2014, 93],
      ["Jordy Nelson", 2014, 91],
      ["Mike Evans", 2016, 90],
      ["Russell Wilson", 2020, 90],
      ["Antonio Brown", 2014, 94],
      ["Adrian Peterson", 2012, 92],
    ];
    for (const [name, year, minRating] of peaks) {
      const player = PLAYERS.find((p) => p.name === name);
      assert.ok(player, `missing ${name}`);
      assert.equal(player.peakYear, year, `${name} peak ${player.peakYear} != ${year}`);
      assert.ok(player.rating >= minRating, `${name} ${player.rating} < ${minRating}`);
    }
  });

  it("only lists players who took a snap in 2016 or later", () => {
    const tooOld = PLAYERS.filter((p) => {
      const end = p.years.includes("present") ? 2026 : Number(p.years.match(/(\d{4})\s*$/)?.[1] ?? 0);
      return end < 2016;
    }).map((p) => `${p.name} (${p.years})`);
    assert.equal(tooOld.length, 0, `pre-2016 careers: ${tooOld.join(", ")}`);
  });
});

describe("match lobby listings", () => {
  it("marks a waiting room as open", () => {
    const state = lobbyState("Pat", "ninja", "user-pat", "auction");
    const row = listingFromRoom("ABCD", state, null);
    assert.ok(row);
    assert.equal(row.open, true);
    assert.equal(row.joinable, false);
    assert.equal(row.watchable, false);
    assert.equal(row.host, "Pat");
    assert.equal(row.guest, null);
    assert.equal(row.kind, "auction");
    assert.deepEqual(row.series, [0, 0]);
  });

  it("lets public lobby hosts be joined from the list", () => {
    const state = lobbyState("Pat", "ninja", "user-pat", "elimination", true);
    const row = listingFromRoom("PUB1", state, null);
    assert.ok(row);
    assert.equal(row.open, true);
    assert.equal(row.joinable, true);
    assert.equal(row.watchable, false);
  });

  it("shows the guest when the seat is taken", () => {
    const started = startAuction("Pat", "Ty", {
      avatars: ["ninja", "pharaoh"],
      userIds: ["a", "b"],
    });
    const row = listingFromRoom("WXYZ", started, "guest-token");
    assert.ok(row);
    assert.equal(row.open, false);
    assert.equal(row.joinable, false);
    assert.equal(row.watchable, true);
    assert.equal(row.host, "Pat");
    assert.equal(row.guest, "Ty");
    assert.deepEqual(row.series, [0, 0]);
  });

  it("still lists a private invite match while it is being played", () => {
    const waiting = lobbyState("Pat", "ninja", "u0", "auction", false);
    assert.equal(listingFromRoom("PRIV", waiting, null)?.joinable, false);
    assert.equal(listingFromRoom("PRIV", waiting, null)?.watchable, false);
    const started = startAuction("Pat", "Ty", {
      avatars: ["ninja", "pharaoh"],
      userIds: ["a", "b"],
    });
    const row = listingFromRoom("PRIV", { ...started, publicJoin: false }, "guest-token");
    assert.ok(row);
    assert.equal(row.open, false);
    assert.equal(row.joinable, false);
    assert.equal(row.watchable, true);
    assert.equal(row.host, "Pat");
    assert.equal(row.guest, "Ty");
  });

  it("prints live scores leader-first like history", () => {
    assert.equal(liveSeriesScore([0, 0]), "0–0");
    assert.equal(liveSeriesScore([2, 1]), "2–1");
    assert.equal(liveSeriesScore([1, 2]), "2–1");
    const trailing = listingFromRoom(
      "SER1",
      { ...startAuction("Pat", "Ty"), series: [1, 2] },
      "guest-token",
    );
    assert.ok(trailing);
    assert.deepEqual(trailing.series, [1, 2]);
    assert.equal(liveSeriesScore(trailing.series), "2–1");
  });

  it("hides finished matches", () => {
    const started = startAuction("Pat", "Ty");
    const row = listingFromRoom("DONE", { ...started, phase: "results" }, "guest-token");
    assert.equal(row, null);
  });

  it("counts a lobby join as an official hosted match", () => {
    const waiting = listingFromRoom("JOIN1", lobbyState("Pat", "ninja", "u0", "auction"), null);
    assert.ok(waiting?.open);
    const planned = planHostedNightWrite(
      {
        roomCode: waiting.code,
        token: "guest-token",
        seat: 1,
        nights: 1,
        kind: waiting.kind,
        won: true,
        score: 400,
        opponentScore: 380,
        lowScore: 400,
        opponentName: waiting.host,
        gmName: "Ty",
      },
      null,
    );
    assert.ok(planned);
    assert.equal(planned.nightKey, hostedNightKey("JOIN1", 1, "auction", 1));
    assert.equal(planned.won, true);
  });
});

describe("hosted night write", () => {
  const client = {
    roomCode: "ABCD",
    token: "seat-token",
    seat: 0 as const,
    nights: 3,
    kind: "auction" as const,
    won: true as boolean | null,
    score: 540,
    opponentScore: 500,
    lowScore: 540,
    opponentName: "Ty",
    gmName: "Pat",
  };

  it("still writes after the live room is gone", () => {
    const planned = planHostedNightWrite(client, null);
    assert.ok(planned);
    assert.equal(planned.nightKey, hostedNightKey("ABCD", 3, "auction", 0));
    assert.equal(planned.won, true);
    assert.equal(planned.score, 540);
    assert.equal(planned.opponentName, "Ty");
  });

  it("does not write a one-phone match", () => {
    assert.equal(planHostedNightWrite({ ...client, roomCode: "", token: "" }, null), null);
  });

  it("prefers the server result when the room is still up", () => {
    const planned = planHostedNightWrite(client, {
      seat: 1,
      names: ["Pat", "Ty"],
      kind: "elimination",
      won: false,
      score: 120,
      opponentScore: 140,
      lowScore: 61,
      nights: 1,
    });
    assert.ok(planned);
    assert.equal(planned.nightKey, hostedNightKey("ABCD", 1, "elimination", 1));
    assert.equal(planned.won, false);
    assert.equal(planned.score, 120);
    assert.equal(planned.lowScore, 61);
    assert.equal(planned.kind, "elimination");
  });
});

describe("career book keys", () => {
  it("groups opponents by lowercase name", () => {
    assert.equal(opponentKey("Alex"), opponentKey(" alex "));
  });

  it("drops placeholder GM names so a real name can land on the board", () => {
    assert.equal(clipDisplayName("GM"), "");
    assert.equal(clipDisplayName("  "), "");
    assert.equal(clipDisplayName("Pat"), "Pat");
  });

  it("locks the bank watch to Pat only", () => {
    assert.equal(isBankCommish("Pat"), true);
    assert.equal(isBankCommish(" pastry pat "), true);
    assert.equal(isBankCommish("Ty"), false);
    assert.equal(isBankCommish("Marquis Scott"), false);
  });

  it("makes remounts of the same night collide", () => {
    const input = {
      names: ["Alex", "Sam"] as [string, string],
      nights: 2,
      scores: [512, 498] as [number, number],
      series: [2, 0] as [number, number],
      saleIds: ["a", "b"],
    };
    assert.equal(nightKey(input), nightKey(input));
    assert.notEqual(nightKey(input), nightKey({ ...input, nights: 3 }));
    assert.notEqual(nightKey(input), nightKey({ ...input, kind: "elimination" }));
  });

  it("parses ranking board tabs", () => {
    assert.equal(parseRankTab("elimination"), "elimination");
    assert.equal(parseRankTab("auction"), "auction");
    assert.equal(parseRankTab("daily"), "daily");
    assert.equal(parseRankTab("score"), "score");
    assert.equal(parseRankTab("stars"), "stars");
    assert.equal(parseRankTab("weekly"), "weekly");
    assert.equal(parseRankTab("nope"), undefined);
  });
});

describe("avatars", () => {
  it("starts broke and unlocks from the closet, not win totals", () => {
    assert.deepEqual(parseOwned(null), ["poor"]);
    assert.deepEqual(parseOwned('["farmer","holy"]'), ["poor", "farmer", "holy"]);
    assert.equal(isUnlocked("poor", ["poor"]), true);
    assert.equal(isUnlocked("holy", ["poor"]), false);
    assert.equal(isUnlocked("holy", ["poor", "holy-red"]), true);
    assert.equal(isUnlocked("farmer", ["poor", "farmer"]), true);
    assert.equal(clampAvatar("farmer", ["poor"]), "poor");
    assert.equal(clampAvatar("farmer", ["poor", "farmer"]), "farmer");
    assert.equal(walletBalance(5, ["poor"]), 5);
    assert.equal(walletBalance(5, ["poor", "farmer"]), 2);
    assert.equal(walletBalance(1, ["poor", "farmer"]), 0);
    assert.equal(walletBalance(0, ["poor"], 30), 30);
    assert.equal(walletBalance(0, ["poor", "farmer"], 30), 27);
    assert.equal(walletBalance(31, ["poor"], -30), 1);
    const prize = pickPrize(["poor"]);
    assert.ok(prize && prize !== "poor");
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i += 1) {
      const hit = pickPrize(["poor"], `spread:${i}`);
      assert.ok(hit);
      counts.set(hit, (counts.get(hit) ?? 0) + 1);
    }
    assert.ok(counts.size >= 18, `mystery box collapsed to ${counts.size} looks`);
    const top = Math.max(...counts.values());
    assert.ok(top < 80, `one look won ${top} of 400 rolls`);
    assert.equal(walletBalance(100, ["poor", "golden"]), 100 * WIN_PAY - GOLDEN_COST);
    assert.equal(walletBalance(5, ["poor", "foam", "king"]), 5);
    assert.equal(walletBalance(5, ["poor", "club200"]), 5);
    assert.equal(walletBalance(5, ["poor", "peeping"]), 5);
    assert.equal(walletBalance(5, ["poor", "banana", "crossword", "thanos", "boxaddict", "commish", "jail"]), 5);
    assert.equal(walletBalance(5, ["poor", "crypepe", "joker"]), 5);
    assert.equal(walletBalance(5, ["poor", "lockedin", "sniper", "silvermedal", "8ball", "ghostpepe"]), 5);
    assert.equal(pickPrize(["poor"], "club") === "club200", false);
    assert.equal(pickPrize(["poor"], "peep") === "peeping", false);
    assert.equal(pickPrize(["poor"], "nana") === "banana", false);
    assert.equal(avatarById("banana").name, "Trash Can");
    assert.equal(BANANA_SCORE_UNDER, 60);
    assert.equal(hitBananaScore(59.9), true);
    assert.equal(hitBananaScore(60), false);
    assert.equal(hitBananaScore(0), true);
    assert.equal(lookSource("poor"), "Starting look");
    assert.equal(lookSource("golden"), "From the Store");
    assert.equal(lookSource("dj"), "From Daily Unlock, 3 ★");
    assert.equal(lookSource("doubledonut"), "From Achievement: Start two or more players who score 0 in a Daily or Weekly Match.");
    assert.equal(lookSource("negative"), "From Achievement: Start a player who finishes with negative points in a Daily Match.");
    assert.equal(lookSource("farmer"), "From the Mystery Box");
    assert.equal(lookSource("crypepe"), "From a scratch ticket");
    assert.equal(lookSource("joker"), "From a scratch ticket");
    assert.equal(lookSource("not-a-look"), null);
    assert.equal(justUnlockedBanana(["poor"], ["poor", "banana"]), true);
    assert.equal(justUnlockedBanana(["poor", "banana"], ["poor", "banana"]), false);
    assert.equal(justUnlockedBanana(["poor"], ["poor", "jail"]), false);
    assert.equal(justUnlockedScratchLook(["poor"], ["poor", "crypepe"]), "crypepe");
    assert.equal(justUnlockedScratchLook(["poor", "crypepe"], ["poor", "crypepe"]), null);
    assert.equal(justUnlockedScratchLook(["poor"], ["poor", "joker"]), "joker");
    assert.equal(justUnlockedScratchLook(["poor", "joker"], ["poor", "joker"]), null);
    assert.equal(justUnlockedScratchLook(["poor", "jail"], ["poor", "jail"]), null);
    assert.equal(pickPrize(["poor"], "cross") === "crossword", false);
    assert.equal(pickPrize(["poor"], "snap") === "thanos", false);
    assert.equal(pickPrize(["poor"], "boxes") === "boxaddict", false);
    assert.equal(pickPrize(["poor"], "czar") === "commish", false);
    assert.equal(pickPrize(["poor"], "bars") === "jail", false);
    assert.equal(pickPrize(["poor"], "eight") === "8ball", false);
    assert.equal(pickPrize(["poor"], "ghost") === "ghostpepe", false);
    assert.equal(pickPrize(["poor"], "lockin") === "lockedin", false);
    assert.equal(pickPrize(["poor"], "snipe") === "sniper", false);
    assert.equal(pickPrize(["poor"], "cry") === "crypepe", false);
    assert.equal(pickPrize(["poor"], "joke") === "joker", false);
    const ownedAll = parseOwned(JSON.stringify(["poor", ...PRIZE_AVATARS.map((avatar) => avatar.id)]));
    assert.equal(pickPrize(ownedAll), null);
    assert.equal(
      PRIZE_AVATARS.some((avatar) =>
        ["club200", "peeping", "banana", "crossword", "thanos", "boxaddict", "commish", "jail", "8ball", "ghostpepe", "lockedin", "sniper", "silvermedal", "crypepe", "joker", "doubletrouble", "bullseye", "rainyday", "earlybird", "heavyhitter", "lost", "vegas", "nightowl", "comebackkid", "freefall", "boxlunch", "doubledonut", "lumpedup", "negative"].includes(avatar.id),
      ),
      false,
    );
    for (const id of ["referee", "turf", "cone", "gatorade", "mascot", "otcoin", "robot", "tornado", "chilipepper", "mafia", "jacked", "inflated", "electrocuted", "spider", "butler", "football", "luchador", "tailgater", "broadcast", "rubberduck"]) {
      assert.equal(PRIZE_AVATARS.some((avatar) => avatar.id === id), true, id);
    }
    assert.equal(boxPoolOwnedCount(["poor", "banana", "crossword", "thanos", "boxaddict", "club200", "peeping", "commish", "jail"]), 0);
    assert.equal(boxPoolOwnedCount(["poor", "farmer", "farmer", "banana"]), 1);
    const twentyFour = PRIZE_AVATARS.slice(0, BOX_ADDICT_POOL_NEED - 1).map((avatar) => avatar.id);
    const twentyFive = PRIZE_AVATARS.slice(0, BOX_ADDICT_POOL_NEED).map((avatar) => avatar.id);
    assert.equal(hitBoxAddict(["poor", ...twentyFour, "banana"]), false);
    assert.equal(hitBoxAddict(["poor", ...twentyFive]), true);
    assert.equal(longestDayStreak(["2026-09-01", "2026-09-02", "2026-09-03"]), 3);
    assert.equal(
      longestDayStreak([
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
        "2026-09-06",
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
        "2026-09-10",
      ]),
      10,
    );
    assert.equal(longestDayStreak(["2026-09-01", "2026-09-03"]), 1);
    assert.equal(sniperWeekHit([{ userId: "a", score: 120.4 }, { userId: "b", score: 119.6 }], "a"), true);
    assert.equal(sniperWeekHit([{ userId: "a", score: 120.4 }, { userId: "b", score: 119.4 }], "a"), false);
    assert.equal(sniperWeekHit([{ userId: "a", score: 100 }, { userId: "b", score: 100 }], "a"), false);
    assert.equal(
      silverSecondDayCount(
        [
          { day: "2026-09-02", userId: "a", score: 139.6 },
          { day: "2026-09-02", userId: "b", score: 129.1 },
          { day: "2026-09-03", userId: "c", score: 110.8 },
          { day: "2026-09-03", userId: "b", score: 110.2 },
        ],
        "b",
      ),
      2,
    );
  });

  it("tracks Early Bird, Lost, and Heavy Hitter from native days only", () => {
    assert.equal(FEAT_TRACK_FROM, "2026-09-17");
    assert.equal(DOUBLE_DONUT_FROM, "2026-09-23");
    assert.equal(NEGATIVE_FROM, "2026-09-23");
    assert.equal(EARLY_BIRD_NEED, 10);
    assert.equal(NIGHT_OWL_NEED, 10);
    assert.equal(LOST_GAP_DAYS, 10);
    assert.equal(HEAVY_HITTER_PPR, 50);
    assert.equal(FEAT_SCRATCH_POINTS, 50);
    assert.equal(THRIFTY_NEED, 5);
    assert.equal(IRON_BOOT_POINTS, 40);
    assert.equal(featWeekFromW3(2026, 2), false);
    assert.equal(featWeekFromW3(2026, 3), true);
    assert.equal(hitFlashTotal(99.9), false);
    assert.equal(hitFlashTotal(100), true);
    assert.equal(hitFlashTotal(100.04), true);
    assert.equal(thriftyHit([1, 1, 1, 1, 2]), false);
    assert.equal(thriftyHit([1, 1, 1, 1, 1]), true);
    assert.equal(OVERHEAD_FROM, "2026-09-25");
    assert.equal(MIRROR_FROM, "2026-09-25");
    assert.equal(OVERHEAD_SCORE, 150);
    const early = { userId: "a", score: 150, at: 1 };
    const later = { userId: "b", score: 150.1, at: 2 };
    assert.equal(overheadPassed([early, later], "a"), true);
    assert.equal(overheadPassed([early, later], "b"), false);
    assert.equal(overheadPassed([{ userId: "a", score: 149.9, at: 1 }, later], "a"), false);
    assert.equal(
      overheadPassed(
        [
          { userId: "b", score: 160, at: 1 },
          { userId: "a", score: 150, at: 2 },
          { userId: "c", score: 170, at: 3 },
        ],
        "a",
      ),
      false,
    );
    assert.equal(overheadPassed([early, { userId: "b", score: 150, at: 2 }], "a"), false);
    const slots = [
      { slot: "D", id: "d" },
      { slot: "QB", id: "q" },
      { slot: "RB2", id: "r2" },
      { slot: "RB1", id: "r1" },
      { slot: "WR1", id: "w1" },
      { slot: "TE", id: "t" },
      { slot: "K", id: "k" },
      { slot: "WR2", id: "w2" },
    ];
    const flipped = [...slots].reverse();
    assert.equal(lineupSignature(slots), lineupSignature(flipped));
    assert.equal(lineupSignature(slots.slice(0, 7)), null);
    assert.deepEqual(
      mirrorUserIds([
        { userId: "a", signature: "same" },
        { userId: "b", signature: "same" },
        { userId: "c", signature: "other" },
      ]),
      ["a", "b"],
    );
    assert.equal(TWIN_FROM, "2026-09-26");
    assert.deepEqual(
      twinUserIds([
        { userId: "a", score: 100, signature: "one" },
        { userId: "b", score: 100.04, signature: "two" },
      ]),
      ["a", "b"],
    );
    assert.deepEqual(
      twinUserIds([
        { userId: "a", score: 100, signature: "same" },
        { userId: "b", score: 100, signature: "same" },
      ]),
      [],
    );
    assert.deepEqual(
      twinUserIds([
        { userId: "a", score: 100, signature: "one" },
        { userId: "b", score: 100.1, signature: "two" },
        { userId: "c", score: 100, signature: null },
      ]),
      [],
    );
    assert.equal(stampDayGap("2026-09-17", "2026-09-27"), 10);
    assert.equal(lostGapHit("2026-09-17", "2026-09-27"), true);
    assert.equal(lostGapHit("2026-09-16", "2026-09-27"), false);
    assert.equal(lostGapHit("2026-09-17", "2026-09-26"), false);
    assert.equal(isExactZeroScore(0), true);
    assert.equal(isExactZeroScore(0.04), true);
    assert.equal(isNegativeScore(-0.1), true);
    assert.equal(isNegativeScore(-1), true);
    assert.equal(isNegativeScore(0), false);
    assert.equal(isNegativeScore(0.04), false);
    assert.equal(isNegativeScore(-0.04), false);
    assert.equal(isExactZeroScore(0.1), false);
    assert.equal(doubleDonutHit(1), false);
    assert.equal(doubleDonutHit(2), true);
    assert.equal(
      lumpedUpHit([
        { day: "2026-09-15", score: 10 },
        { day: "2026-09-16", score: 10 },
        { day: "2026-09-17", score: 10 },
      ]),
      false,
    );
    assert.equal(
      lumpedUpHit([
        { day: "2026-09-17", score: 99.9 },
        { day: "2026-09-18", score: 0 },
        { day: "2026-09-19", score: 50 },
      ]),
      true,
    );
    assert.equal(
      lumpedUpHit([
        { day: "2026-09-17", score: 40 },
        { day: "2026-09-19", score: 40 },
        { day: "2026-09-20", score: 40 },
      ]),
      false,
    );
    assert.equal(
      lumpedUpHit([
        { day: "2026-09-17", score: 99.9 },
        { day: "2026-09-18", score: 100 },
        { day: "2026-09-19", score: 10 },
      ]),
      false,
    );
    assert.equal(
      weeklyRealZeroCount(
        [
          { id: "a", sid: "1", name: "Zero", vs: "NYJ" },
          { id: "b", sid: "2", name: "Also", vs: "BUF" },
          { id: "c", sid: "3", name: "Bye", vs: "BYE" },
          { id: "d", sid: "4", name: "Missing", vs: "KC" },
          { id: "e", sid: "", name: "Blank", vs: "DAL" },
        ],
        { "1": 0, "2": 0, "3": 0 },
      ),
      2,
    );
    assert.equal(
      weeklyRealZeroCount(
        [
          { id: "a", sid: "1", name: "Final", team: "BAL", vs: "NYJ" },
          { id: "b", sid: "2", name: "Live", team: "MIA", vs: "BUF" },
        ],
        { "1": 0, "2": 0 },
        new Set(["BAL"]),
      ),
      1,
    );
    assert.equal(hitHeavyHitterScore(50), true);
    assert.equal(hitHeavyHitterScore(49.9), false);
    assert.equal(skipHeavyHitterWeek(2026, 1), true);
    assert.equal(skipHeavyHitterWeek(2026, 2), false);
    const rows = [];
    for (let i = 0; i < 10; i += 1) {
      const day = `2026-09-${String(17 + i).padStart(2, "0")}`;
      rows.push({ day, userId: "pat", at: i + 1 });
      rows.push({ day, userId: "ty", at: i + 10 });
    }
    rows.push({ day: "2026-09-16", userId: "pat", at: 0 });
    assert.equal(earlyBirdDayCount("pat", rows), 10);
    assert.equal(earlyBirdDayCount("ty", rows), 0);
    assert.equal(nightOwlDayCount("ty", rows), 10);
    assert.equal(nightOwlDayCount("pat", rows), 0);
    const moved = rows.map((row) =>
      row.day === "2026-09-17" && row.userId === "pat" ? { ...row, at: 99 } : row,
    );
    assert.equal(nightOwlDayCount("ty", moved), 9);
    assert.equal(nightOwlDayCount("pat", moved), 1);
    assert.equal(avatarById("earlybird").name, "Early Bird");
    assert.equal(avatarById("nightowl").name, "Night Owl");
    assert.equal(avatarById("heavyhitter").name, "Heavy Hitter");
    assert.equal(avatarById("lost").name, "Lost");
    assert.equal(avatarById("vegas").name, "Vegas");
    assert.equal(pickPrize(["poor"], "early") === "earlybird", false);
    assert.equal(pickPrize(["poor"], "heavy") === "heavyhitter", false);
    assert.equal(pickPrize(["poor"], "lostp") === "lost", false);
    assert.equal(pickPrize(["poor"], "vegas") === "vegas", false);
    assert.equal(pickPrize(["poor"], "owl") === "nightowl", false);
    assert.equal(comebackKidHit(["a"], ["a"], "a"), true);
    assert.equal(comebackKidHit(["a"], ["b"], "a"), false);
    assert.equal(freeFallHit(["a"], ["a"], "a"), true);
    assert.equal(freeFallHit(["a"], ["b"], "a"), false);
    assert.equal(avatarById("comebackkid").name, "Comeback Kid");
    assert.equal(avatarById("freefall").name, "Free Fall");
    assert.equal(avatarById("boxlunch").name, "Box Lunch");
    assert.equal(pickPrize(["poor"], "come") === "comebackkid", false);
    assert.equal(pickPrize(["poor"], "fall") === "freefall", false);
    assert.equal(pickPrize(["poor"], "lunch") === "boxlunch", false);
  });
});
