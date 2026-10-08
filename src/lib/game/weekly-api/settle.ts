/** Weekly settle and donut grants. Move-only from weekly-api.server. */
import { isAwardSkippedName } from "../stats-shared";
import {
  WEEKLY_PAY,
  WEEKLY_WIN_PAY,
  WEEKLY_WIN_STARS,
  hydrateWeeklyPicks,
  tiedWeeklyWinners,
  weeklyScorePays,
  weeklyTotal,
} from "../weekly";
import { finalSlateTeams, isWeekSlateFinal, weekWindow, weeklyLiveStats } from "../weekly-sleeper";
import type { Sql } from "./shared";
import { loadWeek } from "./tables";

async function grantWeeklyDoubleDonuts(sql: Sql, season: number, week: number): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const key = `double-donut:${season}-W${week}`;
  const already = await sql.query<{ key: string }>(`select key from darkness_weekly_flags where key = $1`, [key]);
  if (already[0]) return;
  const window = await weekWindow(season, week);
  if (!isWeekSlateFinal(window.games)) return;
  const { weeklyAwardEtDay } = await import("../double-trouble.server");
  const awardDay = weeklyAwardEtDay(window.games, window.endAt);
  const { DOUBLE_DONUT_FROM } = await import("../avatars");
  if (!awardDay || awardDay < DOUBLE_DONUT_FROM) {
    await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing`, [key]);
    return;
  }
  const live = await weeklyLiveStats(season, week);
  const finals = finalSlateTeams(window.games);
  const runs = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks from darkness_weekly_runs where season = $1 and week = $2 and status = 'done'`,
    [season, week],
  );
  const { maybeGrantDoubleDonutWeekly } = await import("../board-feats.server");
  for (const row of runs) {
    await maybeGrantDoubleDonutWeekly(sql, row.user_id, row.picks, live, awardDay, true, finals);
  }
  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing`, [key]);
}

async function grantWeeklyTripleDonuts(sql: Sql, season: number, week: number): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const key = `triple-donut:${season}-W${week}`;
  const already = await sql.query<{ key: string }>(`select key from darkness_weekly_flags where key = $1`, [key]);
  if (already[0]) return;
  const window = await weekWindow(season, week);
  if (!isWeekSlateFinal(window.games)) return;
  const { weeklyAwardEtDay } = await import("../double-trouble.server");
  const awardDay = weeklyAwardEtDay(window.games, window.endAt);
  const { TRIPLE_DONUT_FROM } = await import("../avatars");
  if (!awardDay || awardDay < TRIPLE_DONUT_FROM) {
    await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing`, [key]);
    return;
  }
  const live = await weeklyLiveStats(season, week);
  const finals = finalSlateTeams(window.games);
  const runs = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks from darkness_weekly_runs where season = $1 and week = $2 and status = 'done'`,
    [season, week],
  );
  const { maybeGrantTripleDonutWeekly } = await import("../board-feats.server");
  for (const row of runs) {
    await maybeGrantTripleDonutWeekly(sql, row.user_id, row.picks, live, awardDay, true, finals);
  }
  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing`, [key]);
}

async function grantWeeklyQuadDonuts(sql: Sql, season: number, week: number): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const key = `quad-donut:${season}-W${week}`;
  const already = await sql.query<{ key: string }>(`select key from darkness_weekly_flags where key = $1`, [key]);
  if (already[0]) return;
  const window = await weekWindow(season, week);
  if (!isWeekSlateFinal(window.games)) return;
  const { weeklyAwardEtDay } = await import("../double-trouble.server");
  const awardDay = weeklyAwardEtDay(window.games, window.endAt);
  const { TRIPLE_DONUT_FROM } = await import("../avatars");
  if (!awardDay || awardDay < TRIPLE_DONUT_FROM) {
    await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing`, [key]);
    return;
  }
  const live = await weeklyLiveStats(season, week);
  const finals = finalSlateTeams(window.games);
  const runs = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks from darkness_weekly_runs where season = $1 and week = $2 and status = 'done'`,
    [season, week],
  );
  const { maybeGrantQuadDonutWeekly } = await import("../board-feats.server");
  for (const row of runs) {
    await maybeGrantQuadDonutWeekly(sql, row.user_id, row.picks, live, awardDay, true, finals);
  }
  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing`, [key]);
}

async function settleWeek(sql: Sql, season: number, week: number): Promise<void> {
  const day = await loadWeek(sql, season, week);
  if (!day) return;
  const { recordPayout, weeklyScoreKey, weeklyWinKey, syncDailyStarsFromPayouts } = await import("../payouts");
  if (day.awarded) {
    try {
      const wins = await sql.query<{ user_id: string }>(
        `select user_id from darkness_payouts
          where kind = 'weekly_win' and source_key like $1`,
        [`weekly_win:${season}-W${week}:%`],
      );
      for (const row of wins) {
        await syncDailyStarsFromPayouts(sql, row.user_id);
      }
    } catch {
      /* payouts table may not exist yet */
    }
    try {
      await grantWeeklyDoubleDonuts(sql, season, week);
      await grantWeeklyTripleDonuts(sql, season, week);
      await grantWeeklyQuadDonuts(sql, season, week);
    } catch (err) {
      console.error("[darkness] double donut weekly failed", err);
    }
    try {
      const { maybeGrantMirrorWeek } = await import("../board-feats.server");
      await maybeGrantMirrorWeek(sql, season, week);
    } catch (err) {
      console.error("[darkness] mirror grant failed", err);
    }
    try {
      const { maybeGrantTwinWeek } = await import("../board-feats.server");
      await maybeGrantTwinWeek(sql, season, week, true);
    } catch (err) {
      console.error("[darkness] twin grant failed", err);
    }
    try {
      const window = await weekWindow(season, week);
      const { weeklyAwardEtDay } = await import("../double-trouble.server");
      const { maybeGrantThriftyWeekly } = await import("../board-feats.server");
      await maybeGrantThriftyWeekly(sql, season, week, weeklyAwardEtDay(window.games, window.endAt));
    } catch (err) {
      console.error("[darkness] thrifty grant failed", err);
    }
    return;
  }
  const window = await weekWindow(season, week);
  if (!window.done) return;
  const live = await weeklyLiveStats(season, week);
  const runs = await sql.query<{ user_id: string; picks: unknown; name: string | null }>(
    `select r.user_id, r.picks,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from darkness_weekly_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.season = $1 and r.week = $2 and r.status = 'done'`,
    [season, week],
  );
  const scored = runs.map((row) => {
    const picks = hydrateWeeklyPicks(row.picks, live, "zero");
    return { userId: row.user_id, score: weeklyTotal(picks), picks, skip: isAwardSkippedName(row.name) };
  });
  const winners = new Set(tiedWeeklyWinners(scored.filter((row) => !row.skip)));
  for (const row of scored) {
    const paid = weeklyScorePays(row.score) && !row.skip;
    const win = winners.has(row.userId);
    await sql.query(
      `update darkness_weekly_runs
          set score = $4, payout_score = $5, payout_win = $6, picks = $7::jsonb
        where season = $1 and week = $2 and user_id = $3`,
      [season, week, row.userId, row.score, paid, win, JSON.stringify(row.picks)],
    );
    if (paid) {
      await recordPayout(sql, {
        userId: row.userId,
        amount: WEEKLY_PAY,
        kind: "weekly_score",
        sourceKey: weeklyScoreKey(season, week, row.userId),
      });
    }
    if (win) {
      await recordPayout(sql, {
        userId: row.userId,
        amount: WEEKLY_WIN_PAY,
        stars: WEEKLY_WIN_STARS,
        kind: "weekly_win",
        sourceKey: weeklyWinKey(season, week, row.userId),
      });
      try {
        const { grantWinScratchPoints } = await import("../scratch.server");
        const { weeklyWinScratchKey } = await import("../scratch");
        await grantWinScratchPoints(sql, row.userId, weeklyWinScratchKey(season, week, row.userId));
      } catch (err) {
        console.error("[darkness] weekly win scratch points failed", err);
      }
    }
    try {
      const { maybeGrantBullseye, maybeGrantHeavyHitter, maybeGrantIronBoot } = await import("../board-feats.server");
      await maybeGrantBullseye(sql, row.userId, row.score);
      await maybeGrantHeavyHitter(sql, row.userId, season, week, row.picks);
      await maybeGrantIronBoot(sql, row.userId, season, week, row.picks, live);
    } catch (err) {
      console.error("[darkness] weekly feat grant failed", err);
    }
  }
  try {
    const { maybeGrantHospital } = await import("../board-feats.server");
    await maybeGrantHospital(
      sql,
      season,
      week,
      scored.map((row) => ({ userId: row.userId, picks: row.picks })),
    );
  } catch (err) {
    console.error("[darkness] hospital grant failed", err);
  }
  await sql.query(
    `update darkness_weekly_weeks set awarded = true where season = $1 and week = $2 and awarded = false`,
    [season, week],
  );
  try {
    const { maybeGrantFlashWeek, maybeGrantMirrorWeek } = await import("../board-feats.server");
    await maybeGrantFlashWeek(
      sql,
      season,
      week,
      scored.filter((row) => !row.skip).map((row) => ({ userId: row.userId, score: row.score })),
    );
    await maybeGrantMirrorWeek(sql, season, week);
  } catch (err) {
    console.error("[darkness] flash grant failed", err);
  }
  try {
    const { maybeGrantTwinWeek } = await import("../board-feats.server");
    await maybeGrantTwinWeek(sql, season, week, true);
  } catch (err) {
    console.error("[darkness] twin grant failed", err);
  }
  try {
    await grantWeeklyDoubleDonuts(sql, season, week);
    await grantWeeklyTripleDonuts(sql, season, week);
    await grantWeeklyQuadDonuts(sql, season, week);
  } catch (err) {
    console.error("[darkness] donut weekly failed", err);
  }
  try {
    const { weeklyAwardEtDay } = await import("../double-trouble.server");
    const { maybeGrantThriftyWeekly } = await import("../board-feats.server");
    await maybeGrantThriftyWeekly(sql, season, week, weeklyAwardEtDay(window.games, window.endAt));
  } catch (err) {
    console.error("[darkness] thrifty grant failed", err);
  }
  try {
    const { grantDoubleTroubleAfterWeekly } = await import("../double-trouble.server");
    await grantDoubleTroubleAfterWeekly(sql, {
      week,
      endAt: window.endAt,
      games: window.games,
      winnerIds: [...winners],
    });
  } catch (err) {
    console.error("[darkness] double trouble weekly failed", err);
  }
  try {
    const { recordNewsSafe, newsActor, formatNewsScore } = await import("../news.server");
    for (const row of scored) {
      if (!winners.has(row.userId)) continue;
      const actor = await newsActor(sql, row.userId);
      if (!actor) continue;
      await recordNewsSafe(sql, {
        sourceKey: `weekly_win:${season}-W${week}:${row.userId}`,
        payload: {
          kind: "weekly_win",
          faces: [{ name: actor.name, avatarId: actor.avatarId, userId: row.userId }],
          week: `Week ${week}`,
          score: formatNewsScore(row.score),
          scratchPoints: 200,
        },
      });
    }
  } catch (err) {
    console.error("[darkness] weekly news failed", err);
  }
  try {
    const { recordWeeklyWinToast } = await import("../toasts.server");
    for (const row of scored) {
      if (!winners.has(row.userId)) continue;
      await recordWeeklyWinToast(sql, {
        userId: row.userId,
        season,
        week,
        score: row.score,
        picks: row.picks,
      });
    }
  } catch (err) {
    console.error("[darkness] weekly toast failed", err);
  }
}

export async function settleSafe(sql: Sql, season: number, week: number): Promise<void> {
  try {
    await settleWeek(sql, season, week);
  } catch (err) {
    console.error("[darkness] weekly settle failed", err);
  }
}
