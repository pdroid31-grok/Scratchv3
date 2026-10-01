import { parseOwned, NEWS_ID, type AvatarId } from "../avatars";
import { isAwardSkippedName, isHiddenBoardId, isHiddenBoardName } from "../stats-shared";
import { maybeGrantHunters } from "./shop";

export type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export function skipWho(userId: string, name?: string | null): boolean {
  if (isHiddenBoardId(userId)) return true;
  if (isHiddenBoardName(name) || isAwardSkippedName(name)) return true;
  return false;
}

export function skipBoardRow(userId: string, name?: string | null): boolean {
  return isHiddenBoardId(userId) || isHiddenBoardName(name) || isAwardSkippedName(name);
}

export async function grantFeat(sql: Sql, userId: string, featId: AvatarId): Promise<void> {
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
  try {
    const { recordLookUnlockNews } = await import("../news.server");
    await recordLookUnlockNews(sql, userId, featId, "feats");
  } catch (err) {
    console.error("[darkness] feat unlock news failed", err);
  }
  try {
    const { grantFeatScratchPoints } = await import("../scratch.server");
    await grantFeatScratchPoints(sql, userId, featId);
  } catch (err) {
    console.error("[darkness] feat scratch points failed", err);
  }
  try {
    await maybeGrantHunters(sql, userId);
  } catch (err) {
    console.error("[darkness] hunter ladder failed", err);
  }
}

/** Click on the Weekly Update news line only. Hidden names earn the look and are not posted. */
export async function grantNewsClick(sql: Sql, userId: string): Promise<void> {
  if (!userId) return;
  const rows = await sql.query<{ owned: unknown; name: string | null }>(
    `select p.owned,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where p.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return;
  if (!skipWho(userId, row.name)) {
    await grantFeat(sql, userId, NEWS_ID);
    return;
  }
  const owned = parseOwned(row.owned);
  if (owned.includes(NEWS_ID)) return;
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify([...owned, NEWS_ID]),
    userId,
  ]);
}
