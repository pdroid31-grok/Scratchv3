import { parseOwned, huntersToGrant, VEGAS_ID, COLD_STREAK_FROM, THREE_HEADED_FROM, threeHeadedHit } from "../avatars";
import { skipWho, type Sql } from "./grant";
import {
  maybeGrantBlueStreak,
  maybeGrantColdStreak,
  maybeGrantPenny,
  maybeGrantThreeHeaded,
  maybeGrantTripleDonutDaily,
  type LinePick,
} from "./lineup";

const HUNTER_LADDER_FLAG = "hunter-ladder-v1";

/** One dump of current standings. Toasts only. Does not write News. */
export async function grantHunterLadderOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_feat_flags where key = $1`,
    [HUNTER_LADDER_FLAG],
  );
  if (already[0]) return;
  const rows = await sql.query<{ user_id: string; owned: unknown; name: string | null }>(
    `select p.user_id, p.owned,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from player_profiles p
       left join "user" u on u.id = p.user_id`,
  );
  for (const row of rows) {
    if (skipWho(row.user_id, row.name)) continue;
    const owned = parseOwned(row.owned);
    const grants = huntersToGrant(owned);
    if (!grants.length) continue;
    const next = [...owned];
    for (const id of grants) {
      if (!next.includes(id)) next.push(id);
    }
    await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
      JSON.stringify(next),
      row.user_id,
    ]);
    const { recordUnlockToast } = await import("../toasts.server");
    const { grantFeatScratchPoints } = await import("../scratch.server");
    for (let i = 0; i < grants.length; i += 1) {
      const id = grants[i]!;
      await recordUnlockToast(sql, row.user_id, id, "feats");
      await sql.query(
        `update darkness_toasts
            set created_at = now() + ($2::int * interval '1 millisecond')
          where source_key = $1`,
        [`feat_unlock:${row.user_id}:${id}`, i],
      );
      await grantFeatScratchPoints(sql, row.user_id, id);
    }
    console.log(`[darkness] hunter ladder ${grants.join(",")}`);
  }
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [HUNTER_LADDER_FLAG]);
}

const VEGAS_CATCHUP_FLAG = "vegas-catchup-v1";

/** One silent pass. Already-scratched cards own Vegas. No News, no toast. */
export async function grantVegasCatchupOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_feat_flags where key = $1`,
    [VEGAS_CATCHUP_FLAG],
  );
  if (already[0]) return;
  const rows = await sql.query<{ user_id: string; owned: unknown; name: string | null }>(
    `select p.user_id, p.owned,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where exists (
        select 1
          from darkness_scratch_cards c
         where c.user_id = p.user_id
           and c.scratched_at is not null
      )`,
  );
  let granted = 0;
  for (const row of rows) {
    if (skipWho(row.user_id, row.name)) continue;
    const owned = parseOwned(row.owned);
    if (owned.includes(VEGAS_ID)) continue;
    await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
      JSON.stringify([...owned, VEGAS_ID]),
      row.user_id,
    ]);
    const { grantFeatScratchPoints } = await import("../scratch.server");
    await grantFeatScratchPoints(sql, row.user_id, VEGAS_ID);
    granted += 1;
  }
  console.log(`[darkness] vegas catch-up n=${granted}`);
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [VEGAS_CATCHUP_FLAG]);
}

const ROSTER_FEATS_FLAG = "roster-feats-2026-09-26";

/** One pass over locks already inside the from-dates. Later locks still grant on their own. */
export async function grantRosterFeatsOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_feat_flags where key = $1`,
    [ROSTER_FEATS_FLAG],
  );
  if (already[0]) return;
  const daily = await sql.query<{ user_id: string }>(
    `select distinct r.user_id
       from darkness_daily_runs r
      where r.status = 'done'
        and r.day >= $1::date`,
    [COLD_STREAK_FROM],
  );
  for (const row of daily) {
    await maybeGrantColdStreak(sql, row.user_id);
    await maybeGrantThreeHeadedFromDaily(sql, row.user_id);
    await maybeGrantTripleDonutDaily(sql, row.user_id);
    await maybeGrantPenny(sql, row.user_id);
    await maybeGrantBlueStreak(sql, row.user_id);
  }
  const weekly = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks
       from darkness_weekly_runs
      where status = 'done'
        and picks is not null
        and finished_at >= timestamptz '2026-09-26 00:00:00 America/New_York'`,
  );
  for (const row of weekly) {
    const picks = Array.isArray(row.picks) ? (row.picks as LinePick[]) : [];
    await maybeGrantThreeHeaded(
      sql,
      row.user_id,
      picks.map((pick) => String(pick.team ?? "")),
    );
  }
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [ROSTER_FEATS_FLAG]);
}

async function maybeGrantThreeHeadedFromDaily(sql: Sql, userId: string): Promise<void> {
  const rows = await sql.query<{ picks: unknown }>(
    `select r.picks
       from darkness_daily_runs r
      where r.user_id = $1
        and r.status = 'done'
        and r.day >= $2::date
        and r.picks is not null`,
    [userId, THREE_HEADED_FROM],
  );
  for (const row of rows) {
    const picks = Array.isArray(row.picks) ? (row.picks as LinePick[]) : [];
    if (!threeHeadedHit(picks.map((pick) => String(pick.team ?? "")))) continue;
    await maybeGrantThreeHeaded(sql, userId, picks.map((pick) => String(pick.team ?? "")));
    return;
  }
}
