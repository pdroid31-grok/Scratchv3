/** One public Play-home row per ET day. Hidden names stay off, same as the boards. */
import { dailyDayStamp, dailyYesterday } from "./daily";
import { listDailyBoardHandler } from "./daily-api.server";
import type { PlayFace, PlayStrips } from "./play-public";
import { isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { listSeasonBoardHandler, listWeeklyBoardHandler } from "./weekly-api.server";
import { nflClock } from "./weekly-sleeper";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

async function getSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensurePlayPublic(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_play_public (
      et_day date primary key,
      season integer not null,
      week integer not null,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )`);
}

function face(row: { id: string; name: string; avatarId: string; score: number } | null | undefined): PlayFace | null {
  if (!row || !row.id || !row.name) return null;
  if (isHiddenBoardId(row.id) || isHiddenBoardName(row.name)) return null;
  const score = Number(row.score);
  if (!Number.isFinite(score)) return null;
  return { id: row.id, name: row.name, avatarId: row.avatarId || "poor", score };
}

function asStrips(raw: unknown, day: string, season: number, week: number): PlayStrips | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as PlayStrips;
  if (row.etDay !== day || row.season !== season || row.week !== week) return null;
  if (typeof row.weekLive !== "boolean") return null;
  return {
    etDay: day,
    season,
    week,
    yesterdayWinner: face(row.yesterdayWinner),
    todayLeader: face(row.todayLeader),
    seasonLeader: face(row.seasonLeader),
    weekLeader: row.weekLive ? face(row.weekLeader) : null,
    weekLive: row.weekLive,
  };
}

export async function computePlayStrips(): Promise<PlayStrips> {
  const etDay = dailyDayStamp();
  const clock = await nflClock();
  const [yesterday, today, season, weekBoard] = await Promise.all([
    listDailyBoardHandler({ data: { day: dailyYesterday(etDay) } }),
    listDailyBoardHandler({ data: { day: etDay } }),
    listSeasonBoardHandler({ data: { season: clock.season } }),
    listWeeklyBoardHandler({ data: { season: clock.season, week: clock.week, peek: true } }),
  ]);
  const yest =
    yesterday.rows.find((row) => row.winner || row.id === yesterday.winnerId) ?? yesterday.rows[0] ?? null;
  const weekLive = Boolean(weekBoard.live);
  const weekRow = weekLive ? (weekBoard.rows.find((row) => row.hasPicks) ?? null) : null;
  return {
    etDay,
    season: clock.season,
    week: clock.week,
    yesterdayWinner: face(yest),
    todayLeader: face(today.rows[0] ?? null),
    seasonLeader: face(season.rows[0] ?? null),
    weekLeader: face(weekRow),
    weekLive,
  };
}

const STRIP_FRESH_MS = 60_000;

async function readToday(
  sql: Sql,
  day: string,
  season: number,
  week: number,
): Promise<{ strips: PlayStrips; updatedMs: number } | null> {
  const rows = await sql.query<{
    season: number | string;
    week: number | string;
    payload: unknown;
    updated_ms: number | string;
  }>(
    `select season, week, payload, (extract(epoch from updated_at) * 1000)::bigint as updated_ms
       from darkness_play_public
      where et_day = $1::date
      limit 1`,
    [day],
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.season) !== season || Number(row.week) !== week) return null;
  let payload = row.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  const strips = asStrips(payload, day, season, week);
  if (!strips) return null;
  return { strips, updatedMs: Number(row.updated_ms) || 0 };
}

async function writeToday(sql: Sql, strips: PlayStrips): Promise<void> {
  await sql.query(
    `insert into darkness_play_public (et_day, season, week, payload, updated_at)
     values ($1::date, $2, $3, $4::jsonb, now())
     on conflict (et_day) do update
       set season = excluded.season,
           week = excluded.week,
           payload = excluded.payload,
           updated_at = now()`,
    [strips.etDay, strips.season, strips.week, JSON.stringify(strips)],
  );
}

/** Return today's row. Recompute when it is missing, older than 60s, or still null while someone is on today's board. */
export async function readOrBuildPlayStrips(): Promise<PlayStrips> {
  const sql = await getSql();
  await ensurePlayPublic(sql);
  const day = dailyDayStamp();
  const clock = await nflClock();
  const hit = await readToday(sql, day, clock.season, clock.week);
  const age = hit ? Date.now() - hit.updatedMs : Number.POSITIVE_INFINITY;
  const fresh = Boolean(hit && age < STRIP_FRESH_MS);
  if (fresh && hit?.strips.todayLeader) return hit.strips;
  if (fresh && hit && !hit.strips.todayLeader) {
    const today = await listDailyBoardHandler({ data: { day } });
    if (!face(today.rows[0] ?? null)) return hit.strips;
  }
  const strips = await computePlayStrips();
  if (strips.etDay !== day) return strips;
  await writeToday(sql, strips);
  return strips;
}

/** Cron: rewrite today's public faces every run. */
export async function refreshPlayStripsIfDue(): Promise<{ wrote: boolean }> {
  const sql = await getSql();
  await ensurePlayPublic(sql);
  const day = dailyDayStamp();
  const strips = await computePlayStrips();
  if (strips.etDay !== day) return { wrote: false };
  await writeToday(sql, strips);
  return { wrote: true };
}
