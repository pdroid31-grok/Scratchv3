/** Earned feat grants. Move-only from stats.server. */
import {
  parseOwned,
  longestDayStreak,
  silverSecondDayCount,
  sniperWeekHit,
  hitBananaScore,
  hitBoxAddict,
  BANANA_ID,
  BANANA_SCORE_UNDER,
  BOX_ADDICT_ID,
  CROSSWORD_ID,
  CROSSWORD_STREAK_NEED,
  LOCKED_IN_ID,
  LOCKED_IN_STREAK_NEED,
  SNIPER_ID,
  SILVER_MEDAL_ID,
  SILVER_SECOND_NEED,
  THANOS_ID,
  THANOS_OWN_NEED,
  CLUB_200,
  CLUB_200_CAP,
  CLUB_200_ID,
  isStarAvatar,
  isFeatAvatar,
  type AvatarId,
} from "../avatars";

async function hitBanana(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ score: number | string | null }>(
      `select score
         from darkness_daily_runs
        where user_id = $1
          and status = 'done'
          and score is not null
        order by score asc
        limit 1`,
      [userId],
    );
    const score = rows[0]?.score;
    if (score == null) return false;
    return hitBananaScore(Number(score));
  } catch {
    return false;
  }
}

async function hitCrossword(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ day: string }>(
      `select distinct day::text as day
         from darkness_daily_runs
        where user_id = $1 and status = 'done'
        order by 1`,
      [userId],
    );
    return longestDayStreak(rows.map((row) => row.day.slice(0, 10))) >= CROSSWORD_STREAK_NEED;
  } catch {
    return false;
  }
}

async function hitLockedIn(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ day: string }>(
      `select distinct day::text as day
         from darkness_daily_runs
        where user_id = $1 and status = 'done'
        order by 1`,
      [userId],
    );
    return longestDayStreak(rows.map((row) => row.day.slice(0, 10))) >= LOCKED_IN_STREAK_NEED;
  } catch {
    return false;
  }
}

async function hitSniper(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ season: number | string; week: number | string; user_id: string; score: number | string }>(
      `select r.season, r.week, r.user_id, r.score
         from darkness_weekly_weeks w
         join darkness_weekly_runs r
           on r.season = w.season and r.week = w.week
        where w.awarded is true
          and r.status = 'done'
          and r.score is not null`,
    );
    const byWeek = new Map<string, { userId: string; score: number }[]>();
    for (const row of rows) {
      const key = `${row.season}-${row.week}`;
      const list = byWeek.get(key) ?? [];
      list.push({ userId: row.user_id, score: Number(row.score) || 0 });
      byWeek.set(key, list);
    }
    for (const list of byWeek.values()) {
      if (sniperWeekHit(list, userId)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function hitSilver(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ day: string; user_id: string; score: number | string }>(
      `select day::text as day, user_id, score
         from darkness_daily_runs
        where status = 'done' and score is not null`,
    );
    return (
      silverSecondDayCount(
        rows.map((row) => ({ day: String(row.day).slice(0, 10), userId: row.user_id, score: Number(row.score) || 0 })),
        userId,
      ) >= SILVER_SECOND_NEED
    );
  } catch {
    return false;
  }
}

export async function grantEarnedFeats(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  owned: AvatarId[],
): Promise<AvatarId[]> {
  const add: AvatarId[] = [];
  if (!owned.includes(BANANA_ID) && (await hitBanana(sql, userId))) add.push(BANANA_ID);
  if (!owned.includes(CROSSWORD_ID) && (await hitCrossword(sql, userId))) add.push(CROSSWORD_ID);
  if (!owned.includes(LOCKED_IN_ID) && (await hitLockedIn(sql, userId))) add.push(LOCKED_IN_ID);
  if (!owned.includes(SNIPER_ID) && (await hitSniper(sql, userId))) add.push(SNIPER_ID);
  if (!owned.includes(SILVER_MEDAL_ID) && (await hitSilver(sql, userId))) add.push(SILVER_MEDAL_ID);
  const unique = new Set(owned).size;
  if (!owned.includes(THANOS_ID) && unique >= THANOS_OWN_NEED) add.push(THANOS_ID);
  if (!owned.includes(BOX_ADDICT_ID) && hitBoxAddict(owned)) add.push(BOX_ADDICT_ID);
  if (!add.length) return owned;
  const next = [...owned, ...add];
  if (add.includes(BANANA_ID)) {
    await sql.query(`update player_profiles set owned = $1, avatar_id = $2, updated_at = now() where user_id = $3`, [
      JSON.stringify(next),
      BANANA_ID,
      userId,
    ]);
  } else {
    await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
      JSON.stringify(next),
      userId,
    ]);
  }
  await announceFeatUnlocks(sql, userId, add);
  return next;
}

async function grantBananaSweep(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }): Promise<void> {
  let rows: { user_id: string; owned: unknown }[] = [];
  try {
    rows = await sql.query(
      `select distinct p.user_id, p.owned
         from player_profiles p
         join darkness_daily_runs r on r.user_id = p.user_id
        where r.status = 'done'
          and r.score is not null
          and r.score < $1`,
      [BANANA_SCORE_UNDER],
    );
  } catch {
    return;
  }
  for (const row of rows) {
    const owned = parseOwned(row.owned);
    if (owned.includes(BANANA_ID)) continue;
    await grantEarnedFeats(sql, row.user_id, owned);
  }
}

async function grantBoxAddictSweep(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }): Promise<void> {
  let rows: { user_id: string; owned: unknown }[] = [];
  try {
    rows = await sql.query(`select user_id, owned from player_profiles`);
  } catch {
    return;
  }
  for (const row of rows) {
    const owned = parseOwned(row.owned);
    if (owned.includes(BOX_ADDICT_ID) || !hitBoxAddict(owned)) continue;
    await grantEarnedFeats(sql, row.user_id, owned);
  }
}

export async function grantSeedClub200(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  owned: AvatarId[],
): Promise<AvatarId[]> {
  if (owned.includes(CLUB_200_ID)) return owned;
  if (!(await hitClub200(sql, userId))) return owned;
  const next = [...owned, CLUB_200_ID];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  await announceFeatUnlocks(sql, userId, [CLUB_200_ID]);
  return next;
}

export async function hitClub200(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  const nights = await sql.query<{ ok: number | string }>(
    `select 1 as ok
       from player_nights
      where user_id = $1
        and coalesce(kind, 'auction') = 'elimination'
        and night_key not like 'bonus-win:%'
        and score > $2
        and score <= $3
      limit 1`,
    [userId, CLUB_200, CLUB_200_CAP],
  );
  if (nights[0]) return true;
  try {
    const daily = await sql.query<{ ok: number | string }>(
      `select 1 as ok
         from darkness_daily_runs
        where user_id = $1 and status = 'done' and score > $2 and score <= $3
        limit 1`,
      [userId, CLUB_200, CLUB_200_CAP],
    );
    return Boolean(daily[0]);
  } catch {
    return false;
  }
}

export function paidLooks(owned: readonly string[]): number {
  return owned.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
}

export async function announceFeatUnlocks(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  ids: readonly string[],
): Promise<void> {
  if (!ids.length) return;
  try {
    const { recordLookUnlockNews } = await import("../news.server");
    const { grantFeatScratchPoints } = await import("../scratch.server");
    for (const id of ids) {
      try {
        await grantFeatScratchPoints(sql, userId, id);
      } catch (err) {
        console.error("[darkness] feat scratch points failed", err);
      }
      await recordLookUnlockNews(sql, userId, id, "feats");
    }
  } catch (err) {
    console.error("[darkness] feat unlock news failed", err);
  }
}

