import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "./engine";
import { ELIM_SLOTS, playableWeeks } from "./elim-data";
import { flushElimDraft, legalElimPicks, maxElimCost, remainingAfter } from "./elim";
import {
  DAILY_LAUNCH,
  autoFillDailyPicks,
  canViewDailyLineup,
  dailyAutoBudgetMs,
  dailyDayStamp,
  dailyScorePays,
  dailyYesterday,
  hydrateDailyPicks,
  isDailyDay,
  pickDailyPuzzle,
  puzzleIsLegal,
  startDailyGame,
  resumeDailyGame,
  tiedDailyWinners,
} from "./daily";

describe("daily puzzle", () => {
  it("stamps the calendar day in Eastern Time", () => {
    const winter = dailyDayStamp(Date.parse("2026-01-15T04:30:00Z"));
    assert.equal(winter, "2026-01-14");
    const evening = dailyDayStamp(Date.parse("2026-09-02T16:00:00Z"));
    assert.equal(evening, "2026-09-02");
    assert.equal(dailyYesterday("2026-09-02"), "2026-09-01");
    assert.equal(isDailyDay(DAILY_LAUNCH), true);
    assert.equal(isDailyDay("2026-09-01"), false);
  });

  it("hides other lineups until the day is over", () => {
    assert.equal(canViewDailyLineup("2026-09-04", "2026-09-04", "me", "me"), true);
    assert.equal(canViewDailyLineup("2026-09-04", "2026-09-04", "me", "you"), false);
    assert.equal(canViewDailyLineup("2026-09-04", "2026-09-04", null, "me"), false);
    assert.equal(canViewDailyLineup("2026-09-03", "2026-09-04", "me", "you"), true);
    assert.equal(canViewDailyLineup("2026-09-03", "2026-09-04", null, "you"), true);
  });

  it("hydrates a stored daily lineup even if the board moved", () => {
    const snaps = hydrateDailyPicks(2011, 6, [
      { slot: "QB", id: "e:2011:QB:aaron-rodgers", name: "Aaron Rodgers", team: "GB", cost: 10, score: 33.1 },
      { slot: "TE", id: "e:2011:TE:missing-guy", name: "Missing Guy", team: "HOU", cost: 1, score: 4.2 },
    ]);
    assert.equal(snaps[0]?.name, "Aaron Rodgers");
    assert.equal(snaps[0]?.score, 33.1);
    assert.equal(snaps.find((row) => row.slot === "TE")?.name, "Missing Guy");
  });

  it("only rolls a playable week from a real season", () => {
    for (let i = 0; i < 40; i += 1) {
      const puzzle = pickDailyPuzzle(Math.random(), Math.random());
      assert.equal(puzzleIsLegal(puzzle.year, puzzle.week), true);
      assert.ok(playableWeeks(puzzle.year).includes(puzzle.week));
    }
  });

  it("pays $1 only when the score is over 100", () => {
    assert.equal(dailyScorePays(100), false);
    assert.equal(dailyScorePays(100.1), true);
    assert.equal(dailyScorePays(161), true);
  });

  it("gives every tied top score the win", () => {
    assert.deepEqual(
      tiedDailyWinners([
        { userId: "a", score: 142.4 },
        { userId: "b", score: 138 },
        { userId: "c", score: 142.4 },
      ]),
      ["a", "c"],
    );
    assert.deepEqual(tiedDailyWinners([{ userId: "a", score: 100 }]), ["a"]);
    assert.deepEqual(tiedDailyWinners([]), []);
  });
});

describe("daily draft", () => {
  it("lets the last pick go down to $1 and never hands the clock to an opponent", () => {
    let state = startDailyGame("Pat", 2019, "2026-09-02");
    assert.ok(state.elim?.solo);
    assert.equal(state.currentBidder, 0);
    assert.equal(maxElimCost(state.elim!, state.cash[0], 0), 35 - remainingAfter(0));
    let steps = 0;
    while (state.phase === "draft") {
      if (++steps > 40) throw new Error("daily draft stuck");
      if (state.elim?.pickHoldUntil) state = flushElimDraft(state, state.elim.pickHoldUntil + 1);
      if (state.phase !== "draft") break;
      assert.equal(state.currentBidder, 0);
      const legal = legalElimPicks(state.elim!, state.cash[0], 0);
      assert.ok(legal.length);
      const pick = legal.sort((a, b) => a.cost - b.cost)[0]!;
      state = applyAction(state, { type: "pickElim", id: pick.id }, 0);
    }
    if (state.elim?.pickHoldUntil) state = flushElimDraft(state, state.elim.pickHoldUntil + 1);
    assert.equal(state.phase, "matchup");
    assert.equal(state.elim?.picks[0].length, ELIM_SLOTS.length);
    assert.equal(state.elim?.picks[1].length, 0);
    assert.ok(state.cash[0] >= 0);
  });

  it("auto-fills a legal solo lineup the same way the clock would", () => {
    const picks = autoFillDailyPicks(2019, "2026-09-02", "www");
    assert.equal(picks.length, ELIM_SLOTS.length);
    const ids = new Set(picks.map((row) => row.player.id));
    assert.equal(ids.size, ELIM_SLOTS.length);
    const spent = picks.reduce((n, row) => n + row.player.cost, 0);
    assert.ok(spent >= ELIM_SLOTS.length && spent <= 35);
    assert.ok(dailyAutoBudgetMs() >= 8 * 60_000);
    const again = autoFillDailyPicks(2019, "2026-09-02", "www");
    assert.deepEqual(
      again.map((row) => row.player.id),
      picks.map((row) => row.player.id),
    );
  });

  it("keeps saved picks and auto-fills leftover slots", () => {
    const fresh = startDailyGame("Pat", 2019, "2026-09-02", "poor", [...ELIM_SLOTS]);
    const legal = legalElimPicks(fresh.elim!, fresh.cash[0], 0);
    const qb = legal.sort((a, b) => a.cost - b.cost)[0]!;
    const picks = autoFillDailyPicks(2019, "2026-09-02", "www", [{ slot: "QB", id: qb.id }]);
    assert.equal(picks.length, ELIM_SLOTS.length);
    assert.equal(picks.find((row) => row.slot === "QB")?.player.id, qb.id);
    const ids = new Set(picks.map((row) => row.player.id));
    assert.equal(ids.size, ELIM_SLOTS.length);
  });

  it("restores saved picks without filling leftover slots", () => {
    const fresh = startDailyGame("Pat", 2019, "2026-09-02", "poor", [...ELIM_SLOTS]);
    const legal = legalElimPicks(fresh.elim!, fresh.cash[0], 0);
    const qb = legal.sort((a, b) => a.cost - b.cost)[0]!;
    const state = resumeDailyGame("Pat", 2019, "2026-09-02", "poor", [{ slot: "QB", id: qb.id }]);
    assert.equal(state.phase, "draft");
    assert.equal(state.elim?.picks[0].length, 1);
    assert.equal(state.elim?.picks[0][0]?.player.id, qb.id);
  });
});
