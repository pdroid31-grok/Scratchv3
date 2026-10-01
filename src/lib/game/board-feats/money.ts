import { EASY_DOLLAR_ID, HERO_ID, ROBBED_ID, TREND_FROM, easyDollarHit, heroHit, robbedHit } from "../avatars";
import { grantFeat, type Sql } from "./grant";

export async function maybeGrantEasyDollar(sql: Sql, userId: string, day: string): Promise<void> {
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
    if (!easyDollarHit(played)) return;
    await grantFeat(sql, userId, EASY_DOLLAR_ID);
  } catch (err) {
    console.error("[darkness] easy dollar grant failed", err);
  }
}

export async function maybeGrantHeroRobbed(
  sql: Sql,
  userId: string,
  day: string,
  picks: readonly { cost?: number; score?: number }[],
): Promise<void> {
  try {
    if (!day || day < TREND_FROM) return;
    if (heroHit(picks)) await grantFeat(sql, userId, HERO_ID);
    if (robbedHit(picks)) await grantFeat(sql, userId, ROBBED_ID);
  } catch (err) {
    console.error("[darkness] hero robbed grant failed", err);
  }
}
