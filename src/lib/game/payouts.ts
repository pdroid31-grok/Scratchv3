import { createServerFn } from "@tanstack/react-start";
import { clipDisplayName } from "./stats-shared";
import { WEEKLY_WIN_STARS } from "./weekly";
import { scratchKey } from "./scratch";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export type PayoutKind = "daily_score" | "daily_win" | "weekly_score" | "weekly_win" | "scratch";

export type PayoutRow = {
  id: number;
  userId: string;
  name: string;
  amount: number;
  stars: number;
  kind: PayoutKind;
  sourceKey: string;
  at: string;
};

const KINDS = new Set<PayoutKind>(["daily_score", "daily_win", "weekly_score", "weekly_win", "scratch"]);

export function dailyScoreKey(day: string, userId: string): string {
  return `daily_score:${day}:${userId}`;
}

export function dailyWinKey(day: string, userId: string): string {
  return `daily_win:${day}:${userId}`;
}

export function weeklyScoreKey(season: number, week: number, userId: string): string {
  return `weekly_score:${season}-W${week}:${userId}`;
}

export function weeklyWinKey(season: number, week: number, userId: string): string {
  return `weekly_win:${season}-W${week}:${userId}`;
}

export function scratchPayoutKey(cardId: number | string): string {
  return scratchKey(cardId);
}

export function payoutLabel(kind: PayoutKind): string {
  if (kind === "daily_win") return "Daily 1st";
  if (kind === "weekly_win") return "Weekly 1st";
  if (kind === "weekly_score") return "Weekly over 100";
  if (kind === "scratch") return "Scratch card";
  return "Daily over 100";
}

export async function ensurePayoutsTable(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_payouts (
      id serial primary key,
      user_id text not null,
      amount integer not null,
      stars integer not null default 0,
      kind text not null,
      source_key text not null unique,
      created_at timestamptz not null default now()
    )`);
  await sql.query("create index if not exists darkness_payouts_user_idx on darkness_payouts (user_id, created_at desc)");
  await backfillPayouts(sql);
}

async function backfillPayouts(sql: Sql): Promise<void> {
  try {
    await sql.query(
      `insert into darkness_payouts (user_id, amount, stars, kind, source_key, created_at)
       select r.user_id, 1, 0, 'daily_score',
              'daily_score:' || r.day::text || ':' || r.user_id,
              coalesce(r.finished_at, now())
         from darkness_daily_runs r
        where r.payout_score is true
       on conflict (source_key) do nothing`,
    );
    await sql.query(
      `insert into darkness_payouts (user_id, amount, stars, kind, source_key, created_at)
       select r.user_id, 1, 1, 'daily_win',
              'daily_win:' || r.day::text || ':' || r.user_id,
              coalesce(r.finished_at, now())
         from darkness_daily_runs r
        where r.payout_win is true
       on conflict (source_key) do nothing`,
    );
  } catch {
    /* daily tables may not exist yet */
  }
  try {
    await sql.query(
      `insert into darkness_payouts (user_id, amount, stars, kind, source_key, created_at)
       select r.user_id, 1, 0, 'weekly_score',
              'weekly_score:' || r.season::text || '-W' || r.week::text || ':' || r.user_id,
              coalesce(r.finished_at, now())
         from darkness_weekly_runs r
        where r.payout_score is true
       on conflict (source_key) do nothing`,
    );
    await sql.query(
      `insert into darkness_payouts (user_id, amount, stars, kind, source_key, created_at)
       select r.user_id, 2, 2, 'weekly_win',
              'weekly_win:' || r.season::text || '-W' || r.week::text || ':' || r.user_id,
              coalesce(r.finished_at, now())
         from darkness_weekly_runs r
        where r.payout_win is true
       on conflict (source_key) do nothing`,
    );
  } catch {
    /* weekly tables may not exist yet */
  }
}

export function uniqueDailyWinDays(sourceKeys: readonly string[]): number {
  const days = new Set<string>();
  for (const key of sourceKeys) {
    const parts = String(key).split(":");
    if (parts[0] !== "daily_win") continue;
    const day = parts[1] ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  }
  return days.size;
}

export function uniqueWeeklyWinWeeks(sourceKeys: readonly string[]): number {
  const weeks = new Set<string>();
  for (const key of sourceKeys) {
    const parts = String(key).split(":");
    if (parts[0] !== "weekly_win") continue;
    const week = parts[1] ?? "";
    if (/^\d{4}-W\d+$/.test(week)) weeks.add(week);
  }
  return weeks.size;
}

/** Unique daily_win days + 2 × unique weekly_win weeks. Scratch stars are summed separately. */
export function bookStarsFromPayoutKeys(sourceKeys: readonly string[]): number {
  return uniqueDailyWinDays(sourceKeys) + WEEKLY_WIN_STARS * uniqueWeeklyWinWeeks(sourceKeys);
}

export function scratchStarsFromPayouts(rows: readonly { kind: string; stars?: number }[]): number {
  let n = 0;
  for (const row of rows) {
    if (row.kind !== "scratch") continue;
    n += Math.max(0, Math.floor(Number(row.stars) || 0));
  }
  return n;
}

const BOOK_STARS_SQL = `coalesce((
  select count(distinct split_part(x.source_key, ':', 2)) filter (where x.kind = 'daily_win')
       + ${WEEKLY_WIN_STARS} * count(distinct split_part(x.source_key, ':', 2)) filter (where x.kind = 'weekly_win')
       + coalesce(sum(x.stars) filter (where x.kind = 'scratch'), 0)
    from darkness_payouts x
   where x.user_id = p.user_id
), 0)`;

/** Book stars from payouts. Null if the payout table is missing. */
export async function countPayoutStars(sql: Sql, userId: string): Promise<number | null> {
  try {
    const rows = await sql.query<{ n: number | string }>(
      `select coalesce(
          count(distinct split_part(source_key, ':', 2)) filter (where kind = 'daily_win')
          + ${WEEKLY_WIN_STARS} * count(distinct split_part(source_key, ':', 2)) filter (where kind = 'weekly_win')
          + coalesce(sum(stars) filter (where kind = 'scratch'), 0)
        , 0)::int as n
         from darkness_payouts
        where user_id = $1`,
      [userId],
    );
    return Math.max(0, Math.floor(Number(rows[0]?.n) || 0));
  } catch {
    return null;
  }
}

export async function countScratchCoins(sql: Sql, userId: string): Promise<number> {
  try {
    const rows = await sql.query<{ n: number | string }>(
      `select coalesce(sum(amount), 0)::int as n
         from darkness_payouts
        where user_id = $1 and kind = 'scratch'`,
      [userId],
    );
    return Math.max(0, Math.floor(Number(rows[0]?.n) || 0));
  } catch {
    return 0;
  }
}

/** Set daily_stars from unique daily_win days + 2 × unique weekly_win weeks. No extra payouts or coins. */
export async function syncDailyStarsFromPayouts(sql: Sql, userId?: string): Promise<void> {
  try {
    if (userId) {
      await sql.query(
        `update player_profiles p
            set daily_stars = ${BOOK_STARS_SQL},
                updated_at = now()
          where p.user_id = $1
            and coalesce(p.daily_stars, 0) is distinct from ${BOOK_STARS_SQL}`,
        [userId],
      );
      return;
    }
    await sql.query(
      `update player_profiles p
          set daily_stars = ${BOOK_STARS_SQL},
              updated_at = now()
        where coalesce(p.daily_stars, 0) is distinct from ${BOOK_STARS_SQL}`,
    );
  } catch {
    /* payouts table may not exist yet */
  }
}

/** Logs the payout. Cash is rebuilt from match wins + daily/weekly flags in settleProfile. */
export async function recordPayout(
  sql: Sql,
  row: { userId: string; amount: number; stars?: number; kind: PayoutKind; sourceKey: string },
): Promise<boolean> {
  await ensurePayoutsTable(sql);
  const stars = Math.max(0, Math.floor(row.stars ?? 0));
  const amount = Math.max(0, Math.floor(row.amount));
  const inserted = await sql.query<{ id: number }>(
    `insert into darkness_payouts (user_id, amount, stars, kind, source_key)
     values ($1, $2, $3, $4, $5)
     on conflict (source_key) do nothing
     returning id`,
    [row.userId, amount, stars, row.kind, row.sourceKey],
  );
  if (row.kind === "daily_win" || row.kind === "weekly_win") {
    await syncDailyStarsFromPayouts(sql, row.userId);
  }
  if (row.kind === "scratch") {
    return Boolean(inserted[0]);
  }
  try {
    const { settleProfile } = await import("./stats.server");
    await settleProfile(sql, row.userId);
  } catch (err) {
    console.error("[darkness] payout settle failed", err);
  }
  return Boolean(inserted[0]);
}

type PayoutSql = {
  id: number | string;
  user_id: string;
  name: string | null;
  amount: number | string;
  stars: number | string;
  kind: string;
  source_key: string;
  created_at: string | Date;
};

function mapPayout(row: PayoutSql): PayoutRow {
  const kind = KINDS.has(row.kind as PayoutKind) ? (row.kind as PayoutKind) : "daily_score";
  const at = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    id: Math.floor(Number(row.id) || 0),
    userId: row.user_id,
    name: clipDisplayName(row.name ?? "") || "GM",
    amount: Math.max(0, Math.floor(Number(row.amount) || 0)),
    stars: Math.max(0, Math.floor(Number(row.stars) || 0)),
    kind,
    sourceKey: row.source_key,
    at,
  };
}

export async function loadPayouts(
  sql: Sql,
  filter?: { userId?: string; day?: string; season?: number; week?: number; limit?: number },
): Promise<PayoutRow[]> {
  await ensurePayoutsTable(sql);
  const limit = Math.min(200, Math.max(1, filter?.limit ?? 80));
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.userId) {
    params.push(filter.userId);
    clauses.push(`p.user_id = $${params.length}`);
  }
  if (filter?.day) {
    params.push(`daily_score:${filter.day}:%`, `daily_win:${filter.day}:%`);
    clauses.push(`(p.source_key like $${params.length - 1} or p.source_key like $${params.length})`);
  }
  if (filter?.season != null && filter.week != null) {
    params.push(`weekly_score:${filter.season}-W${filter.week}:%`, `weekly_win:${filter.season}-W${filter.week}:%`);
    clauses.push(`(p.source_key like $${params.length - 1} or p.source_key like $${params.length})`);
  }
  params.push(limit);
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const rows = await sql.query<PayoutSql>(
    `select p.id, p.user_id, p.amount, p.stars, p.kind, p.source_key, p.created_at,
            coalesce(nullif(nullif(trim(pr.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name
       from darkness_payouts p
       left join player_profiles pr on pr.user_id = p.user_id
       left join "user" u on u.id = p.user_id
       ${where}
      order by p.created_at desc, p.id desc
      limit $${params.length}`,
    params,
  );
  return rows.map(mapPayout);
}

export const listPayouts = createServerFn({ method: "POST" })
  .validator((data: { userId?: string; day?: string; season?: number; week?: number }) => ({
    userId: String(data.userId ?? "").slice(0, 80) || undefined,
    day: /^\d{4}-\d{2}-\d{2}$/.test(String(data.day ?? "")) ? String(data.day) : undefined,
    season: Number.isFinite(Number(data.season)) ? Math.floor(Number(data.season)) : undefined,
    week: Number.isFinite(Number(data.week)) ? Math.floor(Number(data.week)) : undefined,
  }))
  .handler(async ({ data }): Promise<PayoutRow[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    return loadPayouts(sql, data);
  });
