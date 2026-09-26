import {
  hitBullseyeScore,
  earlyBirdDayCount,
  nightOwlDayCount,
  lostGapHit,
  comebackKidHit,
  freeFallHit,
  BULLSEYE_ID,
  RAINY_DAY_ID,
  EARLY_BIRD_ID,
  LOST_ID,
  NIGHT_OWL_ID,
  COMEBACK_KID_ID,
  FREE_FALL_ID,
  TWIN_ID,
  TWIN_FROM,
  twinUserIds,
  EARLY_BIRD_NEED,
  NIGHT_OWL_NEED,
  FEAT_TRACK_FROM,
  lineupSignature,
  type EarlyBirdRow,
} from "../avatars";
import { clipGm } from "../stats-shared";
import { dailyDayStamp, dailyYesterday } from "../daily";
import { grantFeat, skipBoardRow, type Sql } from "./grant";
import { asPicks, asTime, visibleContest, type DailyContestRow } from "./place-weekly";

export const RAINY_DAY_FROM = "2026-09-19";

export async function maybeGrantBullseye(sql: Sql, userId: string, score: number): Promise<void> {
  if (!hitBullseyeScore(score)) return;
  try {
    await grantFeat(sql, userId, BULLSEYE_ID);
  } catch (err) {
    console.error("[darkness] bullseye grant failed", err);
  }
}

async function lastPlaceIds(sql: Sql, day: string): Promise<string[]> {
  if (!day || day < RAINY_DAY_FROM) return [];
  const rows = await sql.query<{ user_id: string; name: string | null; score: number | string }>(
    `select r.user_id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
            r.score
       from darkness_daily_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.day = $1::date and r.status = 'done' and r.score is not null`,
    [day],
  );
  const visible: { userId: string; score: number }[] = [];
  for (const row of rows) {
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    visible.push({ userId: row.user_id, score });
  }
  if (visible.length < 2) return [];
  const min = Math.min(...visible.map((row) => row.score));
  return visible.filter((row) => row.score === min).map((row) => row.userId);
}

export async function maybeGrantRainyDay(sql: Sql, day: string): Promise<void> {
  try {
    if (!day || day < RAINY_DAY_FROM) return;
    const prev = dailyYesterday(day);
    if (prev < RAINY_DAY_FROM) return;
    const todayLast = await lastPlaceIds(sql, day);
    if (!todayLast.length) return;
    const prevLast = new Set(await lastPlaceIds(sql, prev));
    for (const userId of todayLast) {
      if (!prevLast.has(userId)) continue;
      await grantFeat(sql, userId, RAINY_DAY_ID);
    }
  } catch (err) {
    console.error("[darkness] rainy day grant failed", err);
  }
}

/** Grant once the user was the first visible Daily lock on 10 distinct ET days (>= 2026-09-17). Not the 10th lock overall. */
export async function maybeGrantEarlyBird(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{
      day: string;
      user_id: string;
      name: string | null;
      finished_at: unknown;
      started_at: unknown;
    }>(
      `select r.day::text as day,
              r.user_id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
              r.finished_at,
              r.started_at
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day >= $1::date and r.status = 'done'`,
      [FEAT_TRACK_FROM],
    );
    const visible: EarlyBirdRow[] = [];
    for (const row of rows) {
      if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
      const at = asTime(row.finished_at) || asTime(row.started_at);
      if (!at) continue;
      visible.push({ day: String(row.day).slice(0, 10), userId: row.user_id, at });
    }
    if (earlyBirdDayCount(userId, visible) < EARLY_BIRD_NEED) return;
    await grantFeat(sql, userId, EARLY_BIRD_ID);
  } catch (err) {
    console.error("[darkness] early bird grant failed", err);
  }
}

/** Grant once the user still holds last visible Daily lock on 10 distinct ET days (>= 2026-09-17). Last can move until midnight ET. */
export async function maybeGrantNightOwl(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{
      day: string;
      user_id: string;
      name: string | null;
      finished_at: unknown;
      started_at: unknown;
    }>(
      `select r.day::text as day,
              r.user_id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
              r.finished_at,
              r.started_at
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day >= $1::date and r.status = 'done'`,
      [FEAT_TRACK_FROM],
    );
    const today = dailyDayStamp();
    const visible: EarlyBirdRow[] = [];
    for (const row of rows) {
      if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
      const at = asTime(row.finished_at) || asTime(row.started_at);
      if (!at) continue;
      const day = String(row.day).slice(0, 10);
      if (day < today && dailyDayStamp(at) !== day) continue;
      visible.push({ day, userId: row.user_id, at });
    }
    if (nightOwlDayCount(userId, visible) < NIGHT_OWL_NEED) return;
    await grantFeat(sql, userId, NIGHT_OWL_ID);
  } catch (err) {
    console.error("[darkness] night owl grant failed", err);
  }
}

export async function maybeGrantLost(sql: Sql, userId: string, day: string): Promise<void> {
  try {
    if (!day || day < FEAT_TRACK_FROM) return;
    const prev = await sql.query<{ day: string }>(
      `select r.day::text as day
         from darkness_daily_runs r
        where r.user_id = $1 and r.status = 'done' and r.day < $2::date
        order by r.day desc
        limit 1`,
      [userId, day],
    );
    const prevDay = String(prev[0]?.day ?? "").slice(0, 10);
    if (!lostGapHit(prevDay, day)) return;
    await grantFeat(sql, userId, LOST_ID);
  } catch (err) {
    console.error("[darkness] lost grant failed", err);
  }
}

/** Twin for one Daily day. Same score, different full lineups. Hidden rows are not in the set. */
export async function maybeGrantTwinDay(sql: Sql, day: string): Promise<void> {
  try {
    if (!day || day < TWIN_FROM) return;
    const rows = await sql.query<DailyContestRow>(
      `select r.user_id, r.score, r.picks, r.finished_at, r.started_at,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day = $1::date and r.status = 'done' and r.score is not null`,
      [day],
    );
    const signed = visibleContest(rows).map((row) => ({
      userId: row.user_id,
      score: Number(row.score),
      signature: lineupSignature(asPicks(row.picks)),
    }));
    for (const userId of twinUserIds(signed)) await grantFeat(sql, userId, TWIN_ID);
  } catch (err) {
    console.error("[darkness] twin grant failed", err);
  }
}

async function visiblePlaceIds(sql: Sql, day: string, edge: "min" | "max"): Promise<string[]> {
  if (!day || day < FEAT_TRACK_FROM) return [];
  const rows = await sql.query<{ user_id: string; name: string | null; score: number | string }>(
    `select r.user_id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
            r.score
       from darkness_daily_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.day = $1::date and r.status = 'done' and r.score is not null`,
    [day],
  );
  const visible: { userId: string; score: number }[] = [];
  for (const row of rows) {
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    visible.push({ userId: row.user_id, score });
  }
  if (visible.length < 2) return [];
  const bound = edge === "min" ? Math.min(...visible.map((row) => row.score)) : Math.max(...visible.map((row) => row.score));
  return visible.filter((row) => row.score === bound).map((row) => row.userId);
}

async function dayAwarded(sql: Sql, day: string): Promise<boolean> {
  const rows = await sql.query<{ awarded: boolean }>(
    `select awarded from darkness_daily_days where day = $1::date`,
    [day],
  );
  return Boolean(rows[0]?.awarded);
}

export async function maybeGrantComebackPair(sql: Sql, day: string): Promise<void> {
  try {
    if (!day || day < FEAT_TRACK_FROM) return;
    const prev = dailyYesterday(day);
    if (prev < FEAT_TRACK_FROM) return;
    if (!(await dayAwarded(sql, day)) || !(await dayAwarded(sql, prev))) return;
    const prevLast = await visiblePlaceIds(sql, prev, "min");
    const prevFirst = await visiblePlaceIds(sql, prev, "max");
    const todayLast = await visiblePlaceIds(sql, day, "min");
    const todayFirst = await visiblePlaceIds(sql, day, "max");
    const ids = new Set([...prevLast, ...prevFirst, ...todayLast, ...todayFirst]);
    for (const userId of ids) {
      if (comebackKidHit(prevLast, todayFirst, userId)) await grantFeat(sql, userId, COMEBACK_KID_ID);
      if (freeFallHit(prevFirst, todayLast, userId)) await grantFeat(sql, userId, FREE_FALL_ID);
    }
  } catch (err) {
    console.error("[darkness] comeback pair grant failed", err);
  }
}
