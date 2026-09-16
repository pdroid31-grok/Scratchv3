import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ELIM_SLOTS } from "./elim-data";
import { remainingAfter } from "./elim";
import {
  WEEKLY_SCORE_LINE,
  applyWeeklyLive,
  canViewWeeklyLineup,
  fillSnapOpponents,
  hydrateWeeklyPicks,
  spreadPpr,
  startWeeklyGame,
  tiedWeeklyWinners,
  unpackWeeklyBoard,
  weeklyCenterGame,
  weeklyKey,
  weeklyLockPayload,
  weeklyScorePays,
  weeklyTotal,
  weeklyVsLabel,
  weeklyPickPayload,
  withPackedProjections,
  weeklyTeamBlocked,
  blockWeeklyTeams,
  skipWeeklyMigrationGame,
  weeklyMigrationSkipTeam,
  weeklyMigrationSundayLockMs,
  applyWeeklyMigrationBoard,
  isWeeklyMigrationWeek,
} from "./weekly";
import { stampsInWeek, weekOpponents, fillPackedOpponents, ymdInTz, buildWeeklyBoard, isInjuredForWeekly, weekPhase } from "./weekly-sleeper";

describe("weekly scoring", () => {
  it("pays $1 only when the score is over 100", () => {
    assert.equal(weeklyScorePays(WEEKLY_SCORE_LINE), false);
    assert.equal(weeklyScorePays(100.1), true);
    assert.equal(weeklyScorePays(161), true);
  });

  it("gives every tied top score the win", () => {
    assert.deepEqual(
      tiedWeeklyWinners([
        { userId: "a", score: 142.4 },
        { userId: "b", score: 138 },
        { userId: "c", score: 142.4 },
      ]),
      ["a", "c"],
    );
    assert.deepEqual(tiedWeeklyWinners([{ userId: "a", score: 100 }]), ["a"]);
    assert.deepEqual(tiedWeeklyWinners([]), []);
  });

  it("hides other lineups until the week is awarded", () => {
    assert.equal(canViewWeeklyLineup(false, false, "me", "me"), true);
    assert.equal(canViewWeeklyLineup(false, false, "me", "you"), false);
    assert.equal(canViewWeeklyLineup(false, false, null, "me"), false);
    assert.equal(canViewWeeklyLineup(true, false, "me", "you"), true);
    assert.equal(canViewWeeklyLineup(true, false, null, "you"), true);
    assert.equal(canViewWeeklyLineup(false, true, null, "you"), true);
    assert.equal(canViewWeeklyLineup(false, true, "me", "you"), true);
  });

  it("stamps a season-week key", () => {
    assert.equal(weeklyKey(2026, 1), "2026-W01");
    assert.equal(weeklyKey(2026, 18), "2026-W18");
  });

  it("blocks SEA and NE for the week-1 late window", () => {
    assert.equal(weeklyTeamBlocked("SEA"), true);
    assert.equal(weeklyTeamBlocked("NE"), true);
    assert.equal(weeklyTeamBlocked("KC"), false);
    const pack = blockWeeklyTeams(
      {
        QB: [{ id: "q", sid: "1", name: "Q", pos: "QB", team: "SEA", cost: 10, ppr: 20 }],
        RB: [{ id: "r", sid: "2", name: "R", pos: "RB", team: "KC", cost: 9, ppr: 18 }],
        WR: [],
        TE: [],
        K: [],
        D: [{ id: "d", sid: "3", name: "Pats", pos: "D", team: "NE", cost: 1, ppr: 7 }],
      },
      new Set(["SEA", "NE"]),
    );
    assert.equal(pack.QB[0]?.blocked, true);
    assert.equal(pack.RB[0]?.blocked, false);
    assert.equal(pack.D[0]?.blocked, true);
  });

  it("scopes the 2026-W2 TNF skip to that week only", () => {
    assert.equal(isWeeklyMigrationWeek(2026, 2), true);
    assert.equal(isWeeklyMigrationWeek(2026, 3), false);
    assert.equal(skipWeeklyMigrationGame(2026, 2, "DET", "BUF"), true);
    assert.equal(skipWeeklyMigrationGame(2026, 3, "DET", "BUF"), false);
    assert.equal(weeklyMigrationSkipTeam(2026, 2, "buf"), true);
    assert.equal(weeklyMigrationSkipTeam(2026, 3, "BUF"), false);
    const lock = weeklyMigrationSundayLockMs(2026, 2, ["2026-09-17", "2026-09-20", "2026-09-21"]);
    assert.equal(lock, Date.parse("2026-09-20T13:00:00-04:00"));
    assert.equal(weeklyMigrationSundayLockMs(2026, 3, ["2026-09-24", "2026-09-27"]), null);
    const pack = applyWeeklyMigrationBoard(
      {
        QB: [
          { id: "q1", sid: "1", name: "Allen", pos: "QB", team: "BUF", cost: 10, ppr: 22 },
          { id: "q2", sid: "2", name: "Mahomes", pos: "QB", team: "KC", cost: 9, ppr: 21 },
        ],
        RB: [],
        WR: [],
        TE: [],
        K: [],
        D: [{ id: "d", sid: "3", name: "Lions", pos: "D", team: "DET", cost: 1, ppr: 8 }],
      },
      2026,
      2,
    );
    assert.equal(pack.QB.length, 1);
    assert.equal(pack.QB[0]?.team, "KC");
    assert.equal(pack.D.length, 0);
  });
});

describe("weekly kickoff window", () => {
  it("drops preseason calendar noise and keeps regular week 1 kickoffs", () => {
    const first = "2026-09-09";
    const last = "2026-09-14";
    const stamps = [
      Date.parse("2026-08-06T07:00:00Z"),
      Date.parse("2026-08-27T07:00:00Z"),
      Date.parse("2026-09-06T07:00:00Z"),
      Date.parse("2026-09-10T00:20:00Z"),
      Date.parse("2026-09-11T00:35:00Z"),
      Date.parse("2026-09-13T17:00:00Z"),
      Date.parse("2026-09-15T00:15:00Z"),
      Date.parse("2026-09-16T07:00:00Z"),
    ];
    const kept = stampsInWeek(stamps, first, last);
    assert.deepEqual(
      kept.map((ms) => new Date(ms).toISOString()),
      [
        "2026-09-10T00:20:00.000Z",
        "2026-09-11T00:35:00.000Z",
        "2026-09-13T17:00:00.000Z",
        "2026-09-15T00:15:00.000Z",
      ],
    );
    assert.equal(ymdInTz(kept[0]!), first);
  });

  it("is not live before kickoff even if Sleeper says scheduled", () => {
    const lockAt = Date.parse("2026-09-10T00:20:00.000Z");
    const endAt = Date.parse("2026-09-16T04:00:00.000Z");
    const morning = Date.parse("2026-09-09T12:33:00.000Z");
    const before = weekPhase(morning, lockAt, endAt, ["scheduled", "pre_game", ""]);
    assert.equal(before.open, true);
    assert.equal(before.live, false);
    assert.equal(before.done, false);
    const kick = weekPhase(lockAt, lockAt, endAt, ["pre_game"]);
    assert.equal(kick.open, false);
    assert.equal(kick.live, true);
    const playing = weekPhase(lockAt + 3_600_000, lockAt, endAt, ["in_game", "pre_game"]);
    assert.equal(playing.live, true);
    const closed = weekPhase(endAt, lockAt, endAt, ["final", "complete"]);
    assert.equal(closed.live, false);
    assert.equal(closed.done, true);
  });
});

describe("weekly board spread", () => {
  it("keeps the top names and a 50% extra gap", () => {
    const ranked = Array.from({ length: 24 }, (_, i) => ({ ppr: 30 - i }));
    const picked = spreadPpr(ranked, (row) => row.ppr, 10, 1.8, 4);
    assert.equal(picked.length, 10);
    assert.equal(picked[0]?.ppr, 30);
    assert.equal(picked[1]?.ppr, 29);
    assert.equal(picked[2]?.ppr, 28);
    assert.equal(picked[3]?.ppr, 27);
    assert.ok((picked[9]?.ppr ?? 0) < (ranked[9]?.ppr ?? 0));
    const gap = ranked[0]!.ppr - ranked[9]!.ppr;
    assert.ok(picked[0]!.ppr - picked[9]!.ppr >= gap * 1.8 - 1);
  });

  it("spaces kickers and defense from the top two down to the extra-deep floor", () => {
    const ranked = Array.from({ length: 20 }, (_, i) => ({ ppr: 20 - i }));
    const picked = spreadPpr(ranked, (row) => row.ppr, 5, 1.8, 2);
    assert.equal(picked.length, 5);
    assert.equal(picked[0]?.ppr, 20);
    assert.equal(picked[1]?.ppr, 19);
    assert.ok((picked[4]?.ppr ?? 0) < (ranked[4]?.ppr ?? 0));
  });
});

describe("weekly picks", () => {
  it("hydrates stored snaps with live sleeper points", () => {
    const snaps = hydrateWeeklyPicks(
      [
        { slot: "QB", id: "w:2026:QB:1", sid: "1", name: "Lamar Jackson", team: "BAL", cost: 10, score: 0 },
        { slot: "TE", id: "w:2026:TE:2", sid: "2", name: "Travis Kelce", team: "KC", cost: 5, score: 4.2 },
      ],
      { "1": 28.4 },
    );
    assert.equal(snaps[0]?.name, "Lamar Jackson");
    assert.equal(snaps[0]?.score, 28.4);
    assert.equal(snaps.find((row) => row.slot === "TE")?.score, 4.2);
    assert.equal(weeklyTotal(snaps), 32.6);
    const liveBoard = hydrateWeeklyPicks(
      [
        { slot: "QB", id: "w:2026:QB:1", sid: "1", name: "Lamar Jackson", team: "BAL", cost: 10, score: 22.4 },
        { slot: "TE", id: "w:2026:TE:2", sid: "2", name: "Travis Kelce", team: "KC", cost: 5, score: 14.2 },
      ],
      { "1": 6.1 },
      "zero",
    );
    assert.equal(liveBoard[0]?.score, 6.1);
    assert.equal(liveBoard.find((row) => row.slot === "TE")?.score, 0);
  });

  it("stores projections on lock snaps, not a 0.0 actual", () => {
    const snaps = weeklyPickPayload(
      [
        {
          slot: "QB",
          pos: "QB",
          seat: 0,
          player: {
            id: "qb",
            name: "Lamar",
            pos: "QB",
            team: "BAL",
            cost: 10,
            ppr: 22.4,
            weeks: Array(18).fill(0),
            bye: 0,
          },
        },
      ],
      { qb: "1" },
    );
    assert.equal(snaps[0]?.score, 22.4);
    const packed = {
      QB: [{ id: "qb", sid: "1", name: "Lamar", pos: "QB" as const, team: "BAL" as const, cost: 10, ppr: 22.4 }],
      RB: [],
      WR: [],
      TE: [],
      K: [],
      D: [],
    };
    const projected = withPackedProjections([{ slot: "QB", id: "qb", sid: "1", name: "Lamar", team: "BAL", cost: 10, score: 0 }], packed);
    assert.equal(projected[0]?.score, 22.4);
  });

  it("lets the last pick go down to $1 and never hands the clock to an opponent", () => {
    const pool = {
      QB: [{ id: "qb", name: "QB", pos: "QB" as const, team: "KC" as const, cost: 10, ppr: 20, weeks: Array(18).fill(0), bye: 0 }],
      RB: [
        { id: "rb1", name: "RB1", pos: "RB" as const, team: "SF" as const, cost: 9, ppr: 18, weeks: Array(18).fill(0), bye: 0 },
        { id: "rb2", name: "RB2", pos: "RB" as const, team: "BUF" as const, cost: 1, ppr: 8, weeks: Array(18).fill(0), bye: 0 },
      ],
      WR: [
        { id: "wr1", name: "WR1", pos: "WR" as const, team: "MIA" as const, cost: 8, ppr: 16, weeks: Array(18).fill(0), bye: 0 },
        { id: "wr2", name: "WR2", pos: "WR" as const, team: "CIN" as const, cost: 2, ppr: 9, weeks: Array(18).fill(0), bye: 0 },
      ],
      TE: [{ id: "te", name: "TE", pos: "TE" as const, team: "KC" as const, cost: 3, ppr: 10, weeks: Array(18).fill(0), bye: 0 }],
      K: [{ id: "k", name: "K", pos: "K" as const, team: "BAL" as const, cost: 1, ppr: 8, weeks: Array(18).fill(0), bye: 0 }],
      D: [{ id: "d", name: "D", pos: "D" as const, team: "CLE" as const, cost: 1, ppr: 7, weeks: Array(18).fill(0), bye: 0 }],
    };
    const state = startWeeklyGame("Pat", 2026, 1, {
      QB: [...pool.QB, ...Array.from({ length: 9 }, (_, i) => ({ ...pool.QB[0]!, id: `qb${i}`, cost: 9 - i }))],
      RB: [...pool.RB, ...Array.from({ length: 8 }, (_, i) => ({ ...pool.RB[1]!, id: `rbx${i}`, cost: 8 - i }))],
      WR: [...pool.WR, ...Array.from({ length: 8 }, (_, i) => ({ ...pool.WR[1]!, id: `wrx${i}`, cost: 7 - i }))],
      TE: [...pool.TE, ...Array.from({ length: 9 }, (_, i) => ({ ...pool.TE[0]!, id: `te${i}`, cost: 9 - i }))],
      K: [...pool.K, ...Array.from({ length: 4 }, (_, i) => ({ ...pool.K[0]!, id: `k${i}`, cost: 4 - i }))],
      D: [...pool.D, ...Array.from({ length: 4 }, (_, i) => ({ ...pool.D[0]!, id: `d${i}`, cost: 4 - i }))],
    });
    assert.ok(state.elim?.solo);
    assert.equal(state.elim?.year, 2026);
    assert.equal(state.elim?.week, 1);
    assert.equal(state.weekly?.season, 2026);
    assert.equal(state.currentBidder, 0);
    assert.equal(remainingAfter(state.elim!.round), ELIM_SLOTS.length - 1);
  });

  it("rebuilds a game center from live snaps", () => {
    const center = weeklyCenterGame("Pat", {
      season: 2026,
      week: 1,
      live: true,
      awarded: false,
      score: 44.4,
      picks: [
        { slot: "QB", id: "qb", sid: "1", name: "Lamar Jackson", team: "BAL", cost: 10, score: 28.4 },
        { slot: "RB1", id: "rb", sid: "2", name: "Bijan Robinson", team: "ATL", cost: 9, score: 16 },
      ],
    });
    assert.equal(center.phase, "matchup");
    assert.equal(center.weekly?.locked, true);
    assert.equal(center.elim?.lastSet?.scores[0], 44.4);
    assert.equal(center.elim?.picks[0][0]?.player.weeks[0], 28.4);
    const locked = weeklyLockPayload(center.elim!.picks[0]);
    assert.equal(locked[0]?.id, "qb");
    const next = applyWeeklyLive(center, {
      season: 2026,
      week: 1,
      live: true,
      awarded: false,
      score: 50,
      picks: [
        { slot: "QB", id: "qb", sid: "1", name: "Lamar Jackson", team: "BAL", cost: 10, score: 34 },
        { slot: "RB1", id: "rb", sid: "2", name: "Bijan Robinson", team: "ATL", cost: 9, score: 16 },
      ],
    });
    assert.equal(next.elim?.lastSet?.scores[0], 50);
    assert.equal(next.elim?.picks[0][0]?.player.weeks[0], 34);
  });
});

describe("weekly opponents", () => {
  it("formats VS plus the team abbreviation", () => {
    assert.equal(weeklyVsLabel("KC"), "VS KC");
    assert.equal(weeklyVsLabel(" buf "), "VS BUF");
    assert.equal(weeklyVsLabel(""), "");
    assert.equal(weeklyVsLabel(undefined), "");
  });

  it("maps each team to its week opponent", () => {
    const opp = weekOpponents([
      { week: 1, date: "2026-09-10", status: "pre_game", home: "KC", away: "BAL" },
      { week: 1, date: "2026-09-13", status: "pre_game", home: "PHI", away: "DAL" },
    ]);
    assert.equal(opp.KC, "BAL");
    assert.equal(opp.BAL, "KC");
    assert.equal(opp.PHI, "DAL");
    assert.equal(opp.DAL, "PHI");
    assert.equal(opp.WAS, undefined);
  });

  it("fills missing vs on packed boards and stored snaps", () => {
    const games = [{ week: 1, date: "2026-09-10", status: "pre_game", home: "BUF", away: "BAL" }];
    const packed = fillPackedOpponents(
      {
        QB: [{ id: "qb", sid: "1", name: "Lamar Jackson", pos: "QB", team: "BAL", cost: 10, ppr: 22 }],
        RB: [],
        WR: [],
        TE: [],
        K: [],
        D: [],
      },
      games,
    );
    assert.equal(packed.QB[0]?.vs, "BUF");
    const pool = unpackWeeklyBoard(packed, 1);
    assert.equal(pool.QB[0]?.vs, "BUF");
    const snaps = fillSnapOpponents(
      hydrateWeeklyPicks(
        [{ slot: "QB", id: "qb", sid: "1", name: "Lamar Jackson", team: "BAL", cost: 10, score: 0 }],
        {},
      ),
      weekOpponents(games),
    );
    assert.equal(snaps[0]?.vs, "BUF");
    const center = weeklyCenterGame("Pat", {
      season: 2026,
      week: 1,
      live: true,
      awarded: false,
      score: 0,
      picks: snaps,
    });
    assert.equal(center.elim?.picks[0][0]?.player.vs, "BUF");
  });

  it("keeps a stored vs on hydrate", () => {
    const snaps = hydrateWeeklyPicks(
      [{ slot: "QB", id: "qb", sid: "1", name: "Lamar Jackson", team: "BAL", cost: 10, score: 0, vs: "BUF" }],
      {},
    );
    assert.equal(snaps[0]?.vs, "BUF");
  });
});

describe("weekly board eligibility", () => {
  const games = [
    { week: 5, date: "2026-10-11", status: "pre_game", home: "KC", away: "BUF" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "PHI", away: "DAL" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "SF", away: "LAR" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "CIN", away: "BAL" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "DET", away: "GB" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "MIA", away: "NE" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "NYJ", away: "DEN" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "ATL", away: "TB" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "CHI", away: "WAS" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "MIN", away: "CLE" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "HOU", away: "IND" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "LAC", away: "LV" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "SEA", away: "ARI" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "NO", away: "NYG" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "PIT", away: "CAR" },
    { week: 5, date: "2026-10-11", status: "pre_game", home: "TEN", away: "JAX" },
  ];

  function row(
    id: string,
    name: string,
    pos: string,
    team: string,
    pts: number,
    injury?: { status?: string; part?: string; notes?: string },
  ) {
    const [first, ...rest] = name.split(" ");
    return {
      player_id: id,
      team,
      stats: { pts_ppr: pts },
      player: {
        first_name: first,
        last_name: rest.join(" "),
        position: pos,
        team,
        injury_status: injury?.status ?? null,
        injury_body_part: injury?.part ?? null,
        injury_notes: injury?.notes ?? null,
      },
    };
  }

  it("treats IR, Out, and surgery/ACL Questionable as injured", () => {
    assert.equal(isInjuredForWeekly({ injury_status: "IR" }), true);
    assert.equal(isInjuredForWeekly({ injury_status: "Out" }), true);
    assert.equal(isInjuredForWeekly({ injury_status: "PUP" }), true);
    assert.equal(isInjuredForWeekly({ injury_status: "Questionable", injury_body_part: "Knee - ACL", injury_notes: "Surgery" }), true);
    assert.equal(isInjuredForWeekly({ injury_status: "Questionable", injury_body_part: "Hamstring" }), false);
    assert.equal(isInjuredForWeekly({}), false);
  });

  it("skips injured and bye-week names, then keeps the extra spread", () => {
    const qbs = [
      row("1", "Patrick Mahomes", "QB", "KC", 24, { status: "Questionable", part: "Knee - ACL", notes: "Surgery" }),
      row("2", "Josh Allen", "QB", "BUF", 23),
      row("3", "Bye Backup", "QB", "TEN", 22),
      ...Array.from({ length: 20 }, (_, i) => row(String(10 + i), `QB ${i}`, "QB", i % 2 ? "PHI" : "DAL", 21.5 - i * 0.4)),
    ];
    // TEN is not in the 16-game slate above — treat as bye.
    const board = buildWeeklyBoard(qbs, 2026, 5, games.filter((g) => g.home !== "TEN" && g.away !== "JAX"));
    const names = board.QB.map((p) => p.name);
    assert.equal(names.includes("Patrick Mahomes"), false);
    assert.equal(names.includes("Bye Backup"), false);
    assert.equal(names[0], "Josh Allen");
    const gap = 23 - 18.3;
    assert.ok((board.QB[0]!.ppr - board.QB[9]!.ppr) >= gap * 1.8 - 1);
    assert.equal(board.QB[0]?.vs, "KC");
    assert.equal(board.QB.every((p) => Boolean(p.vs)), true);
  });
});
