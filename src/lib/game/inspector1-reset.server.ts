/** One-shot: reopen Inspector1 today Daily + 2026-W2 Weekly. No other users. */
import { dailyDayStamp } from "./daily";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

const FLAG = "inspector1-reset-today-w2-v1";

async function lookupInspector1Ids(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ user_id: string }>(
    `select distinct x.user_id
       from (
         select p.user_id
           from player_profiles p
          where lower(trim(coalesce(p.display_name, ''))) = 'inspector1'
         union
         select u.id
           from "user" u
          where lower(trim(coalesce(u.name, ''))) = 'inspector1'
       ) x
      where x.user_id is not null and x.user_id <> ''`,
  );
  return rows.map((row) => String(row.user_id)).filter(Boolean);
}

export async function resetInspector1Once(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_ops_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(`select key from darkness_ops_flags where key = $1`, [FLAG]);
  if (already[0]) return;
  const ids = await lookupInspector1Ids(sql);
  if (!ids.length) return;
  const day = dailyDayStamp();
  const daily = await sql.query<{ user_id: string }>(
    `delete from darkness_daily_runs
      where day = $1::date and user_id = any($2::text[])
      returning user_id`,
    [day, ids],
  );
  const weekly = await sql.query<{ user_id: string }>(
    `delete from darkness_weekly_runs
      where season = 2026 and week = 2 and user_id = any($2::text[])
      returning user_id`,
    [ids],
  );
  await sql.query(`insert into darkness_ops_flags (key) values ($1) on conflict (key) do nothing`, [FLAG]);
  console.log("[darkness] inspector1 reset", {
    ids,
    day,
    dailyDeleted: daily.length,
    weeklyDeleted: weekly.length,
  });
}
