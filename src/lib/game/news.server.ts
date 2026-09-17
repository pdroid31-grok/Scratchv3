/** Server-only public news feed. Do not import from client modules. */
import { clipGm, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { clampAvatar, type AvatarId } from "./avatars";
import { formatNewsScore, newsFace, type NewsItem, type NewsKind } from "./news";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type NewsPayload = {
  kind: NewsKind;
  faces: { name: string; avatarId: string; userId?: string | null }[];
  score?: string;
  prizeId?: string;
  prizeLabel?: string;
  day?: string;
  week?: string;
};

export async function ensureNewsTable(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_news (
      id serial primary key,
      kind text not null,
      source_key text not null unique,
      payload jsonb not null,
      created_at timestamptz not null default now()
    )`);
  await sql.query("create index if not exists darkness_news_created_idx on darkness_news (created_at desc, id desc)");
}

function newsHidden(userId?: string | null, name?: string | null): boolean {
  return isHiddenBoardId(userId) || isHiddenBoardName(name);
}

export async function newsActor(
  sql: Sql,
  userId: string,
): Promise<{ name: string; avatarId: AvatarId } | null> {
  const rows = await sql.query<{ name: string | null; avatar_id: string | null }>(
    `select coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
            p.avatar_id
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where p.user_id = $1
     union all
     select coalesce(nullif(trim(u.name), ''), 'GM') as name, null as avatar_id
       from "user" u
      where u.id = $1
        and not exists (select 1 from player_profiles p where p.user_id = $1)
     limit 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const name = clipGm(row.name ?? "");
  if (newsHidden(userId, name) || newsHidden(userId, row.name)) return null;
  return { name, avatarId: clampAvatar(row.avatar_id ?? "poor") };
}

export async function recordNews(
  sql: Sql,
  input: { sourceKey: string; payload: NewsPayload },
): Promise<void> {
  await ensureNewsTable(sql);
  if (input.payload.faces.some((face) => newsHidden(face.userId, face.name))) return;
  await sql.query(
    `insert into darkness_news (kind, source_key, payload)
     values ($1, $2, $3::jsonb)
     on conflict (source_key) do nothing`,
    [input.payload.kind, input.sourceKey, JSON.stringify(input.payload)],
  );
}

export async function recordNewsSafe(
  sql: Sql,
  input: { sourceKey: string; payload: NewsPayload },
): Promise<void> {
  try {
    await recordNews(sql, input);
  } catch (err) {
    console.error("[darkness] news record failed", err);
  }
}

function asTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : Date.now();
}

function parseItem(row: { id: number | string; kind: string; payload: unknown; created_at: unknown }): NewsItem | null {
  const raw = row.payload && typeof row.payload === "object" ? (row.payload as NewsPayload) : null;
  if (!raw || !Array.isArray(raw.faces) || !raw.faces.length) return null;
  if (raw.faces.some((face) => newsHidden(face.userId, face.name))) return null;
  const kind = raw.kind;
  if (kind !== "match" && kind !== "box" && kind !== "scratch" && kind !== "daily_win" && kind !== "weekly_win") {
    return null;
  }
  return {
    id: Number(row.id) || 0,
    at: asTime(row.created_at),
    kind,
    faces: raw.faces.map((face) => newsFace(face.name, face.avatarId)),
    score: raw.score,
    prizeId: raw.prizeId ? clampAvatar(raw.prizeId) : undefined,
    prizeLabel: raw.prizeLabel,
    day: raw.day,
    week: raw.week,
  };
}

export async function listNewsHandler(): Promise<NewsItem[]> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNewsTable(sql);
  const rows = await sql.query<{ id: number | string; kind: string; payload: unknown; created_at: unknown }>(
    `select id, kind, payload, created_at
       from darkness_news
      order by created_at desc, id desc
      limit 80`,
  );
  const out: NewsItem[] = [];
  for (const row of rows) {
    const item = parseItem(row);
    if (!item) continue;
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

export { formatNewsScore, newsFace };
