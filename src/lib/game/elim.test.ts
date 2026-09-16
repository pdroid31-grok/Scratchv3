import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, startElimination, type GameState } from "./engine";
import { ELIM_BUDGET, ELIM_POS, ELIM_SLOTS, ELIM_YEARS, buildSeason, hiddenWeeks, playableWeeks, randomYear, slotPos, unusedWeek, weekCount, weekScoreTone, type ElimPlayer, type ElimPos, type ElimSlot, type ElimYear } from "./elim-data";
import { ELIM_WEEKS } from "./elim-weeks";
import { ELIM_LEGACY_WEEKS } from "./elim-legacy-weeks";
import {
  ELIM_PICK_HOLD_MS,
  ELIM_PICK_CLOCK_MS,
  ELIM_REVEAL_MS,
  ELIM_REVEAL_STEPS,
  byeHasRolled,
  elimDisplay,
  elimRevealReady,
  elimSeriesWinner,
  elimTotals,
  elimWinner,
  finishElimination,
  flushElimDraft,
  isByeWeek,
  maxElimCost,
  elimLineup,
  pickerForRound,
  pickAt,
  pickElim,
  remainingMinCost,
  remainingAfter,
  revealedCount,
  legalElimPicks,
  replacementWeek,
  revealOpen,
  scoredWeek,
  timeoutElim,
  elimBestWeeks,
  elimWorstWeeks,
  elimBriefing,
  elimStartOpen,
} from "./elim";
import { hostedMatchView } from "./hosted-match";
import { teamBye } from "./elim-byes";

function locked(year: ElimYear = 2019, week = 8): GameState {
  return startElimination("Alex", "Sam", undefined, {
    year,
    week,
    firstPicker: 0,
    order: [...ELIM_SLOTS],
  });
}

function beginReveal(state: GameState): GameState {
  const once = applyAction(state, { type: "startReveal" });
  if (once.phase === "reveal") return once;
  return applyAction(once, { type: "startReveal" });
}

function affordable(state: GameState) {
  const elim = state.elim;
  assert.ok(elim);
  const seat = state.currentBidder;
  const legal = legalElimPicks(elim, state.cash[seat], seat).sort((a, b) => b.cost - a.cost);
  const row = legal[0];
  assert.ok(row, `no pick for seat ${seat} round ${elim.round} cash ${state.cash[seat]}`);
  return row;
}

function afterHold(state: GameState): GameState {
  return flushElimDraft(state, (state.elim?.pickHoldUntil ?? 0) + 1);
}

function draftAll(state: GameState): GameState {
  let next = state;
  let steps = 0;
  while (next.phase === "draft") {
    if (++steps > 80) throw new Error("draft stuck");
    if (next.elim?.pickHoldUntil) next = afterHold(next);
    if (next.phase !== "draft") break;
    const row = affordable(next);
    next = applyAction(next, { type: "pickElim", id: row.id }, next.currentBidder);
  }
  if (next.elim?.pickHoldUntil) next = afterHold(next);
  return next;
}

function closeReveal(state: GameState): GameState {
  const revealing = state.phase === "reveal" ? state : beginReveal(state);
  assert.ok(revealing.elim);
  return finishElimination({
    ...revealing,
    elim: { ...revealing.elim, revealAt: Date.now() - 90000 },
  });
}

function forceWeekScores(state: GameState, home: number, away: number): GameState {
  const elim = state.elim;
  assert.ok(elim);
  const week = elim.week - 1;
  const stamp = (picks: typeof elim.picks[0], total: number) =>
    picks.map((pick, i) => ({
      ...pick,
      player: {
        ...pick.player,
        bye: 0,
        weeks: pick.player.weeks.map((pts, w) => (w === week ? (i === 0 ? total : 0) : pts)),
      },
    }));
  return {
    ...state,
    elim: {
      ...elim,
      picks: [stamp(elim.picks[0], home), stamp(elim.picks[1], away)],
    },
  };
}

describe("elimination pool", () => {
  it("has 10 skill names and 5 K/D per season, with a real kicker spread", () => {
    assert.equal(ELIM_YEARS.length, 20);
    assert.deepEqual(ELIM_POS, ["QB", "RB", "WR", "TE", "D", "K"]);
    for (const year of ELIM_YEARS) {
      const season = buildSeason(year);
      const positions: ElimPos[] = ["QB", "RB", "WR", "TE", "D", "K"];
      for (const pos of positions) {
        const board: ElimPlayer[] = season[pos];
        const stream = pos === "K" || pos === "D";
        assert.equal(board.length, stream ? 5 : 10, `${year} ${pos}`);
        const ids = new Set(board.map((p: ElimPlayer) => p.id));
        assert.equal(ids.size, board.length, `${year} ${pos} duplicate id`);
        board.forEach((player: ElimPlayer, i: number) => {
          assert.equal(player.cost, (stream ? 5 : 10) - i);
          if (!stream) assert.ok(player.ppr >= 50, `${player.name} ${year} ${pos} ${player.ppr}`);
          if (!stream && i > 0) assert.ok(player.ppr <= board[i - 1]!.ppr);
          assert.equal(player.weeks.length, weekCount(year), `${player.name} week length`);
          assert.equal(player.weeks[16] ?? 0, 0, `${player.name} ${year} week 17 must be 0`);
          if (year <= 2020) {
            assert.equal(player.weeks[15] ?? 0, 0, `${player.name} ${year} week 16 must be 0`);
          }
          if (weekCount(year) >= 18) {
            assert.equal(player.weeks[17] ?? 0, 0, `${player.name} ${year} week 18 must be 0`);
          }
          const playableTot = playableWeeks(year).reduce((n, week) => n + (player.weeks[week - 1] ?? 0), 0);
          assert.ok(Math.abs(player.ppr - Math.round(playableTot * 10) / 10) < 0.05, `${player.name} ${year} ppr ${player.ppr} vs ${playableTot}`);
          assert.ok(
            Math.max(...player.weeks) > 0,
            `${player.name} ${year} ${pos} has no real weekly scores`,
          );
          assert.equal(player.bye, teamBye(year, player.team), `${player.name} ${year} bye`);
          assert.ok(player.bye >= 1 && player.bye <= weekCount(year), `${player.name} ${year} bye ${player.bye}`);
        });
        if (!stream) {
          const gap = board[0]!.ppr - board[board.length - 1]!.ppr;
          const floor = pos === "TE" ? 40 : year <= 2015 ? 45 : year <= 2020 ? 70 : 90;
          assert.ok(gap >= floor, `${year} ${pos} skill spread ${board[0]!.ppr} vs ${board[board.length - 1]!.ppr}`);
        }
        if (stream) {
          assert.ok(
            board[0]!.ppr - board[board.length - 1]!.ppr >= 25,
            `${year} ${pos} season spread ${board[0]!.ppr} vs ${board[board.length - 1]!.ppr}`,
          );
          const first = board[0]!.weeks.filter((n) => n > 0);
          const last = board[board.length - 1]!.weeks.filter((n) => n > 0);
          const firstAvg = first.reduce((a, b) => a + b, 0) / Math.max(1, first.length);
          const lastAvg = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
          assert.ok(
            firstAvg - lastAvg >= 2,
            `${year} ${pos} weekly avg ${firstAvg} vs ${lastAvg}`,
          );
          board.forEach((player) => {
            const raw = ELIM_WEEKS[player.id] ?? ELIM_LEGACY_WEEKS[player.id] ?? [];
            const skip = new Set(hiddenWeeks(year));
            playableWeeks(year).forEach((week) => {
              assert.equal(
                player.weeks[week - 1] ?? 0,
                raw[week - 1] ?? 0,
                `${player.id} week ${week} must keep the real score`,
              );
            });
            skip.forEach((week) => {
              assert.equal(player.weeks[week - 1] ?? 0, 0, `${player.id} week ${week} must be hidden`);
            });
          });
        }
      }
    }
  });

  it("uses real Sleeper PPR for 2025 week 6, not a split of the season total", () => {
    const season = buildSeason(2025);
    const cmc = season.RB.find((p) => p.name === "Christian McCaffrey");
    const puka = season.WR.find((p) => p.name === "Puka Nacua");
    const allen = season.QB.find((p) => p.name === "Josh Allen");
    assert.equal(cmc?.weeks[5], 24.1);
    assert.equal(puka?.weeks[5], 4.8);
    assert.equal(allen?.weeks[5], 17.4);
  });

  it("colors weekly PPR by position: red dud, grey typical, green good, blue spike", () => {
    assert.equal(weekScoreTone("QB", 13.9), "bad");
    assert.equal(weekScoreTone("QB", 18), "ok");
    assert.equal(weekScoreTone("QB", 25), "good");
    assert.equal(weekScoreTone("QB", 32), "best");
    assert.equal(weekScoreTone("RB", 7.9), "bad");
    assert.equal(weekScoreTone("RB", 15), "ok");
    assert.equal(weekScoreTone("RB", 24.9), "good");
    assert.equal(weekScoreTone("RB", 25), "best");
    assert.equal(weekScoreTone("TE", 5.9), "bad");
    assert.equal(weekScoreTone("TE", 18), "best");
    assert.equal(weekScoreTone("K", 5.9), "bad");
    assert.equal(weekScoreTone("K", 14), "best");
    assert.equal(weekScoreTone("D", 1.9), "bad");
    assert.equal(weekScoreTone("D", -3), "bad");
    assert.equal(weekScoreTone("D", 14), "best");
    assert.equal(weekScoreTone("QB", 40, true), "bye");
  });

  it("keeps kicker and defense weeks as raw Sleeper points", () => {
    const season = buildSeason(2024);
    const boswell = season.K.find((p) => p.name === "Chris Boswell");
    const broncos = season.D.find((p) => p.name === "Broncos");
    assert.equal(boswell?.weeks[0], 26);
    assert.equal(broncos?.weeks[0], 9);
    assert.deepEqual(boswell?.weeks, ELIM_WEEKS["e:2024:K:chris-boswell"]);
    assert.deepEqual(broncos?.weeks, ELIM_WEEKS["e:2024:D:broncos"]);
  });

  it("puts kickers on their real team that season, not a BAL default", () => {
    const expectTeam = (year: ElimYear, name: string, team: string) => {
      const row = buildSeason(year).K.find((p) => p.name === name);
      assert.ok(row, `${year} ${name} missing`);
      assert.equal(row!.team, team, `${year} ${name}`);
    };
    expectTeam(2016, "Justin Tucker", "BAL");
    expectTeam(2016, "Wil Lutz", "NO");
    expectTeam(2017, "Greg Zuerlein", "LAR");
    expectTeam(2018, "Ka'imi Fairbairn", "HOU");
    expectTeam(2019, "Wil Lutz", "NO");
    expectTeam(2020, "Younghoe Koo", "ATL");
    expectTeam(2022, "Younghoe Koo", "ATL");
    expectTeam(2022, "Robbie Gould", "SF");
    expectTeam(2024, "Dustin Hopkins", "CLE");
    expectTeam(2025, "Daniel Carlson", "LV");
    for (const year of ELIM_YEARS) {
      const teams = buildSeason(year).K.map((p) => p.team);
      assert.ok(new Set(teams).size >= 4, `${year} kicker teams ${teams.join(",")}`);
    }
  });

  it("holds both GMs on a start screen until they ready, and the host picks the era", () => {
    const waiting = { phase: "lobby" as const, kind: "elimination" as const, names: ["Pat", ""] as [string, string] };
    assert.equal(elimStartOpen(waiting), false);
    assert.equal(elimStartOpen(waiting, true), true);
    const brief = elimBriefing("Pat", "Ty");
    assert.equal(brief.phase, "lobby");
    assert.equal(brief.kind, "elimination");
    assert.equal(elimStartOpen(brief), true);
    const era = applyAction(brief, { type: "setElimEra", era: "classic" }, 0);
    assert.equal(era.elimEra, "classic");
    assert.equal(applyAction(era, { type: "setElimEra", era: "modern" }, 1), era);
    const one = applyAction(era, { type: "readyElim" }, 0);
    assert.equal(one.phase, "lobby");
    assert.deepEqual(one.elimReady, [true, false]);
    const reset = applyAction(one, { type: "setElimEra", era: "modern" }, 0);
    assert.equal(reset.elimEra, "modern");
    assert.deepEqual(reset.elimReady, [true, false]);
    const guestKept = applyAction(applyAction(era, { type: "readyElim" }, 1), { type: "setElimEra", era: "modern" }, 0);
    assert.deepEqual(guestKept.elimReady, [false, true]);
    const classic = applyAction(reset, { type: "setElimEra", era: "classic" }, 0);
    assert.deepEqual(classic.elimReady, [true, false]);
    const go = applyAction(applyAction(classic, { type: "readyElim" }, 0), { type: "readyElim" }, 1);
    assert.equal(go.phase, "draft");
    assert.ok(go.elim);
    assert.ok(go.elim.year >= 2006 && go.elim.year <= 2015);
    for (let i = 0; i < 20; i++) {
      const year = randomYear("classic");
      assert.ok(year >= 2006 && year <= 2015, String(year));
    }
  });

  it("uses 2006–2015 nflverse boards with the same $35 snake shape", () => {
    const season = buildSeason(2006);
    assert.equal(season.RB[0]?.name, "LaDainian Tomlinson");
    assert.equal(season.QB[0]?.name, "Peyton Manning");
    assert.equal(season.D[0]?.name, "Bears");
    assert.equal(season.K.length, 5);
    const lockedClassic = startElimination("Pat", "Ty", undefined, {
      year: 2006,
      week: 1,
      firstPicker: 0,
      order: [...ELIM_SLOTS],
      era: "classic",
    });
    assert.equal(lockedClassic.elim?.year, 2006);
    assert.equal(lockedClassic.cash[0], ELIM_BUDGET);
    assert.equal(lockedClassic.elim?.board.length, 10);
  });

  it("keeps the best week as the official elimination high, not the series total", () => {
    const started = startElimination("Pat", "Heisenberg", undefined, {
      year: 2019,
      week: 8,
      firstPicker: 0,
      order: [...ELIM_SLOTS],
    });
    assert.ok(started.elim);
    const elim = {
      ...started.elim,
      weekWins: [3, 1] as [number, number],
      sets: [
        { week: 8, scores: [161.4, 140] as [number, number], winner: 0 as const },
        { week: 9, scores: [142, 150] as [number, number], winner: 1 as const },
        { week: 10, scores: [138, 120] as [number, number], winner: 0 as const },
        { week: 11, scores: [155, 130] as [number, number], winner: 0 as const },
      ],
    };
    assert.deepEqual(elimBestWeeks(elim), [161, 150]);
    assert.deepEqual(elimWorstWeeks(elim), [138, 120]);
    const hosted = hostedMatchView({ ...started, phase: "results", nights: 1, elim });
    assert.ok(hosted);
    assert.equal(hosted.kind, "elimination");
    assert.deepEqual(hosted.scores, [161, 150]);
    assert.deepEqual(hosted.lows, [138, 120]);
    const privateNight = hostedMatchView({
      ...started,
      phase: "results",
      nights: 1,
      elim,
      publicJoin: false,
    });
    assert.ok(privateNight, "private two-phone nights still go on the history board");
    assert.deepEqual(privateNight.series, [3, 1]);
    const rematch = applyAction({ ...started, phase: "results", nights: 1, elim }, { type: "rematch" }, 0);
    assert.equal(rematch.phase, "results");
    const gone = applyAction(applyAction({ ...started, phase: "results", nights: 1, elim }, { type: "rematch" }, 0), { type: "rematch" }, 1);
    assert.equal(gone.phase, "lobby");
    assert.equal(hostedMatchView(gone), null);
  });
});

function cheapPrior(year: ElimYear, slots: readonly ElimSlot[]) {
  return slots.map((slot) => {
    const pos = slotPos(slot);
    const board = buildSeason(year)[pos];
    const player = board[board.length - 1]!;
    return { slot, pos, player, seat: 0 as const };
  });
}

describe("elimination snake", () => {
  it("lets home open QB and away open RB, then alternates", () => {
    assert.equal(pickerForRound(0), 0);
    assert.equal(pickerForRound(1), 1);
    assert.equal(pickerForRound(2), 0);
    assert.equal(pickerForRound(5), 1);
    const started = locked();
    assert.equal(started.kind, "elimination");
    assert.equal(started.phase, "draft");
    assert.equal(started.elim?.year, 2019);
    assert.equal(started.elim?.week, 8);
    assert.equal(started.currentBidder, 0);
    assert.equal(started.cash[0], ELIM_BUDGET);
    assert.equal(started.elim?.board[0]?.pos, "QB");

    const qb = started.elim!.board.find((p) => p.cost === 10);
    assert.ok(qb);
    const afterA = applyAction(started, { type: "pickElim", id: qb.id }, 0);
    assert.equal(afterA.cash[0], ELIM_BUDGET - 10);
    assert.equal(afterA.currentBidder, 1);
    assert.equal(afterA.elim?.round, 0);
    assert.equal(afterA.elim?.lastPickId, qb.id);
    assert.ok((afterA.elim?.pickHoldUntil ?? 0) > Date.now());

    const offClock = applyAction(afterA, { type: "pickElim", id: afterA.elim!.board[1]!.id }, 0);
    assert.equal(offClock, afterA);

    const taken = applyAction(afterA, { type: "pickElim", id: qb.id }, 1);
    assert.equal(taken, afterA);

    const held = afterHold(afterA);
    assert.equal(held.elim?.pickHoldUntil, null);
    const qb2 = held.elim!.board.find((p) => p.cost === 9);
    assert.ok(qb2);
    const afterB = afterHold(applyAction(held, { type: "pickElim", id: qb2.id }, 1));
    assert.equal(afterB.elim?.round, 1);
    assert.equal(afterB.currentBidder, 1);
    assert.equal(afterB.elim?.board[0]?.pos, "RB");
    assert.equal(afterB.elim?.picks[0].length, 1);
    assert.equal(afterB.elim?.picks[1].length, 1);
  });

  it("caps a pick so leftover names stay buyable on shared boards", () => {
    assert.equal(remainingAfter(0), 7);
    const started = locked();
    const seat = started.currentBidder;
    const reserve = remainingMinCost(started.elim!, seat);
    assert.ok(reserve >= 14, `reserve ${reserve}`);
    assert.equal(maxElimCost(started.elim!, ELIM_BUDGET, seat), ELIM_BUDGET - reserve);
    assert.equal(maxElimCost(started.elim!, 1, seat), 0);
    const star = started.elim!.board.find((p) => p.cost === 10);
    assert.ok(star);
    const broke = { ...started, cash: [3, ELIM_BUDGET] as [number, number] };
    const blocked = applyAction(broke, { type: "pickElim", id: star.id }, 0);
    assert.equal(blocked.elim?.picks[0].length, 0);
  });

  it("lets the last picker take leftover names even if they only have $1", () => {
    const started = locked();
    const dest = buildSeason(2019).D;
    const one = dest.find((p) => p.cost === 1);
    const two = dest.find((p) => p.cost === 2);
    assert.ok(one && two);
    const prior = cheapPrior(2019, ELIM_SLOTS.slice(0, 7));
    const state: GameState = {
      ...started,
      cash: [1, 2],
      currentBidder: 1,
      elim: {
        ...started.elim!,
        round: 7,
        board: dest,
        picks: [
          prior.map((row) => ({ ...row, seat: 0 as const })),
          prior.map((row) => ({ ...row, seat: 1 as const })),
        ],
      },
    };
    const first = afterHold(applyAction(state, { type: "pickElim", id: one.id }, 1));
    assert.equal(first.cash[1], 1);
    assert.equal(first.currentBidder, 0);
    const leftover = afterHold(applyAction(first, { type: "pickElim", id: two.id }, 0));
    assert.equal(leftover.elim?.picks[0].length, 8);
    assert.equal(leftover.cash[0], 0);
    assert.equal(leftover.phase, "matchup");
  });

  it("lets the last picker take $2 if they kept $2 after the $1 was taken", () => {
    const started = locked();
    const dest = buildSeason(2019).D;
    const one = dest.find((p) => p.cost === 1);
    const two = dest.find((p) => p.cost === 2);
    assert.ok(one && two);
    const prior = cheapPrior(2019, ELIM_SLOTS.slice(0, 7));
    const state: GameState = {
      ...started,
      cash: [2, 2],
      currentBidder: 1,
      elim: {
        ...started.elim!,
        round: 7,
        board: dest,
        picks: [
          prior.map((row) => ({ ...row, seat: 0 as const })),
          prior.map((row) => ({ ...row, seat: 1 as const })),
        ],
      },
    };
    const first = afterHold(applyAction(state, { type: "pickElim", id: one.id }, 1));
    assert.equal(first.cash[1], 1);
    const second = afterHold(applyAction(first, { type: "pickElim", id: two.id }, 0));
    assert.equal(second.elim?.picks[0].length, 8);
    assert.equal(second.cash[0], 0);
    assert.equal(second.phase, "matchup");
  });

  it("will not sell a $3 K when that would leave only $1 for D", () => {
    const started = locked();
    const board = buildSeason(2019).K;
    const three = board.find((p) => p.cost === 3);
    const one = board.find((p) => p.cost === 1);
    assert.ok(three && one);
    const prior = cheapPrior(2019, ELIM_SLOTS.slice(0, 6));
    const state: GameState = {
      ...started,
      cash: [4, 4],
      currentBidder: 0,
      elim: {
        ...started.elim!,
        round: 6,
        board,
        picks: [
          prior.map((row) => ({ ...row, seat: 0 as const })),
          prior.map((row) => ({ ...row, seat: 1 as const })),
        ],
      },
    };
    assert.equal(maxElimCost(state.elim!, 4, 0), 2);
    const blocked = applyAction(state, { type: "pickElim", id: three.id }, 0);
    assert.equal(blocked.elim?.picks[0].length, 6);
    const ok = applyAction(state, { type: "pickElim", id: one.id }, 0);
    assert.equal(ok.elim?.picks[0].length, 7);
    assert.equal(ok.cash[0], 3);
  });

  it("never deadlocks a star draft on the last pick", () => {
    for (let i = 0; i < 80; i += 1) {
      const done = draftAll(startElimination("Pat", "Ty"));
      assert.equal(done.phase, "matchup", `stuck ${done.phase} round ${done.elim?.round} cash ${done.cash}`);
      assert.equal(done.elim?.picks[0].length, 8);
      assert.equal(done.elim?.picks[1].length, 8);
    }
  });

  it("plays best of five weeks on the same lineups and pays the shop once", () => {
    const matchup = draftAll(locked());
    assert.equal(matchup.phase, "matchup");
    assert.equal(matchup.elim?.picks[0].length, 8);
    assert.equal(matchup.elim?.picks[1].length, 8);
    assert.deepEqual(
      matchup.elim?.picks[0].map((p) => p.slot),
      [...ELIM_SLOTS],
    );
    assert.ok(matchup.cash[0] >= 0);
    assert.ok(matchup.cash[1] >= 0);
    assert.equal(applyAction(matchup, { type: "finishElim" }).phase, "matchup");

    const revealing = beginReveal(matchup);
    assert.equal(revealing.phase, "reveal");
    assert.ok(revealing.elim?.revealAt);
    const elimCadence = revealing.elim!;
    const cadence = {
      ...elimCadence,
      picks: elimCadence.picks.map((side) =>
        side.map((pick) => ({ ...pick, player: { ...pick.player, bye: 0 } })),
      ) as typeof elimCadence.picks,
    };
    const at = cadence.revealAt!;
    assert.equal(revealedCount(cadence, at), 1);
    assert.equal(revealOpen(1, 0, 0), true);
    assert.equal(revealOpen(1, 0, 1), false);
    assert.equal(revealedCount(cadence, at + 1499), 1);
    assert.equal(revealedCount(cadence, at + 1500), 2);
    assert.equal(revealOpen(2, 0, 1), true);
    assert.equal(revealOpen(2, 1, 0), false);
    const tooSoon = finishElimination({
      ...revealing,
      elim: { ...revealing.elim!, revealAt: Date.now() - 4000 },
    });
    assert.equal(tooSoon.phase, "reveal");

    const week1 = closeReveal(forceWeekScores(matchup, 40, 10));
    assert.equal(week1.phase, "matchup");
    assert.equal(week1.nights, 0);
    assert.deepEqual(week1.elim?.weekWins, [1, 0]);
    assert.equal(week1.elim?.lastSet?.week, 8);
    assert.equal(week1.elim?.sets?.length, 1);
    assert.notEqual(week1.elim?.week, 8);
    assert.deepEqual(
      week1.elim?.picks[0].map((p) => p.player.id),
      matchup.elim?.picks[0].map((p) => p.player.id),
    );

    const week2 = closeReveal(forceWeekScores(week1, 12, 30));
    assert.equal(week2.phase, "matchup");
    assert.deepEqual(week2.elim?.weekWins, [1, 1]);
    assert.equal(week2.nights, 0);
    assert.ok(!week2.elim?.playedWeeks.includes(week2.elim.week));

    const week3 = closeReveal(forceWeekScores(week2, 22, 8));
    assert.equal(week3.phase, "matchup");
    assert.deepEqual(week3.elim?.weekWins, [2, 1]);
    assert.equal(week3.nights, 0);

    const week4 = closeReveal(forceWeekScores(week3, 9, 21));
    assert.equal(week4.phase, "matchup");
    assert.deepEqual(week4.elim?.weekWins, [2, 2]);

    const done = closeReveal(forceWeekScores(week4, 18, 11));
    assert.equal(done.phase, "results");
    assert.equal(done.nights, 1);
    assert.deepEqual(done.elim?.weekWins, [3, 2]);
    assert.equal(done.elim?.sets?.length, 5);
    assert.equal(elimSeriesWinner(done.elim!), 0);
    assert.deepEqual(done.series, [1, 0]);
    const last = done.elim!.lastSet!;
    assert.equal(last.scores[0], 18);
    assert.equal(last.scores[1], 11);
    assert.notEqual(elimTotals(done.elim!)[0] + elimTotals(done.elim!)[1], 40 + 10 + 12 + 30 + 22 + 8 + 9 + 21 + 18 + 11);

    const rematchWait = applyAction(done, { type: "rematch" }, 0);
    assert.equal(rematchWait.phase, "results");
    const again = applyAction(rematchWait, { type: "rematch" }, 1);
    assert.equal(again.phase, "lobby");
    assert.equal(again.kind, "elimination");
    assert.equal(again.elim, null);
    assert.deepEqual(again.elimReady, [false, false]);
    assert.equal(again.names[0], "Alex");
    assert.equal(again.cash[0], ELIM_BUDGET);
    assert.deepEqual(again.series, done.series);
  });

  it("ends 3-0 after three weeks and still counts as one night", () => {
    const matchup = draftAll(locked());
    const first = closeReveal(forceWeekScores(matchup, 50, 1));
    assert.equal(first.phase, "matchup");
    const second = closeReveal(forceWeekScores(first, 33, 4));
    assert.equal(second.phase, "matchup");
    assert.deepEqual(second.elim?.weekWins, [2, 0]);
    assert.equal(second.elim?.sets?.length, 2);
    const sweep = closeReveal(forceWeekScores(second, 28, 9));
    assert.equal(sweep.phase, "results");
    assert.equal(sweep.nights, 1);
    assert.deepEqual(sweep.elim?.weekWins, [3, 0]);
    assert.equal(sweep.elim?.sets?.length, 3);
    assert.equal(elimWinner(sweep.elim!, sweep.cash, sweep.elim!.lastSet!.week), 0);
  });

  it("lets away open the draft when they win the coin flip", () => {
    assert.equal(pickerForRound(0, 1), 1);
    assert.equal(pickerForRound(1, 1), 0);
    assert.equal(pickerForRound(2, 1), 1);
    const started = startElimination("Alex", "Sam", undefined, {
      year: 2019,
      week: 8,
      firstPicker: 1,
      order: [...ELIM_SLOTS],
    });
    assert.equal(started.currentBidder, 1);
    assert.equal(started.elim?.firstPicker, 1);
    const qb = started.elim!.board.find((p) => p.cost === 10);
    assert.ok(qb);
    const after = applyAction(started, { type: "pickElim", id: qb.id }, 1);
    assert.equal(after.currentBidder, 0);
    assert.equal(after.elim?.picks[1].length, 1);
  });

  it("drafts positions in a shuffled order", () => {
    const order: ElimSlot[] = ["K", "RB2", "D", "WR2", "TE", "WR1", "RB1", "QB"];
    const started = startElimination("Alex", "Sam", undefined, {
      year: 2019,
      week: 8,
      firstPicker: 0,
      order,
    });
    assert.deepEqual(elimLineup(started.elim!), order);
    assert.equal(started.elim?.board[0]?.pos, "K");
    const drafted = draftAll(started);
    assert.deepEqual(
      drafted.elim?.picks[0].map((pick) => pick.slot),
      order,
    );
    assert.equal(drafted.phase, "matchup");
    assert.deepEqual(elimDisplay(), [...ELIM_SLOTS]);
  });

  it("drafts the second RB and WR from leftover names on the same board", () => {
    const order: ElimSlot[] = ["RB1", "RB2", "WR1", "WR2", "QB", "TE", "K", "D"];
    let state = startElimination("Alex", "Sam", undefined, {
      year: 2019,
      week: 8,
      firstPicker: 0,
      order,
    });
    assert.equal(state.elim?.board.length, 10);
    assert.equal(state.elim?.board[0]?.pos, "RB");
    const rbA = state.elim!.board.find((p) => p.cost === 10);
    const rbB = state.elim!.board.find((p) => p.cost === 9);
    assert.ok(rbA && rbB);
    state = applyAction(state, { type: "pickElim", id: rbA.id }, 0);
    state = afterHold(state);
    state = applyAction(state, { type: "pickElim", id: rbB.id }, 1);
    state = afterHold(state);
    assert.equal(state.elim?.round, 1);
    assert.equal(state.elim?.board.length, 10);
    assert.ok(state.elim?.board.every((row) => row.pos === "RB"));
    assert.equal(state.elim?.taken.length, 2);
    const rbC = state.elim!.board.find((p) => p.cost === 8);
    const rbD = state.elim!.board.find((p) => p.cost === 7);
    assert.ok(rbC && rbD);
    state = applyAction(state, { type: "pickElim", id: rbC.id }, 1);
    state = afterHold(state);
    state = applyAction(state, { type: "pickElim", id: rbD.id }, 0);
    state = afterHold(state);
    assert.equal(state.elim?.picks[0].filter((pick) => pick.pos === "RB").length, 2);
    assert.equal(state.elim?.picks[1].filter((pick) => pick.pos === "RB").length, 2);
    assert.notEqual(pickAt(state.elim!.picks[0], "RB1")?.player.id, pickAt(state.elim!.picks[0], "RB2")?.player.id);
    assert.equal(state.elim?.round, 2);
    assert.equal(state.elim?.board[0]?.pos, "WR");
  });

  it("does not copy an RB2 pick into the empty RB1 chip", () => {
    const order: ElimSlot[] = ["RB2", "RB1", "WR2", "WR1", "QB", "TE", "K", "D"];
    let state = startElimination("Alex", "Sam", undefined, {
      year: 2019,
      week: 8,
      firstPicker: 0,
      order,
    });
    const star = state.elim!.board.find((p) => p.cost === 10);
    assert.ok(star);
    state = applyAction(state, { type: "pickElim", id: star.id }, 0);
    assert.equal(pickAt(state.elim!.picks[0], "RB2")?.player.id, star.id);
    assert.equal(pickAt(state.elim!.picks[0], "RB1"), undefined);
    assert.notEqual(pickAt(state.elim!.picks[0], "RB1")?.player.id, star.id);
  });

  it("holds a pick for 1.5 seconds before the next GM can draft", () => {
    assert.equal(ELIM_PICK_HOLD_MS, 1500);
    const started = locked();
    const qb = started.elim!.board.find((p) => p.cost === 10);
    const next = started.elim!.board.find((p) => p.cost === 9);
    assert.ok(qb && next);
    const t0 = 1_000_000;
    const after = pickElim(started, qb.id, 0, t0);
    assert.equal(after.elim?.lastPickId, qb.id);
    assert.equal(after.elim?.pickHoldUntil, t0 + ELIM_PICK_HOLD_MS);
    assert.equal(after.elim?.round, 0);
    assert.equal(pickElim(after, next.id, 1, t0 + ELIM_PICK_HOLD_MS - 1), after);
    assert.equal(flushElimDraft(after, t0 + ELIM_PICK_HOLD_MS - 1), after);
    const ready = flushElimDraft(after, t0 + ELIM_PICK_HOLD_MS);
    assert.equal(ready.elim?.pickHoldUntil, null);
    assert.equal(ready.elim?.lastPickId, null);
    const second = pickElim(ready, next.id, 1, t0 + ELIM_PICK_HOLD_MS);
    assert.equal(second.elim?.picks[1][0]?.player.id, next.id);
    assert.equal(second.elim?.pending?.round, 1);
  });

  it("lets the next GM pick after the hold even if the flush action never ran", () => {
    const started = locked();
    const qb = started.elim!.board.find((p) => p.cost === 10);
    const next = started.elim!.board.find((p) => p.cost === 9);
    assert.ok(qb && next);
    const t0 = 2_000_000;
    const after = pickElim(started, qb.id, 0, t0);
    const second = pickElim(after, next.id, 1, t0 + ELIM_PICK_HOLD_MS);
    assert.equal(second.elim?.picks[1][0]?.player.id, next.id);
    assert.equal(second.elim?.pending?.round, 1);
  });

  it("gives each GM 60 seconds and auto-picks a legal name when the clock hits zero", () => {
    const started = locked();
    assert.equal(ELIM_PICK_CLOCK_MS, 60_000);
    const clock = started.elim?.pickClockUntil ?? 0;
    assert.ok(clock > Date.now());
    assert.ok(clock - Date.now() <= ELIM_PICK_CLOCK_MS + 50);
    assert.equal(timeoutElim(started, 0, clock - 1), started);

    const legal = legalElimPicks(started.elim!, started.cash[0], 0);
    const auto = timeoutElim(started, 0, clock, 0);
    assert.equal(auto.elim?.picks[0][0]?.player.id, legal[0]?.id);
    assert.equal(auto.currentBidder, 1);
    assert.equal(auto.elim?.pickClockUntil, null);
    assert.ok(auto.elim?.pickHoldUntil);

    const last = legal[legal.length - 1]!;
    const other = timeoutElim(started, 0, clock, 0.999);
    assert.equal(other.elim?.picks[0][0]?.player.id, last.id);

    const duringHold = timeoutElim(auto, 1, (auto.elim?.pickHoldUntil ?? 1) - 1);
    assert.equal(duringHold, auto);
    const afterHoldClock = afterHold(auto);
    assert.ok((afterHoldClock.elim?.pickClockUntil ?? 0) > (auto.elim?.pickHoldUntil ?? 0));
    assert.equal(timeoutElim(afterHoldClock, 1, (afterHoldClock.elim?.pickClockUntil ?? 1) - 1), afterHoldClock);
  });

  it("does not start a week until both GMs press play", () => {
    const matchup = draftAll(locked());
    const home = applyAction(matchup, { type: "startReveal" }, 0);
    assert.equal(home.phase, "matchup");
    assert.deepEqual(home.elim?.weekReady, [true, false]);
    const twice = applyAction(home, { type: "startReveal" }, 0);
    assert.equal(twice.phase, "matchup");
    const away = applyAction(home, { type: "startReveal" }, 1);
    assert.equal(away.phase, "reveal");
    assert.deepEqual(away.elim?.weekReady, [false, false]);
    assert.ok(away.elim?.revealAt);

    const week1 = closeReveal(forceWeekScores(matchup, 40, 10));
    assert.equal(week1.phase, "matchup");
    assert.ok(week1.elim?.lastSet);
    assert.deepEqual(week1.elim?.weekReady, [false, false]);
    const onlyHome = applyAction(week1, { type: "startReveal" }, 0);
    assert.equal(onlyHome.phase, "matchup");
    assert.equal(onlyHome.elim?.lastSet?.scores[0], 40);
  });
});

describe("elimination byes", () => {
  it("treats only the official team bye as BYE and scores the next week", () => {
    const season = buildSeason(2024);
    const dest = season.D[0]!;
    const kicker = season.K[0]!;
    assert.ok(dest && kicker);
    assert.ok(dest.bye >= 1 && dest.bye <= 18);
    assert.ok(kicker.bye >= 1 && kicker.bye <= 18);
    assert.equal(isByeWeek(dest, dest.bye), true);
    assert.equal(isByeWeek(dest, dest.bye === 1 ? 2 : dest.bye - 1), false);
    const next = replacementWeek(2024, dest.bye);
    assert.notEqual(next, 17);
    assert.notEqual(next, 18);
    assert.ok(playableWeeks(2024).includes(next));
    assert.equal(scoredWeek(dest, dest.bye, 2024), dest.weeks[next - 1]);
    assert.equal(scoredWeek(dest, next, 2024), dest.weeks[next - 1]);

    const ben = buildSeason(2016).QB.find((p) => p.name === "Ben Roethlisberger");
    assert.ok(ben);
    assert.equal(ben.bye, 8);
    assert.equal(isByeWeek(ben, 7), false);
    assert.equal(isByeWeek(ben, 8), true);
    assert.equal(scoredWeek(ben, 7, 2016), 0);
    assert.equal(scoredWeek(ben, 8, 2016), ben.weeks[8]);
    assert.equal(replacementWeek(2016, 17), 1);
    assert.equal(replacementWeek(2016, 16), 1);
    assert.equal(replacementWeek(2024, 16), 1);
    assert.equal(replacementWeek(2024, 17), 1);
    assert.equal(replacementWeek(2024, 18), 1);
  });

  it("never uses hidden late weeks as a matchup", () => {
    for (const year of ELIM_YEARS) {
      const playable = playableWeeks(year);
      assert.ok(!playable.includes(17), `${year} still has week 17`);
      assert.ok(!playable.includes(18), `${year} still has week 18`);
      if (year <= 2020) {
        assert.deepEqual(playable, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], `${year} must play weeks 1-15`);
      } else {
        assert.deepEqual(playable, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], `${year} must play weeks 1-16`);
      }
    }
    assert.notEqual(unusedWeek(2024, [1, 2, 3]), 17);
    assert.notEqual(unusedWeek(2024, [1, 2, 3]), 18);
    assert.notEqual(startElimination("Alex", "Sam", undefined, { year: 2016, week: 16 }).elim?.week, 16);
    assert.notEqual(startElimination("Alex", "Sam", undefined, { year: 2016, week: 17 }).elim?.week, 17);
    assert.notEqual(startElimination("Alex", "Sam", undefined, { year: 2024, week: 17 }).elim?.week, 17);
    assert.notEqual(startElimination("Alex", "Sam", undefined, { year: 2024, week: 18 }).elim?.week, 18);
    for (let i = 0; i < 40; i += 1) {
      const week = unusedWeek(2016, []);
      assert.notEqual(week, 16);
      assert.notEqual(week, 17);
      assert.notEqual(week, 18);
      assert.ok(playableWeeks(2016).includes(week));
    }
  });

  it("shows BYE for 1.5s then rolls only that player, and holds the last cell extra", () => {
    const matchup = draftAll(locked(2024, 5));
    assert.ok(matchup.elim);
    const dest = matchup.elim.picks[1].find((pick) => pick.slot === "D" || pick.pos === "D");
    assert.ok(dest);
    const weeks = dest.player.weeks.map((pts, i) => (i === 4 ? 0 : i === 5 ? 13.4 : pts));
    const player = { ...dest.player, bye: 5, weeks };
    const clear = (side: typeof matchup.elim.picks[0], keep: string) =>
      side.map((pick) =>
        pick.player.id === keep ? { ...pick, player } : { ...pick, player: { ...pick.player, bye: 0 } },
      );
    const picks: typeof matchup.elim.picks = [
      clear(matchup.elim.picks[0], dest.player.id),
      clear(matchup.elim.picks[1], dest.player.id),
    ];
    const elim = { ...matchup.elim, week: 5, picks };
    const lastPos = ELIM_SLOTS.length - 1;
    const opened = Date.now();
    const atOpen = { ...elim, revealAt: opened - lastPos * 2 * ELIM_REVEAL_MS - ELIM_REVEAL_MS };
    assert.equal(byeHasRolled(atOpen, lastPos, 1, opened), false);
    assert.equal(byeHasRolled(atOpen, lastPos, 1, opened + ELIM_REVEAL_MS - 1), false);
    assert.equal(byeHasRolled(atOpen, lastPos, 1, opened + ELIM_REVEAL_MS), true);
    assert.equal(scoredWeek(player, 5, 2024), 13.4);

    const revealing: GameState = {
      ...matchup,
      phase: "reveal",
      elim: { ...elim, revealAt: Date.now() - ELIM_REVEAL_STEPS * ELIM_REVEAL_MS },
    };
    assert.equal(elimRevealReady(revealing.elim!, Date.now()), false);
    assert.equal(finishElimination(revealing).phase, "reveal");

    const readyAt = Date.now();
    const ready: GameState = {
      ...matchup,
      phase: "reveal",
      elim: { ...elim, revealAt: readyAt - ELIM_REVEAL_STEPS * ELIM_REVEAL_MS - ELIM_REVEAL_MS },
    };
    assert.equal(elimRevealReady(ready.elim!, readyAt), true);
    const finished = finishElimination(ready);
    assert.equal(finished.phase, "matchup");
    assert.equal(finished.elim?.lastSet?.scores[1], elimTotals({ ...elim, week: 5 })[1]);
  });

  it("gives a mid-board bye its own 1.5s reroll before the next player opens", () => {
    const matchup = draftAll(locked(2024, 5));
    assert.ok(matchup.elim);
    const qb = matchup.elim.picks[0].find((pick) => pick.slot === "QB")!;
    const weeks = qb.player.weeks.map((pts, i) => (i === 4 ? 0 : i === 5 ? 18.2 : pts));
    const player = { ...qb.player, bye: 5, weeks };
    const clear = (side: typeof matchup.elim.picks[0], keep: string) =>
      side.map((pick) =>
        pick.player.id === keep ? { ...pick, player } : { ...pick, player: { ...pick.player, bye: 0 } },
      );
    const picks: typeof matchup.elim.picks = [
      clear(matchup.elim.picks[0], qb.player.id),
      clear(matchup.elim.picks[1], qb.player.id),
    ];
    const t0 = Date.now();
    const elim = { ...matchup.elim, week: 5, picks, revealAt: t0 };
    assert.equal(revealedCount(elim, t0), 1);
    assert.equal(revealedCount(elim, t0 + ELIM_REVEAL_MS - 1), 1);
    assert.equal(byeHasRolled(elim, 0, 0, t0 + ELIM_REVEAL_MS - 1), false);
    assert.equal(revealedCount(elim, t0 + ELIM_REVEAL_MS), 1);
    assert.equal(byeHasRolled(elim, 0, 0, t0 + ELIM_REVEAL_MS), true);
    assert.equal(revealOpen(1, 0, 1), false);
    assert.equal(revealedCount(elim, t0 + 2 * ELIM_REVEAL_MS - 1), 1);
    assert.equal(revealedCount(elim, t0 + 2 * ELIM_REVEAL_MS), 2);
    assert.equal(revealOpen(2, 0, 1), true);

    const revealing: GameState = {
      ...matchup,
      phase: "reveal",
      elim: { ...elim, revealAt: t0 - ELIM_REVEAL_STEPS * ELIM_REVEAL_MS },
    };
    assert.equal(elimRevealReady(revealing.elim!, t0), false);
    const ready: GameState = {
      ...matchup,
      phase: "reveal",
      elim: { ...elim, revealAt: t0 - (ELIM_REVEAL_STEPS + 1) * ELIM_REVEAL_MS },
    };
    assert.equal(elimRevealReady(ready.elim!, t0), true);
  });
});
