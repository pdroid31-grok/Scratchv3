/** New accounts pick an in-game name once. Accounts made before the cutoff are never asked. */
import { getSql, type Sql } from "@/lib/db";
import { clipDisplayName, hiddenBoardIdSql } from "./stats-shared";

/** Accounts created at or after this time must pick a name. Every older account is left alone. */
export const NAME_PICK_CUTOFF = "2026-10-23T01:00:00Z";

function flagKey(userId: string): string {
  return `name-picked:${userId}`;
}

async function ensureFeatFlags(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
}

export async function needsNamePick(userId: string): Promise<boolean> {
  const sql = await getSql();
  await ensureFeatFlags(sql);
  const rows = await sql.query<{ needs: boolean }>(
    `select (u."createdAt" >= $2::timestamptz
             and not exists (select 1 from darkness_feat_flags f where f.key = $3)) as needs
       from "user" u
      where u.id = $1`,
    [userId, NAME_PICK_CUTOFF, flagKey(userId)],
  );
  return rows[0]?.needs === true;
}

export async function markNamePicked(userId: string): Promise<void> {
  const sql = await getSql();
  await ensureFeatFlags(sql);
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [flagKey(userId)]);
}

/** True when another visible account already shows this name (case-insensitive). Current names are never changed. */
export async function nameTakenByOther(userId: string, name: string): Promise<boolean> {
  const clean = clipDisplayName(name).toLowerCase();
  if (!clean) return false;
  const sql = await getSql();
  const rows = await sql.query<{ taken: number }>(
    `select 1 as taken
       from "user" u
       left join player_profiles p on p.user_id = u.id
      where u.id <> $1
        and ${hiddenBoardIdSql("u.id")}
        and lower(left(trim(coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), u.name, '')), 16)) = $2
      limit 1`,
    [userId, clean],
  );
  return rows.length > 0;
}
