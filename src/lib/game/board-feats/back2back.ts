import { BACK2BACK_ID, parseOwned, stampDayGap } from "../avatars";
import { dailyYesterday } from "../daily";
import { grantFeat, skipWho, type Sql } from "./grant";
import { maybeGrantHunters } from "./shop";

const BACK2BACK_FLAG = "back2back-v1";
const BACK2BACK_IMPORT_V2 = "back2back-import-v2";
/** Sep 2–15 imported wins are not payout_win. Live pairs start the next day. */
const PAYOUT_WIN_FROM = "2026-09-16";
/** Sign-in id. The seed id is 9Oc, not 90c. Do not grant the seed. */
const MARQUIS_SIGNIN_ID = "FWuvVwD2j9Lnc3tG90cNJcGwLdrzR1L4";
const BLENDER_SEED_ID = "9XfClEbu9fjWssgLlw8VUZFqYTqxIpCM";

/** Two payout_win days on consecutive calendar dates. Sep 2–15 is not in this set. */
export function back2backHit(days: readonly string[]): boolean {
  const sorted = [...new Set(days.filter((day) => day >= PAYOUT_WIN_FROM))].sort();
  for (let i = 1; i < sorted.length; i += 1) {
    if (stampDayGap(sorted[i - 1]!, sorted[i]!) === 1) return true;
  }
  return false;
}

/** A new paid win on or after Sep 16. News and toast only when this day makes the pair. */
export async function maybeGrantBack2Back(sql: Sql, userId: string, day: string): Promise<void> {
  try {
    if (!userId || !day || day < PAYOUT_WIN_FROM) return;
    const prior = dailyYesterday(day);
    if (prior < PAYOUT_WIN_FROM) return;
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

async function grantSilent(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql.query<{ owned: unknown }>(
    `select owned from player_profiles where user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return false;
  const owned = parseOwned(row.owned);
  if (owned.includes(BACK2BACK_ID)) return true;
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify([...owned, BACK2BACK_ID]),
    userId,
  ]);
  const { grantFeatScratchPoints } = await import("../scratch.server");
  await grantFeatScratchPoints(sql, userId, BACK2BACK_ID);
  await maybeGrantHunters(sql, userId);
  return true;
}

/** Seed, unless exactly one other Big Blender profile has a login. Never both. */
async function blenderGrantId(sql: Sql): Promise<string | null> {
  const rows = await sql.query<{ user_id: string }>(
    `select p.user_id
       from player_profiles p
      where lower(trim(p.display_name)) = 'big blender'
        and exists (select 1 from account a where a."userId" = p.user_id)
        and p.user_id <> $1`,
    [BLENDER_SEED_ID],
  );
  const newer = rows.map((row) => row.user_id);
  if (newer.length > 1) {
    console.error("[darkness] back2back blender logins", newer);
    return null;
  }
  if (newer.length === 1) return newer[0]!;
  return BLENDER_SEED_ID;
}

/** Marquis sign-in id and one Big Blender profile. No News. No toast. v1 does not skip this. */
export async function grantBack2BackImportOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_feat_flags where key = $1`,
    [BACK2BACK_IMPORT_V2],
  );
  if (already[0]) return;
  const marquisOk = await grantSilent(sql, MARQUIS_SIGNIN_ID);
  const blenderId = await blenderGrantId(sql);
  const blenderOk = blenderId ? await grantSilent(sql, blenderId) : false;
  if (!marquisOk || !blenderOk) return;
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [BACK2BACK_IMPORT_V2]);
}

/** Sep 16 on, payout_win only. No News. No toast. */
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
    [PAYOUT_WIN_FROM],
  );
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(String(row.day).slice(0, 10));
    byUser.set(row.user_id, list);
  }
  for (const [userId, days] of byUser) {
    if (skipWho(userId) || !back2backHit(days)) continue;
    await grantSilent(sql, userId);
  }
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [BACK2BACK_FLAG]);
}