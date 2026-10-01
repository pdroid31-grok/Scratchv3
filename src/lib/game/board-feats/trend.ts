import { CANCELED_ID, TRENDING_ID, canceledHit, trendingHit, TREND_FROM } from "../avatars";
import { grantFeat, type Sql } from "./grant";

export async function maybeGrantScoreTrend(sql: Sql, userId: string, day: string): Promise<void> {
  try {
    if (!day || day < TREND_FROM) return;
    const rows = await sql.query<{ day: string; score: number | string }>(
      `select r.day::text as day, r.score
         from darkness_daily_runs r
        where r.user_id = $1
          and r.status = 'done'
          and r.score is not null
          and r.day >= $2::date`,
      [userId, TREND_FROM],
    );
    const played = rows.map((row) => ({ day: String(row.day).slice(0, 10), score: Number(row.score) }));
    if (trendingHit(played)) await grantFeat(sql, userId, TRENDING_ID);
    if (canceledHit(played)) await grantFeat(sql, userId, CANCELED_ID);
  } catch (err) {
    console.error("[darkness] score trend grant failed", err);
  }
}
