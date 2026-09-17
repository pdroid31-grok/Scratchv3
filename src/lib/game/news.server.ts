/** Server-only public news feed. Do not import from client modules. */
import { clipGm, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { clampAvatar, type AvatarId } from "./avatars";
import { prizeByKey } from "./scratch";
import { formatNewsScore, newsFace, newsLookbackDay, type NewsItem, type NewsKind } from "./news";

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
  if (kind !== "box" && kind !== "scratch" && kind !== "daily_win" && kind !== "weekly_win") {
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

function sourceId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

async function loadActors(
  sql: Sql,
  ids: string[],
): Promise<Map<string, { name: string; avatarId: AvatarId }>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, { name: string; avatarId: AvatarId }>();
  if (!uniq.length) return out;
  const rows = await sql.query<{ user_id: string; name: string | null; avatar_id: string | null }>(
    `select p.user_id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
            p.avatar_id
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where p.user_id = any($1::text[])
     union all
     select u.id as user_id,
            coalesce(nullif(trim(u.name), ''), 'GM') as name,
            null as avatar_id
       from "user" u
      where u.id = any($1::text[])
        and not exists (select 1 from player_profiles p where p.user_id = u.id)`,
    [uniq],
  );
  for (const row of rows) {
    const name = clipGm(row.name ?? "");
    if (newsHidden(row.user_id, name) || newsHidden(row.user_id, row.name)) continue;
    out.set(row.user_id, { name, avatarId: clampAvatar(row.avatar_id ?? "poor") });
  }
  return out;
}

function pushUnique(out: NewsItem[], seen: Set<string>, key: string, item: NewsItem | null): void {
  if (!item || seen.has(key)) return;
  if (item.faces.some((face) => newsHidden(undefined, face.name))) return;
  seen.add(key);
  out.push(item);
}

async function backfillWindow(sql: Sql, yday: string, startEt: string): Promise<NewsItem[]> {
  const out: NewsItem[] = [];
  const seen = new Set<string>();

  const stored = await sql.query<{
    id: number | string;
    kind: string;
    source_key: string;
    payload: unknown;
    created_at: unknown;
  }>(
    `select id, kind, source_key, payload, created_at
       from darkness_news
      where created_at >= $1::timestamp at time zone 'America/New_York'
        and kind in ('box', 'scratch', 'daily_win', 'weekly_win')
      order by created_at desc, id desc
      limit 80`,
    [startEt],
  );
  for (const row of stored) {
    const item = parseItem(row);
    pushUnique(out, seen, String(row.source_key || `news:${row.id}`), item);
  }

  const scratches = await sql.query<{
    id: number | string;
    user_id: string;
    prize: string;
    scratched_at: unknown;
  }>(
    `select id, user_id, prize, scratched_at
       from darkness_scratch_cards
      where scratched_at is not null
        and scratched_at >= $1::timestamp at time zone 'America/New_York'
      order by scratched_at desc, id desc
      limit 80`,
    [startEt],
  );
  const scratchActors = await loadActors(
    sql,
    scratches.map((row) => row.user_id),
  );
  for (const row of scratches) {
    const key = `scratch:${row.id}`;
    const actor = scratchActors.get(row.user_id);
    if (!actor) continue;
    const prize = prizeByKey(row.prize);
    pushUnique(out, seen, key, {
      id: sourceId(key),
      at: asTime(row.scratched_at),
      kind: "scratch",
      faces: [newsFace(actor.name, actor.avatarId)],
      prizeId: prize.avatar ?? undefined,
      prizeLabel: prize.label,
    });
  }

  let winners = await sql.query<{ user_id: string; score: number | string; finished_at: unknown }>(
    `select r.user_id, r.score, coalesce(r.finished_at, r.started_at) as finished_at
       from darkness_daily_runs r
      where r.day = $1::date
        and r.status = 'done'
        and r.payout_win = true
        and r.score is not null
      order by r.score desc, r.finished_at asc
      limit 8`,
    [yday],
  );
  if (!winners.length) {
    winners = await sql.query<{ user_id: string; score: number | string; finished_at: unknown }>(
      `select p.user_id, coalesce(r.score, 0) as score, coalesce(r.finished_at, p.created_at) as finished_at
         from darkness_payouts p
         left join darkness_daily_runs r
           on r.user_id = p.user_id and r.day = $1::date
        where p.kind = 'daily_win'
          and p.source_key like $2
        order by coalesce(r.score, 0) desc
        limit 8`,
      [yday, `daily_win:${yday}:%`],
    );
  }
  const winActors = await loadActors(
    sql,
    winners.map((row) => row.user_id),
  );
  for (const row of winners) {
    const key = `daily_win:${yday}:${row.user_id}`;
    const actor = winActors.get(row.user_id);
    if (!actor) continue;
    pushUnique(out, seen, key, {
      id: sourceId(key),
      at: asTime(row.finished_at),
      kind: "daily_win",
      faces: [newsFace(actor.name, actor.avatarId)],
      day: yday,
      score: formatNewsScore(Number(row.score)),
    });
  }

  const weekly = await sql.query<{
    user_id: string;
    season: number | string;
    week: number | string;
    score: number | string;
    created_at: unknown;
  }>(
    `select r.user_id, r.season, r.week, r.score, p.created_at
       from darkness_weekly_runs r
       join darkness_payouts p
         on p.source_key = 'weekly_win:' || r.season::text || '-W' || r.week::text || ':' || r.user_id
      where r.payout_win = true
        and r.score is not null
        and p.created_at >= $1::timestamp at time zone 'America/New_York'
      order by p.created_at desc
      limit 16`,
    [startEt],
  );
  const weeklyActors = await loadActors(
    sql,
    weekly.map((row) => row.user_id),
  );
  for (const row of weekly) {
    const key = `weekly_win:${row.season}-W${row.week}:${row.user_id}`;
    const actor = weeklyActors.get(row.user_id);
    if (!actor) continue;
    pushUnique(out, seen, key, {
      id: sourceId(key),
      at: asTime(row.created_at),
      kind: "weekly_win",
      faces: [newsFace(actor.name, actor.avatarId)],
      week: `Week ${row.week}`,
      score: formatNewsScore(Number(row.score)),
    });
  }

  out.sort((a, b) => b.at - a.at || b.id - a.id);
  return out.slice(0, 50);
}

const BLENDER_SEED_KEY = "news-seed-blender-gladiator-v1";

async function seedBlenderGladiator(sql: Sql): Promise<void> {
  const existing = await sql.query<{ ok: number }>(
    `select 1 as ok from darkness_news where source_key = $1 limit 1`,
    [BLENDER_SEED_KEY],
  );
  if (existing[0]) return;
  const found = await sql.query<{ user_id: string; name: string | null; avatar_id: string | null }>(
    `select p.user_id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'Big Blender') as name,
            p.avatar_id
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where lower(trim(p.display_name)) = 'big blender'
         or lower(trim(u.name)) = 'big blender'
      limit 1`,
  );
  const row = found[0];
  const userId = row?.user_id ?? null;
  const name = clipGm(row?.name ?? "Big Blender");
  if (newsHidden(userId, name)) return;
  await recordNewsSafe(sql, {
    sourceKey: BLENDER_SEED_KEY,
    payload: {
      kind: "box",
      faces: [{ name, avatarId: row?.avatar_id || "poor", userId }],
      prizeId: "gladiator",
      prizeLabel: "Gladiator",
    },
  });
}

export async function listNewsHandler(): Promise<NewsItem[]> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNewsTable(sql);
  await seedBlenderGladiator(sql);
  const yday = newsLookbackDay();
  const startEt = `${yday} 00:00:00`;
  try {
    return await backfillWindow(sql, yday, startEt);
  } catch (err) {
    console.error("[darkness] news backfill failed", err);
    const rows = await sql.query<{ id: number | string; kind: string; payload: unknown; created_at: unknown }>(
      `select id, kind, payload, created_at
         from darkness_news
        where created_at >= $1::timestamp at time zone 'America/New_York'
          and kind in ('box', 'scratch', 'daily_win', 'weekly_win')
        order by created_at desc, id desc
        limit 50`,
      [startEt],
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
}

export { formatNewsScore, newsFace };
