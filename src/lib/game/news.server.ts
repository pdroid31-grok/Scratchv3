/** Server-only public news feed. Do not import from client modules. */
import { clipGm, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { avatarById, clampAvatar, type AvatarId } from "./avatars";
import { prizeByKey } from "./scratch";
import { formatNewsScore, newsFace, newsLookbackDay, dailyWinEventAt, weeklyWinEventAt, type NewsItem, type NewsKind } from "./news";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type NewsPayload = {
  kind: NewsKind;
  faces: { name: string; avatarId: string; userId?: string | null }[];
  score?: string;
  prizeId?: string;
  prizeLabel?: string;
  stars?: number;
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

async function ensureNewsSeenColumn(sql: Sql): Promise<void> {
  await sql.query(`alter table player_profiles add column if not exists last_seen_event_at bigint`);
}

function maxEventAt(items: readonly NewsItem[]): number {
  let max = 0;
  for (const item of items) {
    const at = Number(item.event_at);
    if (Number.isFinite(at) && at > max) max = at;
  }
  return max;
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
  if (input.payload.kind === "match") return;
  if (input.payload.faces.some((face) => newsHidden(face.userId, face.name))) return;
  await sql.query(
    `insert into darkness_news (kind, source_key, payload)
     values ($1, $2, $3::jsonb)
     on conflict (source_key) do nothing`,
    [input.payload.kind, input.sourceKey, JSON.stringify(input.payload)],
  );
}

export async function recordLookUnlockNews(
  sql: Sql,
  userId: string,
  prizeId: string,
  from: "stars" | "feats",
): Promise<void> {
  const actor = await newsActor(sql, userId);
  if (!actor) return;
  const prize = avatarById(prizeId);
  const kind = from === "stars" ? "star_unlock" : "feat_unlock";
  await recordNewsSafe(sql, {
    sourceKey: `${kind}:${userId}:${prize.id}`,
    payload: {
      kind,
      faces: [{ name: actor.name, avatarId: actor.avatarId, userId }],
      prizeId: prize.id,
      prizeLabel: prize.name,
    },
  });
  try {
    const { recordUnlockToast } = await import("./toasts.server");
    await recordUnlockToast(sql, userId, prize.id, from);
  } catch (err) {
    console.error("[darkness] unlock toast failed", err);
  }
}

const PAT_DJ_FLAG = "news-toast-pat-dj-v1";
const PAT_DJ_USER = "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh";
const PAT_DJ_ID = "dj" as const;

/** One-shot: Pat already owns DJ. Write missing star_unlock news + unseen toast. Do not touch owned/bank/stars. */
export async function backfillPatDjUnlockOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_news_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_news_flags where key = $1`,
    [PAT_DJ_FLAG],
  );
  if (already[0]) return;
  await recordLookUnlockNews(sql, PAT_DJ_USER, PAT_DJ_ID, "stars");
  await sql.query(`insert into darkness_news_flags (key) values ($1) on conflict do nothing`, [PAT_DJ_FLAG]);
  console.log("[darkness] news toast pat dj v1");
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

function asStamp(value: unknown): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : 0;
}

type WeekStamp = { endAt: number; lockAt: number };

function weeklyKey(season: unknown, week: unknown): string {
  return `${Number(season)}-W${Number(week)}`;
}

function weeklyFromSource(key: string): { season: number; week: number } | null {
  const hit = /^weekly_win:(\d+)-W(\d+):/.exec(key);
  if (!hit) return null;
  return { season: Number(hit[1]), week: Number(hit[2]) };
}

function eventAtFor(
  kind: NewsKind,
  raw: NewsPayload,
  sourceKey: string,
  createdAt: number,
  weeks: Map<string, WeekStamp>,
): number {
  if (kind === "daily_win" && raw.day) return dailyWinEventAt(raw.day);
  if (kind === "weekly_win") {
    const parsed = weeklyFromSource(sourceKey);
    const stamp = parsed ? weeks.get(weeklyKey(parsed.season, parsed.week)) : undefined;
    return weeklyWinEventAt(stamp?.endAt, stamp?.lockAt, createdAt);
  }
  return createdAt;
}

function parseItem(
  row: { id: number | string; kind: string; source_key?: string; payload: unknown; created_at: unknown },
  weeks: Map<string, WeekStamp>,
): (NewsItem & { created_at: number }) | null {
  const raw = row.payload && typeof row.payload === "object" ? (row.payload as NewsPayload) : null;
  if (!raw || !Array.isArray(raw.faces) || !raw.faces.length) return null;
  if (raw.faces.some((face) => newsHidden(face.userId, face.name))) return null;
  const kind = raw.kind;
  if (
    kind !== "box" &&
    kind !== "scratch" &&
    kind !== "daily_win" &&
    kind !== "weekly_win" &&
    kind !== "star_unlock" &&
    kind !== "feat_unlock"
  ) {
    return null;
  }
  const created = asTime(row.created_at);
  const eventAt = eventAtFor(kind, raw, String(row.source_key ?? ""), created, weeks);
  return {
    id: Number(row.id) || 0,
    at: eventAt,
    event_at: eventAt,
    created_at: created,
    kind,
    faces: raw.faces.map((face) => newsFace(face.name, face.avatarId)),
    score: raw.score,
    prizeId: raw.prizeId ? clampAvatar(raw.prizeId) : undefined,
    prizeLabel: raw.prizeLabel,
    stars: Number.isFinite(Number(raw.stars)) ? Math.max(0, Math.floor(Number(raw.stars))) : undefined,
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

function pushUnique(out: (NewsItem & { created_at: number })[], seen: Set<string>, key: string, item: (NewsItem & { created_at: number }) | null): void {
  if (!item || seen.has(key)) return;
  if (item.faces.some((face) => newsHidden(undefined, face.name))) return;
  seen.add(key);
  out.push(item);
}

async function loadWeekStamps(sql: Sql): Promise<Map<string, WeekStamp>> {
  const out = new Map<string, WeekStamp>();
  try {
    const rows = await sql.query<{ season: number | string; week: number | string; end_at: unknown; lock_at: unknown }>(
      `select season, week, end_at, lock_at from darkness_weekly_weeks`,
    );
    for (const row of rows) {
      out.set(weeklyKey(row.season, row.week), { endAt: asStamp(row.end_at), lockAt: asStamp(row.lock_at) });
    }
  } catch {
    /* weeks table may be empty */
  }
  return out;
}

function rankNews(rows: (NewsItem & { created_at: number })[]): NewsItem[] {
  rows.sort((a, b) => b.event_at - a.event_at || b.created_at - a.created_at || b.id - a.id);
  return rows.slice(0, 50).map(({ created_at: _c, ...item }) => item);
}

async function backfillWindow(sql: Sql, startDay: string, startEt: string): Promise<NewsItem[]> {
  const out: (NewsItem & { created_at: number })[] = [];
  const seen = new Set<string>();
  const weeks = await loadWeekStamps(sql);

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
        and kind in ('box', 'scratch', 'daily_win', 'weekly_win', 'star_unlock', 'feat_unlock')
      order by created_at desc, id desc
      limit 80`,
    [startEt],
  );
  for (const row of stored) {
    const item = parseItem(row, weeks);
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
    const at = asTime(row.scratched_at);
    pushUnique(out, seen, key, {
      id: sourceId(key),
      at,
      event_at: at,
      created_at: at,
      kind: "scratch",
      faces: [newsFace(actor.name, actor.avatarId)],
      prizeId: prize.avatar ?? undefined,
      prizeLabel: prize.label,
    });
  }

  const winners = await sql.query<{
    user_id: string;
    day: string;
    score: number | string;
    finished_at: unknown;
  }>(
    `select r.user_id, r.day::text as day, r.score,
            coalesce(r.finished_at, p.created_at, r.started_at) as finished_at
       from darkness_daily_runs r
       join darkness_daily_days d on d.day = r.day
       join darkness_payouts p
         on p.kind = 'daily_win'
        and p.source_key = 'daily_win:' || r.day::text || ':' || r.user_id
      where r.day >= $1::date
        and r.status = 'done'
        and r.payout_win = true
        and d.awarded = true
        and r.score is not null
      order by r.day desc
      limit 32`,
    [startDay],
  );
  const winActors = await loadActors(
    sql,
    winners.map((row) => row.user_id),
  );
  for (const row of winners) {
    const day = String(row.day);
    const key = `daily_win:${day}:${row.user_id}`;
    const actor = winActors.get(row.user_id);
    if (!actor) continue;
    const score = formatNewsScore(Number(row.score));
    await recordNewsSafe(sql, {
      sourceKey: key,
      payload: {
        kind: "daily_win",
        faces: [{ name: actor.name, avatarId: actor.avatarId, userId: row.user_id }],
        day,
        score,
      },
    });
    const eventAt = dailyWinEventAt(day);
    pushUnique(out, seen, key, {
      id: sourceId(key),
      at: eventAt,
      event_at: eventAt,
      created_at: asTime(row.finished_at),
      kind: "daily_win",
      faces: [newsFace(actor.name, actor.avatarId)],
      day,
      score,
    });
  }

  const weekly = await sql.query<{
    user_id: string;
    season: number | string;
    week: number | string;
    score: number | string;
    created_at: unknown;
    end_at: unknown;
    lock_at: unknown;
  }>(
    `select r.user_id, r.season, r.week, r.score, p.created_at, w.end_at, w.lock_at
       from darkness_weekly_runs r
       join darkness_payouts p
         on p.source_key = 'weekly_win:' || r.season::text || '-W' || r.week::text || ':' || r.user_id
       left join darkness_weekly_weeks w
         on w.season = r.season and w.week = r.week
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
    const created = asTime(row.created_at);
    const eventAt = weeklyWinEventAt(asStamp(row.end_at), asStamp(row.lock_at), created);
    pushUnique(out, seen, key, {
      id: sourceId(key),
      at: eventAt,
      event_at: eventAt,
      created_at: created,
      kind: "weekly_win",
      faces: [newsFace(actor.name, actor.avatarId)],
      week: `Week ${row.week}`,
      score: formatNewsScore(Number(row.score)),
    });
  }

  return rankNews(out);
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
  const startDay = newsLookbackDay();
  const startEt = `${startDay} 00:00:00`;
  try {
    return await backfillWindow(sql, startDay, startEt);
  } catch (err) {
    console.error("[darkness] news backfill failed", err);
    const weeks = await loadWeekStamps(sql);
    const rows = await sql.query<{
      id: number | string;
      kind: string;
      source_key: string;
      payload: unknown;
      created_at: unknown;
    }>(
      `select id, kind, source_key, payload, created_at
         from darkness_news
        where created_at >= $1::timestamp at time zone 'America/New_York'
          and kind in ('box', 'scratch', 'daily_win', 'weekly_win', 'star_unlock', 'feat_unlock')
        order by created_at desc, id desc
        limit 50`,
      [startEt],
    );
    const out: (NewsItem & { created_at: number })[] = [];
    for (const row of rows) {
      const item = parseItem(row, weeks);
      if (!item) continue;
      out.push(item);
    }
    return rankNews(out);
  }
}

export async function peekNewsUnseenHandler(userId: string | null): Promise<number> {
  if (!userId) return 0;
  const items = await listNewsHandler();
  const max = maxEventAt(items);
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNewsSeenColumn(sql);
  const rows = await sql.query<{ last_seen_event_at: number | string | null }>(
    `select last_seen_event_at from player_profiles where user_id = $1`,
    [userId],
  );
  if (!rows[0]) return 0;
  const seen = Number(rows[0].last_seen_event_at);
  if (!Number.isFinite(seen) || seen <= 0) {
    if (max > 0) {
      await sql.query(
        `update player_profiles
            set last_seen_event_at = $1, updated_at = now()
          where user_id = $2
            and (last_seen_event_at is null or last_seen_event_at <= 0)`,
        [max, userId],
      );
    }
    return 0;
  }
  return items.reduce((n, item) => n + (Number(item.event_at) > seen ? 1 : 0), 0);
}

export async function markNewsSeenHandler(userId: string | null): Promise<void> {
  if (!userId) return;
  const max = maxEventAt(await listNewsHandler());
  if (!max) return;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNewsSeenColumn(sql);
  await sql.query(
    `update player_profiles
        set last_seen_event_at = greatest(coalesce(last_seen_event_at, 0), $1),
            updated_at = now()
      where user_id = $2`,
    [max, userId],
  );
}

export { formatNewsScore, newsFace };
