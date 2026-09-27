/** Weekly clock, week row, and W1 reopen. Move-only from weekly-api.server. */
import { nflClock, weekWindow, weeklyProjections } from "../weekly-sleeper";
import { asTime, type RunRow, type Sql, type WeekRow } from "./shared";
import { settleSafe } from "./settle";
import { loadWeek } from "./tables";

async function ensureWeek(sql: Sql, season: number, week: number): Promise<WeekRow> {
  const existing = await loadWeek(sql, season, week);
  const window = await weekWindow(season, week);
  if (existing) {
    if (!existing.awarded) {
      const lockAt = asTime(existing.lock_at);
      const endAt = asTime(existing.end_at);
      if (Math.abs(lockAt - window.lockAt) > 60_000 || Math.abs(endAt - window.endAt) > 60_000) {
        await sql.query(
          `update darkness_weekly_weeks
              set lock_at = to_timestamp($3 / 1000.0), end_at = to_timestamp($4 / 1000.0)
            where season = $1 and week = $2 and awarded = false`,
          [season, week, window.lockAt, window.endAt],
        );
      }
      const runs = await sql.query<{ n: string }>(
        `select count(*)::text as n from darkness_weekly_runs where season = $1 and week = $2 and status = 'done'`,
        [season, week],
      );
      if (Number(runs[0]?.n) === 0 && window.open) {
        const board = await weeklyProjections(season, week);
        await sql.query(
          `update darkness_weekly_weeks
              set board = $3::jsonb,
                  lock_at = to_timestamp($4 / 1000.0),
                  end_at = to_timestamp($5 / 1000.0)
            where season = $1 and week = $2 and awarded = false`,
          [season, week, JSON.stringify(board), window.lockAt, window.endAt],
        );
      }
      const latest = await loadWeek(sql, season, week);
      if (latest) return latest;
    }
    return existing;
  }
  const board = await weeklyProjections(season, week);
  await sql.query(
    `insert into darkness_weekly_weeks (season, week, lock_at, end_at, board)
     values ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5::jsonb)
     on conflict (season, week) do nothing`,
    [season, week, window.lockAt, window.endAt, JSON.stringify(board)],
  );
  const saved = await loadWeek(sql, season, week);
  if (!saved) throw new Error("weekly week missing");
  return saved;
}

async function expirePlaying(sql: Sql, season: number, week: number, open: boolean): Promise<void> {
  if (open) return;
  if (season === 2026 && week === 1) {
    await sql.query(
      `update darkness_weekly_runs
          set status = 'forfeit', finished_at = now()
        where season = $1 and week = $2 and status = 'playing'
          and user_id not in ($3, $4)`,
      [season, week, MSWAN_LIVE, MSWAN_SEED],
    );
    return;
  }
  await sql.query(
    `update darkness_weekly_runs
        set status = 'forfeit', finished_at = now()
      where season = $1 and week = $2 and status = 'playing'`,
    [season, week],
  );
}

const PAT_RETRY_KEY = "pat-retry-2026w1-spread18";
const MSWAN_LIVE = "FGR4MUWx09k2LG6w2T8g7X3WKh3KbtfY";
const MSWAN_SEED = "38GXVpMo8GE8bERLYLHaoQF4CPBjvUS0";

function isMswanId(userId: string): boolean {
  return userId === MSWAN_LIVE || userId === MSWAN_SEED;
}

export function mswanLateOk(season: number, week: number, userId: string, run: RunRow | null): boolean {
  if (season !== 2026 || week !== 1 || !isMswanId(userId)) return false;
  if (!run) return true;
  return run.status !== "done";
}

async function reopenPatOnce(sql: Sql, season: number, week: number): Promise<void> {
  if (season !== 2026 || week !== 1) return;
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_weekly_flags where key = $1`,
    [PAT_RETRY_KEY],
  );
  if (already[0]) return;
  await sql.query(
    `delete from darkness_weekly_runs
      where season = $1 and week = $2
        and user_id in (
          select p.user_id
            from player_profiles p
            left join "user" u on u.id = p.user_id
           where lower(trim(coalesce(p.display_name, ''))) in ('pat', 'pastry pat', 'ap_690')
              or lower(trim(coalesce(u.name, ''))) in ('pat', 'pastry pat', 'ap_690')
        )`,
    [season, week],
  );
  try {
    const window = await weekWindow(season, week);
    if (window.open) {
      const board = await weeklyProjections(season, week);
      await sql.query(
        `update darkness_weekly_weeks
            set board = $3::jsonb,
                lock_at = to_timestamp($4 / 1000.0),
                end_at = to_timestamp($5 / 1000.0)
          where season = $1 and week = $2 and awarded = false`,
        [season, week, JSON.stringify(board), window.lockAt, window.endAt],
      );
    }
  } catch (err) {
    console.error("[darkness] weekly pat retry board failed", err);
  }
  await sql.query(
    `insert into darkness_weekly_flags (key) values ($1) on conflict do nothing`,
    [PAT_RETRY_KEY],
  );
}

async function reopenMswanLate(sql: Sql, season: number, week: number): Promise<void> {
  if (season !== 2026 || week !== 1) return;
  await sql.query(
    `delete from darkness_weekly_runs
      where season = $1 and week = $2
        and status in ('forfeit')
        and user_id in ($3, $4)`,
    [season, week, MSWAN_LIVE, MSWAN_SEED],
  );
}

export async function resolveClock(sql: Sql): Promise<{
  clock: Awaited<ReturnType<typeof nflClock>>;
  window: Awaited<ReturnType<typeof weekWindow>>;
}> {
  const clock = await nflClock();
  let window = await weekWindow(clock.season, clock.week);
  await settleSafe(sql, clock.season, clock.week);
  await expirePlaying(sql, clock.season, clock.week, window.open);
  if (window.done && clock.week < 18) {
    const next = { ...clock, week: clock.week + 1 };
    window = await weekWindow(next.season, next.week);
    await settleSafe(sql, next.season, next.week);
    await expirePlaying(sql, next.season, next.week, window.open);
    await reopenPatOnce(sql, next.season, next.week);
    await reopenMswanLate(sql, next.season, next.week);
    try {
      const { mergeCommishW2Once } = await import("../commish-w2-merge.server");
      await mergeCommishW2Once(sql);
    } catch (err) {
      console.error("[darkness] commish w2 merge failed", err);
    }
    try {
      const { scoreCommishW2Once } = await import("../commish-w2-merge.server");
      await scoreCommishW2Once(sql);
    } catch (err) {
      console.error("[darkness] commish w2 score failed", err);
    }
    return { clock: next, window };
  }
  await reopenPatOnce(sql, clock.season, clock.week);
  await reopenMswanLate(sql, clock.season, clock.week);
  try {
    const { mergeCommishW2Once } = await import("../commish-w2-merge.server");
    await mergeCommishW2Once(sql);
  } catch (err) {
    console.error("[darkness] commish w2 merge failed", err);
  }
  try {
    const { scoreCommishW2Once } = await import("../commish-w2-merge.server");
    await scoreCommishW2Once(sql);
  } catch (err) {
    console.error("[darkness] commish w2 score failed", err);
  }
  return { clock, window };
}

export async function currentWeek(sql: Sql): Promise<{ clock: Awaited<ReturnType<typeof nflClock>>; week: WeekRow; window: Awaited<ReturnType<typeof weekWindow>> }> {
  const { clock, window } = await resolveClock(sql);
  const week = await ensureWeek(sql, clock.season, clock.week);
  return { clock, week, window };
}
