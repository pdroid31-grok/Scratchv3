/**
 * Historical Daily + W1 Weekly boards from darkness-backups.
 * payout_score / payout_win stay false. No darkness_payouts. No recordPayout.
 */
import { isElimYear, playableWeeks, ELIM_POS, type ElimPos } from "./elim-data";
import { ALLOWED_BOARD_IDS } from "./legacy-board-ids";
import dailies from "./legacy-dailies.json";
import weeklies from "./legacy-weeklies.json";
import { isHiddenBoardId } from "./stats-shared";
import type { WeeklyPackedBoard } from "./weekly";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type DailyRow = { id: string; name: string; score: number };
type DailyDay = { day: string; year: number | null; week: number | null; rows: DailyRow[] };
type WeeklyRow = { id: string; name: string; score: number };

let ran = false;
const skipped = new Set<string>();

function allowedId(id: string, name: string): string | null {
  if (!id || isHiddenBoardId(id) || !ALLOWED_BOARD_IDS[id]) {
    if (name || id) skipped.add(name || id);
    return null;
  }
  return id;
}

function puzzleFor(year: number | null, week: number | null): { year: number; week: number } {
  const y = year && isElimYear(year) ? year : 2012;
  const weeks = playableWeeks(y);
  if (week && weeks.includes(week)) return { year: y, week };
  return { year: y, week: weeks[0] ?? 1 };
}

function stubWeeklyBoard(): WeeklyPackedBoard {
  const board = {} as WeeklyPackedBoard;
  for (const pos of ELIM_POS) {
    board[pos] = Array.from({ length: 8 }, (_, i) => ({
      id: `seed-${pos}-${i}`,
      sid: "",
      name: "—",
      pos: pos as ElimPos,
      team: "ARI",
      cost: 1,
      ppr: 0,
    }));
  }
  return board;
}

async function ensureTables(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_daily_days (
      day date primary key,
      year integer not null,
      week integer not null,
      awarded boolean not null default false,
      awarded_user_id text,
      created_at timestamptz not null default now()
    )`);
  await sql.query(`
    create table if not exists darkness_daily_runs (
      day date not null,
      user_id text not null,
      status text not null default 'playing',
      score numeric,
      payout_score boolean not null default false,
      payout_win boolean not null default false,
      picks jsonb,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      primary key (day, user_id)
    )`);
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
}

async function ensureDisplayName(sql: Sql, userId: string, name: string): Promise<void> {
  await sql.query(
    `insert into player_profiles (
       user_id, avatar_id, display_name, coins, coin_wins, owned, daily_stars, seed_lock, updated_at
     ) values ($1, 'poor', $2, 0, 0, '["poor"]'::jsonb, 0, 1, now())
     on conflict (user_id) do update
       set display_name = coalesce(nullif(trim(player_profiles.display_name), ''), excluded.display_name),
           updated_at = now()`,
    [userId, name],
  );
}

async function importDailies(sql: Sql): Promise<void> {
  const days = (dailies as { days: DailyDay[] }).days ?? [];
  for (const day of days) {
    if (!day.day || day.day < "2026-09-02") continue;
    const puzzle = puzzleFor(day.year, day.week);
    const liveDay = day.day === "2026-09-16";
    if (liveDay) {
      await sql.query(
        `insert into darkness_daily_days (day, year, week, awarded)
         values ($1::date, $2, $3, false)
         on conflict (day) do update
           set awarded = false
         where darkness_daily_days.awarded_user_id is null`,
        [day.day, puzzle.year, puzzle.week],
      );
    } else {
      await sql.query(
        `insert into darkness_daily_days (day, year, week, awarded)
         values ($1::date, $2, $3, true)
         on conflict (day) do nothing`,
        [day.day, puzzle.year, puzzle.week],
      );
    }
    for (const row of day.rows ?? []) {
      const id = allowedId(row.id, row.name);
      if (!id) continue;
      const score = Number(row.score);
      if (!Number.isFinite(score)) continue;
      const name = ALLOWED_BOARD_IDS[id] ?? row.name;
      await ensureDisplayName(sql, id, name);
      await sql.query(
        `insert into darkness_daily_runs (
           day, user_id, status, score, payout_score, payout_win, finished_at
         ) values ($1::date, $2, 'done', $3, false, false, now())
         on conflict (day, user_id) do update
           set score = excluded.score,
               status = 'done',
               finished_at = coalesce(darkness_daily_runs.finished_at, excluded.finished_at)`,
        [day.day, id, score],
      );
    }
  }
}

async function importWeeklyW1(sql: Sql): Promise<void> {
  const pack = weeklies as { season: number; week: number; rows: WeeklyRow[] };
  if (pack.season !== 2026 || pack.week !== 1) return;
  const lockAt = Date.parse("2026-09-04T00:20:00.000Z");
  const endAt = Date.parse("2026-09-09T04:00:00.000Z");
  await sql.query(
    `insert into darkness_weekly_weeks (season, week, lock_at, end_at, awarded, board)
     values ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), true, $5::jsonb)
     on conflict (season, week) do update
       set awarded = true`,
    [2026, 1, lockAt, endAt, JSON.stringify(stubWeeklyBoard())],
  );
  for (const row of pack.rows ?? []) {
    const id = allowedId(row.id, row.name);
    if (!id) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const name = ALLOWED_BOARD_IDS[id] ?? row.name;
    await ensureDisplayName(sql, id, name);
    await sql.query(
      `insert into darkness_weekly_runs (
         season, week, user_id, status, score, payout_score, payout_win, finished_at
       ) values ($1, $2, $3, 'done', $4, false, false, now())
       on conflict (season, week, user_id) do update
         set score = excluded.score,
             status = 'done',
             finished_at = coalesce(darkness_weekly_runs.finished_at, excluded.finished_at)`,
      [2026, 1, id, score],
    );
  }
}

/** Idempotent. Safe to call before settle — imported days/W1 are already awarded. */
export async function importLegacyHistory(sql: Sql): Promise<void> {
  if (ran) return;
  await ensureTables(sql);
  await importDailies(sql);
  await importWeeklyW1(sql);
  ran = true;
  if (skipped.size) console.warn("[darkness] legacy import skipped", [...skipped]);
}
