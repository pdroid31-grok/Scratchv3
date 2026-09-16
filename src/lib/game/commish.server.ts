/** Commish settings. Do not import from client modules. */
import { clampAvatar, type AvatarId } from "./avatars";
import { clipDisplayName } from "./stats-shared";
import { COMMISH_SETTINGS_ID, COMMISH_PASSWORD_NAME, type CommishList, type CommishOk, type CommishPasswordStatus } from "./commish-types";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

function forbidden(): never {
  throw new Response("Forbidden", { status: 403, statusText: "Forbidden" });
}

async function getSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensure(sql: Sql): Promise<void> {
  await sql.query(`alter table player_profiles add column if not exists claimed_by text`);
  await sql.query(`alter table player_profiles add column if not exists box_opens int not null default 0`);
  await sql.query(`alter table player_profiles add column if not exists box_forgive int not null default 0`);
  await sql.query(`alter table player_profiles add column if not exists seed_lock int not null default 0`);
  await sql.query(`
    create table if not exists darkness_commish_audit (
      id bigserial primary key,
      actor text not null,
      action text not null,
      detail jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
}

async function assertCommish(userId: string): Promise<void> {
  if (userId !== COMMISH_SETTINGS_ID) forbidden();
}

async function audit(sql: Sql, actor: string, action: string, detail: Record<string, unknown>): Promise<void> {
  await sql.query(
    `insert into darkness_commish_audit (actor, action, detail) values ($1, $2, $3::jsonb)`,
    [actor, action, JSON.stringify(detail)],
  );
}

async function emptySession(sql: Sql, userId: string): Promise<boolean> {
  const profile = await sql.query<{ career_book: unknown; name: string | null }>(
    `select career_book, display_name as name from player_profiles where user_id = $1`,
    [userId],
  );
  if (!profile[0]) return false;
  if (profile[0].career_book) return false;
  const nights = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from player_nights where user_id = $1`,
    [userId],
  );
  if (Number(nights[0]?.n ?? 0) > 0) return false;
  return true;
}

async function moveUser(sql: Sql, table: string, key: string, dest: string, src: string): Promise<void> {
  await sql.query(
    `update ${table} t
        set user_id = $1
      where t.user_id = $2
        and not exists (
          select 1 from ${table} x where x.user_id = $1 and x.${key} = t.${key}
        )`,
    [dest, src],
  );
  await sql.query(`delete from ${table} where user_id = $1`, [src]);
}

export async function listCommishBooksHandler({
  context,
}: {
  context: { userId: string };
}): Promise<CommishList> {
  await assertCommish(context.userId);
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql.query<{
    user_id: string;
    display_name: string | null;
    coins: number | string | null;
    avatar_id: string | null;
    claimed_by: string | null;
    career_book: unknown;
    nights: number | string | null;
  }>(
    `select p.user_id,
            p.display_name,
            p.coins,
            p.avatar_id,
            p.claimed_by,
            p.career_book,
            (select count(*)::int from player_nights n where n.user_id = p.user_id) as nights
       from player_profiles p
      order by lower(coalesce(nullif(trim(p.display_name), ''), 'zzz')), p.user_id`,
  );
  return {
    books: rows.map((row) => ({
      id: row.user_id,
      name: clipDisplayName(row.display_name ?? "") || "GM",
      coins: Math.floor(Number(row.coins) || 0),
      avatarId: clampAvatar(row.avatar_id ?? "poor") as AvatarId,
      claimedBy: row.claimed_by || null,
      empty: !row.career_book && Number(row.nights ?? 0) === 0,
    })),
  };
}

export async function remapCommishBookHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { emptyId: string; bookId: string };
}): Promise<CommishOk> {
  await assertCommish(context.userId);
  const dest = data.emptyId;
  const src = data.bookId;
  if (!dest || !src) return { ok: false, reason: "missing" };
  if (dest === src) return { ok: false, reason: "same" };
  const sql = await getSql();
  await ensure(sql);
  const srcRow = await sql.query<{ user_id: string }>(`select user_id from player_profiles where user_id = $1`, [src]);
  if (!srcRow[0]) return { ok: false, reason: "no-book" };
  const destRow = await sql.query<{ user_id: string }>(`select user_id from player_profiles where user_id = $1`, [dest]);
  if (!destRow[0]) return { ok: false, reason: "no-session" };
  if (!(await emptySession(sql, dest))) return { ok: false, reason: "not-empty" };

  await sql.query(
    `update player_profiles as d
        set avatar_id = s.avatar_id,
            display_name = s.display_name,
            coins = s.coins,
            coin_wins = s.coin_wins,
            owned = s.owned,
            credit = s.credit,
            daily_stars = s.daily_stars,
            closet_reset = s.closet_reset,
            seed_lock = s.seed_lock,
            career_book = s.career_book,
            box_opens = s.box_opens,
            box_forgive = s.box_forgive,
            updated_at = now()
       from player_profiles as s
      where d.user_id = $1 and s.user_id = $2`,
    [dest, src],
  );
  await sql.query(
    `update player_profiles
        set career_book = null,
            display_name = '',
            daily_stars = 0,
            claimed_by = $1,
            updated_at = now()
      where user_id = $2`,
    [dest, src],
  );
  await sql.query(`update player_profiles set claimed_by = $1 where claimed_by = $2`, [dest, src]);

  try {
    await sql.query(
      `update darkness_payouts p
          set user_id = $1
        where p.user_id = $2
          and not exists (
            select 1 from darkness_payouts x where x.user_id = $1 and x.source_key = p.source_key
          )`,
      [dest, src],
    );
    await sql.query(`delete from darkness_payouts where user_id = $1`, [src]);
  } catch {
    /* table may not exist in preview */
  }
  try {
    await moveUser(sql, "player_nights", "night_key", dest, src);
  } catch {
    /* ignore */
  }
  try {
    await moveUser(sql, "darkness_daily_runs", "day", dest, src);
  } catch {
    /* ignore */
  }
  try {
    await sql.query(
      `update darkness_weekly_runs t
          set user_id = $1
        where t.user_id = $2
          and not exists (
            select 1 from darkness_weekly_runs x
             where x.user_id = $1 and x.season = t.season and x.week = t.week
          )`,
      [dest, src],
    );
    await sql.query(`delete from darkness_weekly_runs where user_id = $1`, [src]);
  } catch {
    /* ignore */
  }

  await audit(sql, context.userId, "remap", { from: src, to: dest });
  return { ok: true };
}

export async function clearCommishClaimHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { name: string; confirm: boolean };
}): Promise<CommishOk> {
  await assertCommish(context.userId);
  if (!data.confirm) return { ok: false, reason: "confirm" };
  const name = clipDisplayName(data.name);
  if (!name) return { ok: false, reason: "name" };
  const sql = await getSql();
  await ensure(sql);
  const key = name.toLowerCase();
  await sql.query(
    `update player_profiles
        set claimed_by = null, updated_at = now()
      where lower(trim(coalesce(display_name, ''))) = $1
         or claimed_by in (
              select user_id from player_profiles
               where lower(trim(coalesce(display_name, ''))) = $1
            )`,
    [key],
  );
  await audit(sql, context.userId, "clear_claim", { name });
  return { ok: true };
}

async function resolveHeisenberg(sql: Sql): Promise<{ kind: "ok"; userId: string } | { kind: "missing" } | { kind: "ambiguous" }> {
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from player_profiles where trim(display_name) = $1`,
    [COMMISH_PASSWORD_NAME],
  );
  if (rows.length === 0) return { kind: "missing" };
  if (rows.length !== 1) return { kind: "ambiguous" };
  return { kind: "ok", userId: rows[0].user_id };
}

async function credentialAccount(sql: Sql, userId: string): Promise<"credential" | "google" | "none"> {
  const rows = await sql.query<{ provider: string; has_password: boolean }>(
    `select "providerId" as provider, (password is not null and length(password) > 0) as has_password
       from account
      where "userId" = $1`,
    [userId],
  );
  if (rows.some((row) => row.provider === "credential" && row.has_password)) return "credential";
  if (rows.length > 0) return "google";
  return "none";
}

export async function heisenbergPasswordStatusHandler({
  context,
}: {
  context: { userId: string };
}): Promise<CommishPasswordStatus> {
  await assertCommish(context.userId);
  const sql = await getSql();
  await ensure(sql);
  const found = await resolveHeisenberg(sql);
  if (found.kind !== "ok") return found;
  const kind = await credentialAccount(sql, found.userId);
  if (kind === "credential") return { kind: "credential", userId: found.userId };
  if (kind === "google") return { kind: "google", userId: found.userId };
  return { kind: "google", userId: found.userId };
}

export async function setHeisenbergPasswordHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { password: string; confirm: string; userId: string };
}): Promise<CommishOk> {
  await assertCommish(context.userId);
  const sql = await getSql();
  await ensure(sql);
  const found = await resolveHeisenberg(sql);
  if (found.kind !== "ok") return { ok: false, reason: found.kind };
  if (data.userId && data.userId !== found.userId) return { ok: false, reason: "not-heisenberg" };
  const kind = await credentialAccount(sql, found.userId);
  if (kind !== "credential") return { ok: false, reason: "google" };
  if (data.password !== data.confirm) return { ok: false, reason: "mismatch" };
  if (data.password.length < 8 || data.password.length > 128) return { ok: false, reason: "length" };
  const { hashPassword } = await import("better-auth/crypto");
  const hashed = await hashPassword(data.password);
  await sql.query(
    `update account
        set password = $1, "updatedAt" = now()
      where "userId" = $2 and "providerId" = 'credential'`,
    [hashed, found.userId],
  );
  await audit(sql, context.userId, "set_password", { name: COMMISH_PASSWORD_NAME, userId: found.userId });
  return { ok: true };
}

