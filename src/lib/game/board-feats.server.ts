/** Server-only Bullseye / Rainy Day feats. Daily + Weekly only. */
import { parseOwned, hitBullseyeScore, BULLSEYE_ID, RAINY_DAY_ID, type AvatarId } from "./avatars";
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
