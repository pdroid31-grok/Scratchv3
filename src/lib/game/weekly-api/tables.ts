/** Weekly tables. Move-only from weekly-api.server. */
import type { RunRow, Sql, WeekRow } from "./shared";

export async function getSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export async function ensureWeeklyTables(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_weeks (
      season integer not null,
      week integer not null,
      lock_at timestamptz not null,
      end_at timestamptz not null,
      awarded boolean not null default false,
      board jsonb not null,
      created_at timestamptz not null default now(),
      primary key (season, week)
    )`);
  await sql.query(`
    create table if not exists darkness_weekly_runs (
      season integer not null,
      week integer not null,
      user_id text not null,
      status text not null default 'playing',
      score numeric,
      payout_score boolean not null default false,
      payout_win boolean not null default false,
      picks jsonb,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      primary key (season, week, user_id)
    )`);
  const { ensurePayoutsTable } = await import("../payouts");
  await ensurePayoutsTable(sql);
}

export async function loadWeek(sql: Sql, season: number, week: number): Promise<WeekRow | null> {
  const rows = await sql.query<WeekRow>(
    `select season, week, lock_at, end_at, awarded, board
       from darkness_weekly_weeks where season = $1 and week = $2`,
    [season, week],
  );
  return rows[0] ?? null;
}

export async function loadRun(sql: Sql, season: number, week: number, userId: string): Promise<RunRow | null> {
  const rows = await sql.query<RunRow>(
    `select status, score, payout_score, payout_win, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and user_id = $3`,
    [season, week, userId],
  );
  return rows[0] ?? null;
}
