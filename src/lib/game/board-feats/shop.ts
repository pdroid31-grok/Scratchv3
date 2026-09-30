import {
  parseOwned,
  huntersToGrant,
  threeLeafHit,
  VEGAS_ID,
  THREE_LEAF_ID,
  BOX_LUNCH_ID,
  STARPEPE_ID,
  FEAT_TRACK_FROM,
} from "../avatars";
import { dailyDayStamp } from "../daily";
import { grantFeat, skipWho, type Sql } from "./grant";

export async function maybeGrantHunters(sql: Sql, userId: string): Promise<void> {
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
  for (const id of huntersToGrant(parseOwned(row.owned))) {
    await grantFeat(sql, userId, id);
  }
}

export async function maybeGrantStarPepe(sql: Sql, userId: string, prizeKey: string): Promise<void> {
  if (prizeKey !== "star" && prizeKey !== "combo") return;
  try {
    await grantFeat(sql, userId, STARPEPE_ID);
  } catch (err) {
    console.error("[darkness] star pepe grant failed", err);
  }
}

export async function maybeGrantVegas(sql: Sql, userId: string): Promise<void> {
  try {
    await grantFeat(sql, userId, VEGAS_ID);
  } catch (err) {
    console.error("[darkness] vegas grant failed", err);
  }
}

export async function maybeGrantThreeLeaf(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ prize: string | null }>(
      `select distinct prize
         from darkness_scratch_cards
        where user_id = $1 and scratched_at is not null`,
      [userId],
    );
    if (!threeLeafHit(rows.map((row) => String(row.prize ?? "")))) return;
    await grantFeat(sql, userId, THREE_LEAF_ID);
  } catch (err) {
    console.error("[darkness] three leaf grant failed", err);
  }
}

export async function maybeGrantBoxLunch(sql: Sql, userId: string, at = Date.now()): Promise<void> {
  try {
    const day = dailyDayStamp(at);
    if (!day || day < FEAT_TRACK_FROM) return;
    const box = await sql.query<{ ok: number | string }>(
      `select 1 as ok
         from darkness_news
        where kind = 'box'
          and source_key like $1
          and to_char(created_at at time zone 'America/New_York', 'YYYY-MM-DD') = $2
        limit 1`,
      [`box:${userId}:%`, day],
    );
    const scratch = await sql.query<{ ok: number | string }>(
      `select 1 as ok
         from darkness_scratch_cards
        where user_id = $1
          and scratched_at is not null
          and to_char(scratched_at at time zone 'America/New_York', 'YYYY-MM-DD') = $2
        limit 1`,
      [userId, day],
    );
    if (!box[0] || !scratch[0]) return;
    await grantFeat(sql, userId, BOX_LUNCH_ID);
  } catch (err) {
    console.error("[darkness] box lunch grant failed", err);
  }
}

const PAT_BOX_LUNCH_ID = "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh";
const PAT_BOX_LUNCH_FLAG = "boxlunch-pat-v1";

/** One check. Same ET day must have box news and a scratched card. Does not invent either. */
export async function grantPatBoxLunchOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_feat_flags where key = $1`,
    [PAT_BOX_LUNCH_FLAG],
  );
  if (already[0]) return;
  const hit = await sql.query<{ ok: number | string }>(
    `select 1 as ok
       from darkness_news n
      where n.kind = 'box'
        and n.source_key like $1
        and to_char(n.created_at at time zone 'America/New_York', 'YYYY-MM-DD') >= $2
        and exists (
          select 1
            from darkness_scratch_cards c
           where c.user_id = $3
             and c.scratched_at is not null
             and to_char(c.scratched_at at time zone 'America/New_York', 'YYYY-MM-DD')
               = to_char(n.created_at at time zone 'America/New_York', 'YYYY-MM-DD')
        )
      limit 1`,
    [`box:${PAT_BOX_LUNCH_ID}:%`, FEAT_TRACK_FROM, PAT_BOX_LUNCH_ID],
  );
  if (hit[0]) await grantFeat(sql, PAT_BOX_LUNCH_ID, BOX_LUNCH_ID);
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [PAT_BOX_LUNCH_FLAG]);
}
