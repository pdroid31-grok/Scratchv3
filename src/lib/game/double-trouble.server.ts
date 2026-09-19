/** Server-only Double Trouble feat. Going forward only — not W1 / Sep 2–16. */
import { parseOwned, DOUBLE_TROUBLE_ID } from "./avatars";
import { isAwardSkippedName, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { isCommishSettingsUser } from "./commish-types";
import { dailyYesterday } from "./daily";
import { ymdInTz } from "./weekly-sleeper";

export const DOUBLE_TROUBLE_FROM_DAY = "2026-09-17";
export const DOUBLE_TROUBLE_FROM_WEEK = 2;

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

function asTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function hourInEt(ms: number): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date(ms));
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Last NFL game date of that week, or endAt rolled back past midnight ET to Monday. */
export function weeklyAwardEtDay(games: { date?: string }[], endAt: number): string {
  const dates = games
    .map((game) => String(game.date || ""))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();
  if (dates.length) return dates[dates.length - 1]!;
  const ymd = ymdInTz(endAt);
  return hourInEt(endAt) < 8 ? dailyYesterday(ymd) : ymd;
}

function skipWho(userId: string, name?: string | null): boolean {
  if (isHiddenBoardId(userId) || isCommishSettingsUser(userId)) return true;
  if (isHiddenBoardName(name) || isAwardSkippedName(name)) return true;
  return false;
}

async function grantOne(sql: Sql, userId: string): Promise<void> {
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
  if (owned.includes(DOUBLE_TROUBLE_ID)) return;
  const next = [...owned, DOUBLE_TROUBLE_ID];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  const { recordLookUnlockNews } = await import("./news.server");
  await recordLookUnlockNews(sql, userId, DOUBLE_TROUBLE_ID, "feats");
}

async function wonDaily(sql: Sql, day: string, userId: string): Promise<boolean> {
  const win = await sql.query<{ n: string }>(
    `select 1::text as n from darkness_daily_runs
      where day = $1::date and user_id = $2 and payout_win is true limit 1`,
    [day, userId],
  );
  if (win[0]) return true;
  const awarded = await sql.query<{ awarded_user_id: string | null }>(
    `select awarded_user_id from darkness_daily_days where day = $1::date and awarded is true`,
    [day],
  );
  return awarded[0]?.awarded_user_id === userId;
}

export async function grantDoubleTroubleAfterWeekly(
  sql: Sql,
  input: { week: number; endAt: number; games: { date?: string }[]; winnerIds: string[] },
): Promise<void> {
  if (input.week < DOUBLE_TROUBLE_FROM_WEEK) return;
  const day = weeklyAwardEtDay(input.games, input.endAt);
  if (!day || day < DOUBLE_TROUBLE_FROM_DAY) return;
  for (const userId of input.winnerIds) {
    if (!(await wonDaily(sql, day, userId))) continue;
    await grantOne(sql, userId);
  }
}

export async function grantDoubleTroubleAfterDaily(sql: Sql, day: string, winnerIds: string[]): Promise<void> {
  if (!day || day < DOUBLE_TROUBLE_FROM_DAY) return;
  const weeks = await sql.query<{ season: number; week: number; end_at: Date | string }>(
    `select season, week, end_at
       from darkness_weekly_weeks
      where awarded is true and week >= $1`,
    [DOUBLE_TROUBLE_FROM_WEEK],
  );
  for (const week of weeks) {
    const awardDay = weeklyAwardEtDay([], asTime(week.end_at));
    if (awardDay !== day) continue;
    for (const userId of winnerIds) {
      const win = await sql.query<{ n: string }>(
        `select 1::text as n from darkness_weekly_runs
          where season = $1 and week = $2 and user_id = $3 and payout_win is true limit 1`,
        [week.season, week.week, userId],
      );
      if (!win[0]) continue;
      await grantOne(sql, userId);
    }
  }
}
