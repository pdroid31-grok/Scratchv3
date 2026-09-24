import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { BOX_COST } from "./avatars";
import { clipDisplayName, hiddenBoardIdSql, hiddenBoardNameSql, isBankCommish, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export type BankRow = {
  id: string;
  name: string;
  coins: number;
  wins: number;
  stars: number;
};

export type BankChange = {
  id: number;
  userId: string;
  name: string;
  before: number;
  after: number;
  delta: number;
  at: string;
  reason: string | null;
};

export type BankWatch = {
  banks: BankRow[];
  changes: BankChange[];
};

function asInt(value: number | string | null | undefined): number {
  return Math.floor(Number(value) || 0);
}

export async function ensureBankLog(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_bank_log (
      id serial primary key,
      user_id text not null,
      coins_before integer not null,
      coins_after integer not null,
      delta integer not null,
      created_at timestamptz not null default now()
    )`);
  await sql.query("create index if not exists darkness_bank_log_at_idx on darkness_bank_log (created_at desc)");
  await sql.query("alter table darkness_bank_log add column if not exists reason text");
}

const PAYOUT_REASONS = new Set(["daily_win", "daily_score", "weekly_win", "weekly_score", "scratch"]);

export async function bankChangeReason(
  sql: Sql,
  userId: string,
  before: number,
  after: number,
  winsBefore: number,
  winsAfter: number,
): Promise<string | null> {
  const delta = Math.floor(after) - Math.floor(before);
  if (delta < 0 && Math.abs(delta) === BOX_COST) return "box";
  try {
    const recent = await sql.query<{ kind: string | null }>(
      `select kind from darkness_payouts
        where user_id = $1
          and created_at > now() - interval '60 seconds'
        order by created_at desc, id desc
        limit 1`,
      [userId],
    );
    const kind = recent[0]?.kind ?? "";
    if (PAYOUT_REASONS.has(kind)) return kind;
  } catch {
    /* payouts table may not exist yet */
  }
  if (Math.floor(winsAfter) > Math.floor(winsBefore)) return "match";
  return null;
}

export async function recordBankChange(
  sql: Sql,
  userId: string,
  before: number,
  after: number,
  reason?: string | null,
): Promise<void> {
  const coinsBefore = Math.floor(before);
  const coinsAfter = Math.floor(after);
  if (coinsBefore === coinsAfter) return;
  const label = reason && reason.trim() ? reason.trim() : null;
  try {
    await ensureBankLog(sql);
    await sql.query(
      `insert into darkness_bank_log (user_id, coins_before, coins_after, delta, reason)
       select $1, $2, $3, $4, $5
         from (select pg_advisory_xact_lock(hashtext('bank:' || $1::text))) locked
        where not exists (
          select 1 from darkness_bank_log
           where user_id = $1
             and coins_before = $2
             and coins_after = $3
             and created_at > now() - interval '10 seconds'
        )`,
      [userId, coinsBefore, coinsAfter, coinsAfter - coinsBefore, label],
    );
  } catch (err) {
    console.error("[darkness] bank log failed", err);
  }
}

async function callerIsCommish(
  sql: Sql,
  userId: string,
): Promise<boolean> {
  const rows = await sql.query<{ display_name: string | null; auth_name: string | null }>(
    `select p.display_name, u.name as auth_name
       from "user" u
       left join player_profiles p on p.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  return isBankCommish(row?.display_name ?? "") || isBankCommish(row?.auth_name ?? "");
}

export async function loadBankWatch(sql: Sql): Promise<BankWatch> {
  await ensureBankLog(sql);
  const banks = await sql.query<{
    id: string;
    name: string | null;
    coins: number | string | null;
    wins: number | string | null;
    stars: number | string | null;
  }>(
    `select p.user_id as id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
            p.coins,
            p.coin_wins as wins,
            coalesce(p.daily_stars, 0) as stars
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where ${hiddenBoardNameSql()}
        and ${hiddenBoardIdSql("p.user_id")}
      order by coalesce(p.coins, 0) desc, coalesce(p.coin_wins, 0) desc, name asc`,
  );
  const changes = await sql.query<{
    id: number | string;
    user_id: string;
    name: string | null;
    coins_before: number | string;
    coins_after: number | string;
    delta: number | string;
    reason: string | null;
    created_at: string | Date;
  }>(
    `select l.id, l.user_id, l.coins_before, l.coins_after, l.delta, l.reason, l.created_at,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name
       from darkness_bank_log l
       left join player_profiles p on p.user_id = l.user_id
       left join "user" u on u.id = l.user_id
      where ${hiddenBoardIdSql("l.user_id")}
        and ${hiddenBoardNameSql()}
      order by l.created_at desc, l.id desc
      limit 80`,
  );
  return {
    banks: banks.flatMap((row) => {
      if (isHiddenBoardId(row.id) || isHiddenBoardName(row.name)) return [];
      return [
        {
          id: row.id,
          name: clipDisplayName(row.name ?? "") || "GM",
          coins: Math.max(0, asInt(row.coins)),
          wins: Math.max(0, asInt(row.wins)),
          stars: Math.max(0, asInt(row.stars)),
        },
      ];
    }),
    changes: changes.flatMap((row) => {
      if (isHiddenBoardId(row.user_id) || isHiddenBoardName(row.name)) return [];
      return [
        {
          id: asInt(row.id),
          userId: row.user_id,
          name: clipDisplayName(row.name ?? "") || "GM",
          before: asInt(row.coins_before),
          after: asInt(row.coins_after),
          delta: asInt(row.delta),
          at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          reason: row.reason && row.reason.trim() ? row.reason.trim() : null,
        },
      ];
    }),
  };
}

export const getBankWatch = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BankWatch | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    if (!(await callerIsCommish(sql, context.userId))) return null;
    try {
      const { settleProfile } = await import("./stats.server");
      const ids = await sql.query<{ user_id: string }>(`select user_id from player_profiles`);
      for (const row of ids) await settleProfile(sql, row.user_id);
    } catch (err) {
      console.error("[darkness] bank watch settle failed", err);
    }
    return loadBankWatch(sql);
  });
