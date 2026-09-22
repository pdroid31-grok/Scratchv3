/** Server-only board feats. Daily + Weekly + first scratch. */
import {
  parseOwned,
  hitBullseyeScore,
  hitHeavyHitterScore,
  skipHeavyHitterWeek,
  earlyBirdDayCount,
  lostGapHit,
  BULLSEYE_ID,
  RAINY_DAY_ID,
  EARLY_BIRD_ID,
  HEAVY_HITTER_ID,
  LOST_ID,
  VEGAS_ID,
  EARLY_BIRD_NEED,
  FEAT_TRACK_FROM,
  type AvatarId,
  type EarlyBirdRow,
} from "./avatars";
import { clipGm, isAwardSkippedName, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { isCommishSettingsUser } from "./commish-types";
import { dailyYesterday } from "./daily";

export const RAINY_DAY_FROM = "2026-09-19";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

function skipWho(userId: string, name?: string | null): boolean {
  if (isHiddenBoardId(userId) || isCommishSettingsUser(userId)) return true;
  if (isHiddenBoardName(name) || isAwardSkippedName(name)) return true;
  return false;
}

function skipBoardRow(userId: string, name?: string | null): boolean {
  return isHiddenBoardId(userId) || isHiddenBoardName(name) || isAwardSkippedName(name);
}

function asTime(value: unknown): number {
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

async function grantFeat(sql: Sql, userId: string, featId: AvatarId): Promise<void> {
  const rows = await sql.query<{ owned: unknown; name: string | null }>(
    `select p.owned,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where p.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row || skipWho(userId, row.name)) return;
  const owned = parseOwned(row.owned);
  if (owned.includes(featId)) return;
  const next = [...owned, featId];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  const { recordLookUnlockNews } = await import("./news.server");
  await recordLookUnlockNews(sql, userId, featId, "feats");
}

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

export async function maybeGrantHeavyHitter(
  sql: Sql,
  userId: string,
  season: number,
  week: number,
  picks: { score?: number }[],
): Promise<void> {
  try {
    if (skipHeavyHitterWeek(season, week)) return;
    if (!picks.some((row) => hitHeavyHitterScore(Number(row.score)))) return;
    await grantFeat(sql, userId, HEAVY_HITTER_ID);
  } catch (err) {
    console.error("[darkness] heavy hitter grant failed", err);
  }
}

export async function maybeGrantVegas(sql: Sql, userId: string): Promise<void> {
  try {
    await grantFeat(sql, userId, VEGAS_ID);
  } catch (err) {
    console.error("[darkness] vegas grant failed", err);
  }
}
