import { BACK2BACK_ID, parseOwned, stampDayGap } from "../avatars";
import { DAILY_LAUNCH, dailyYesterday } from "../daily";
import { grantFeat, skipWho, type Sql } from "./grant";
import { maybeGrantHunters } from "./shop";

const BACK2BACK_FLAG = "back2back-v1";

/** Two paid Daily wins on consecutive calendar days. A gap is not a row. */
export function back2backHit(days: readonly string[]): boolean {
  const sorted = [...new Set(days.filter((day) => day >= DAILY_LAUNCH))].sort();
  for (let i = 1; i < sorted.length; i += 1) {
    if (stampDayGap(sorted[i - 1]!, sorted[i]!) === 1) return true;
  }
  return false;
}

/** A new paid win. News and toast only when this day makes the pair. */
export async function maybeGrantBack2Back(sql: Sql, userId: string, day: string): Promise<void> {
  try {
    if (!userId || !day || day < DAILY_LAUNCH) return;
    const prior = dailyYesterday(day);
    if (prior < DAILY_LAUNCH) return;
    const rows = await sql.query<{ day: string }>(
      `select day::text as day
         from darkness_daily_runs
        where user_id = $1
          and status = 'done'
          and payout_win is true
          and day in ($2::date, $3::date)`,
      [userId, prior, day],
    );
    const held = new Set(rows.map((row) => String(row.day).slice(0, 10)));
    if (!held.has(prior) || !held.has(day)) return;
    await grantFeat(sql, userId, BACK2BACK_ID);
  } catch (err) {
    console.error("[darkness] back2back grant failed", err);
  }
}

async function grantSilent(sql: Sql, userId: string): Promise<void> {
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
  if (owned.includes(BACK2BACK_ID)) return;
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify([...owned, BACK2BACK_ID]),
    userId,
  ]);
  const { grantFeatScratchPoints } = await import("../scratch.server");
  await grantFeatScratchPoints(sql, userId, BACK2BACK_ID);
  await maybeGrantHunters(sql, userId);
}

/** Existing pairs only. No News. No toast. */
export async function grantBack2BackOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(`select key from darkness_feat_flags where key = $1`, [BACK2BACK_FLAG]);
  if (already[0]) return;
  const rows = await sql.query<{ user_id: string; day: string }>(
    `select user_id, day::text as day
       from darkness_daily_runs
      where status = 'done'
        and payout_win is true
        and day >= $1::date`,
    [DAILY_LAUNCH],
  );
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(String(row.day).slice(0, 10));
    byUser.set(row.user_id, list);
  }
  for (const [userId, days] of byUser) {
    if (!back2backHit(days)) continue;
    await grantSilent(sql, userId);
  }
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [BACK2BACK_FLAG]);
}
