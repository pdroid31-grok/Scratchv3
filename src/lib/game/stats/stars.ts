/** Daily star looks. Catch-up + grant. */
import { parseOwned, starLooksFor, type AvatarId } from "../avatars";
import { clipDisplayName } from "../stats-shared";
import { asInt } from "./shared";

/** Append Daily Unlock looks the star count already earned. Never strips, never equips. */
export async function grantStarLooks(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  owned: AvatarId[],
  stars: number,
): Promise<AvatarId[]> {
  const missing = starLooksFor(stars).filter((id) => !owned.includes(id));
  if (!missing.length) return owned;
  const next = [...owned, ...missing];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  try {
    const { recordLookUnlockNews } = await import("../news.server");
    for (const id of missing) {
      await recordLookUnlockNews(sql, userId, id, "stars");
    }
  } catch (err) {
    console.error("[darkness] star unlock news failed", err);
  }
  return next;
}

export async function catchUpStarLooksAll(sql: {
  query: <T>(text: string, params?: unknown[]) => Promise<T[]>;
}): Promise<{ id: string; name: string; stars: number; added: AvatarId[] }[]> {
  const rows = await sql.query<{
    user_id: string;
    display_name: string | null;
    owned: unknown;
    daily_stars: number | string | null;
  }>(`select user_id, display_name, owned, coalesce(daily_stars, 0) as daily_stars from player_profiles`);
  const report: { id: string; name: string; stars: number; added: AvatarId[] }[] = [];
  for (const row of rows) {
    try {
      const owned = parseOwned(row.owned);
      const stars = Math.max(0, asInt(row.daily_stars));
      const missing = starLooksFor(stars).filter((id) => !owned.includes(id));
      if (!missing.length) continue;
      await grantStarLooks(sql, row.user_id, owned, stars);
      report.push({
        id: row.user_id,
        name: clipDisplayName(row.display_name ?? "") || "GM",
        stars,
        added: missing,
      });
    } catch {
      /* skip broken row */
    }
  }
  return report;
}

