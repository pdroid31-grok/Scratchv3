/** Server-only league chat. Do not import from client modules. */
import { clampAvatar, type AvatarId } from "./avatars";
import { clipDisplayName } from "./stats-shared";
import { isStevoChatUser, STEVO_CHAT_ID, CEO_BOARD_ID, type LeagueChatLine, type LeagueChatUnread } from "./league-chat-types";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

const CHAT_CAP = 500;

function forbidden(): never {
  throw new Response("Forbidden", { status: 403, statusText: "Forbidden" });
}

async function getSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensureChat(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_league_chat (
      id bigserial primary key,
      user_id text not null,
      body text not null,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create index if not exists darkness_league_chat_created_idx
      on darkness_league_chat (created_at desc, id desc)
  `);
  await sql.query(`
    create table if not exists darkness_league_chat_reads (
      user_id text primary key,
      last_read_id bigint not null default 0,
      last_read_at timestamptz not null default now()
    )
  `);
}

async function assertNotStevo(sql: Sql, userId: string): Promise<void> {
  if (userId === STEVO_CHAT_ID) forbidden();
  const rows = await sql.query<{ display: string | null; auth: string | null }>(
    `select p.display_name as display, u.name as auth
       from "user" u
       left join player_profiles p on p.user_id = u.id
      where u.id = $1
      union all
     select p.display_name as display, null as auth
       from player_profiles p
      where p.user_id = $1
      limit 4`,
    [userId],
  );
  for (const row of rows) {
    if (isStevoChatUser(userId, row.display) || isStevoChatUser(userId, row.auth)) forbidden();
  }
}

async function prune(sql: Sql): Promise<void> {
  await sql.query(`delete from darkness_league_chat where created_at < now() - interval '7 days'`);
  await sql.query(`
    delete from darkness_league_chat
     where id not in (
       select id from darkness_league_chat order by created_at desc, id desc limit ${CHAT_CAP}
     )
  `);
}

async function loadLines(sql: Sql): Promise<LeagueChatLine[]> {
  const rows = await sql.query<{
    id: number | string;
    user_id: string;
    body: string;
    created_at: string | Date;
    name: string | null;
    avatar_id: string | null;
  }>(
    `select c.id,
            c.user_id,
            c.body,
            c.created_at,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
            p.avatar_id
       from darkness_league_chat c
       left join player_profiles p on p.user_id = c.user_id
       left join "user" u on u.id = c.user_id
      order by c.created_at asc, c.id asc
      limit ${CHAT_CAP}`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    userId: row.user_id,
    name: clipDisplayName(row.name ?? "") || "GM",
    avatarId: clampAvatar(row.avatar_id ?? "poor") as AvatarId,
    text: row.body,
    at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

async function lastReadId(sql: Sql, userId: string): Promise<number> {
  const rows = await sql.query<{ last_read_id: number | string }>(
    `select last_read_id from darkness_league_chat_reads where user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.last_read_id ?? 0);
}

async function markRead(sql: Sql, userId: string): Promise<void> {
  const rows = await sql.query<{ id: number | string }>(
    `select coalesce(max(id), 0) as id from darkness_league_chat`,
  );
  const maxId = Number(rows[0]?.id ?? 0);
  await sql.query(
    `insert into darkness_league_chat_reads (user_id, last_read_id, last_read_at)
     values ($1, $2, now())
     on conflict (user_id) do update set last_read_id = excluded.last_read_id, last_read_at = now()`,
    [userId, maxId],
  );
}

async function countUnread(sql: Sql, userId: string): Promise<number> {
  const seen = await lastReadId(sql, userId);
  const rows = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from darkness_league_chat where id > $1 and user_id <> $2`,
    [seen, userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listLeagueChatHandler({
  context,
  data,
}: {
  context: { userId: string };
  data?: { seen?: boolean };
}): Promise<LeagueChatLine[]> {
  const sql = await getSql();
  await ensureChat(sql);
  await assertNotStevo(sql, context.userId);
  await prune(sql);
  if (data?.seen) await markRead(sql, context.userId);
  return loadLines(sql);
}

export async function unreadLeagueChatHandler({
  context,
}: {
  context: { userId: string };
}): Promise<LeagueChatUnread> {
  const sql = await getSql();
  await ensureChat(sql);
  await assertNotStevo(sql, context.userId);
  await prune(sql);
  return { unread: await countUnread(sql, context.userId) };
}

export async function postLeagueChatHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { text: string };
}): Promise<LeagueChatLine[]> {
  const sql = await getSql();
  await ensureChat(sql);
  await assertNotStevo(sql, context.userId);
  const text = data.text.trim().slice(0, 200);
  if (!text) return loadLines(sql);
  await sql.query(`insert into darkness_league_chat (user_id, body) values ($1, $2)`, [context.userId, text]);
  await prune(sql);
  await markRead(sql, context.userId);
  return loadLines(sql);
}

export async function deleteLeagueChatHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { id: number };
}): Promise<LeagueChatLine[]> {
  const sql = await getSql();
  await ensureChat(sql);
  await assertNotStevo(sql, context.userId);
  if (context.userId !== CEO_BOARD_ID) forbidden();
  const id = Math.floor(Number(data.id) || 0);
  if (id > 0) {
    await sql.query(`delete from darkness_league_chat where id = $1`, [id]);
  }
  return loadLines(sql);
}

