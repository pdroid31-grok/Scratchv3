/** Server-only board feats. Daily + Weekly + first scratch. */
import {
  parseOwned,
  hitBullseyeScore,
  hitHeavyHitterScore,
  skipHeavyHitterWeek,
  earlyBirdDayCount,
  nightOwlDayCount,
  lostGapHit,
  comebackKidHit,
  freeFallHit,
  BULLSEYE_ID,
  RAINY_DAY_ID,
  EARLY_BIRD_ID,
  HEAVY_HITTER_ID,
  LOST_ID,
  VEGAS_ID,
  NIGHT_OWL_ID,
  COMEBACK_KID_ID,
  FREE_FALL_ID,
  BOX_LUNCH_ID,
  DOUBLE_DONUT_ID,
  LUMPED_UP_ID,
  NEGATIVE_ID,
  EARLY_BIRD_NEED,
  NIGHT_OWL_NEED,
  FEAT_TRACK_FROM,
  DOUBLE_DONUT_FROM,
  NEGATIVE_FROM,
  doubleDonutHit,
  isExactZeroScore,
  isNegativeScore,
  lumpedUpHit,
  weeklyRealZeroCount,
  type AvatarId,
  type EarlyBirdRow,
} from "./avatars";
import { clipGm, isAwardSkippedName, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { dailyDayStamp, dailyYesterday } from "./daily";
import { teamBye } from "./elim-byes";
import { hiddenWeeks } from "./elim-data";
import { ELIM_WEEKS } from "./elim-weeks";
import { ELIM_LEGACY_WEEKS } from "./elim-legacy-weeks";
import type { TeamId } from "./types";

export const RAINY_DAY_FROM = "2026-09-19";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

function skipWho(userId: string, name?: string | null): boolean {
  if (isHiddenBoardId(userId)) return true;
  if (isHiddenBoardName(name) || isAwardSkippedName(name)) return true;
  return false;
}

function skipBoardRow(userId: string, name?: string | null): boolean {
  return isHiddenBoardId(userId) || isHiddenBoardName(name) || isAwardSkippedName(name);
}

function asTime(value: unknown): number {
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

async function grantFeat(sql: Sql, userId: string, featId: AvatarId): Promise<void> {
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
  if (owned.includes(featId)) return;
  const next = [...owned, featId];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  const { recordLookUnlockNews } = await import("./news.server");
  await recordLookUnlockNews(sql, userId, featId, "feats");
}

export async function maybeGrantBullseye(sql: Sql, userId: string, score: number): Promise<void> {
  if (!hitBullseyeScore(score)) return;
  try {
    await grantFeat(sql, userId, BULLSEYE_ID);
  } catch (err) {
    console.error("[darkness] bullseye grant failed", err);
  }
}

async function lastPlaceIds(sql: Sql, day: string): Promise<string[]> {
  if (!day || day < RAINY_DAY_FROM) return [];
  const rows = await sql.query<{ user_id: string; name: string | null; score: number | string }>(
    `select r.user_id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
            r.score
       from darkness_daily_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.day = $1::date and r.status = 'done' and r.score is not null`,
    [day],
  );
  const visible: { userId: string; score: number }[] = [];
  for (const row of rows) {
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    visible.push({ userId: row.user_id, score });
  }
  if (visible.length < 2) return [];
  const min = Math.min(...visible.map((row) => row.score));
  return visible.filter((row) => row.score === min).map((row) => row.userId);
}

export async function maybeGrantRainyDay(sql: Sql, day: string): Promise<void> {
  try {
    if (!day || day < RAINY_DAY_FROM) return;
    const prev = dailyYesterday(day);
    if (prev < RAINY_DAY_FROM) return;
    const todayLast = await lastPlaceIds(sql, day);
    if (!todayLast.length) return;
    const prevLast = new Set(await lastPlaceIds(sql, prev));
    for (const userId of todayLast) {
      if (!prevLast.has(userId)) continue;
      await grantFeat(sql, userId, RAINY_DAY_ID);
    }
  } catch (err) {
    console.error("[darkness] rainy day grant failed", err);
  }
}

/** Grant once the user was the first visible Daily lock on 10 distinct ET days (>= 2026-09-17). Not the 10th lock overall. */
export async function maybeGrantEarlyBird(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{
      day: string;
      user_id: string;
      name: string | null;
      finished_at: unknown;
      started_at: unknown;
    }>(
      `select r.day::text as day,
              r.user_id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
              r.finished_at,
              r.started_at
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day >= $1::date and r.status = 'done'`,
      [FEAT_TRACK_FROM],
    );
    const visible: EarlyBirdRow[] = [];
    for (const row of rows) {
      if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
      const at = asTime(row.finished_at) || asTime(row.started_at);
      if (!at) continue;
      visible.push({ day: String(row.day).slice(0, 10), userId: row.user_id, at });
    }
    if (earlyBirdDayCount(userId, visible) < EARLY_BIRD_NEED) return;
    await grantFeat(sql, userId, EARLY_BIRD_ID);
  } catch (err) {
    console.error("[darkness] early bird grant failed", err);
  }
}

/** Grant once the user still holds last visible Daily lock on 10 distinct ET days (>= 2026-09-17). Last can move until midnight ET. */
export async function maybeGrantNightOwl(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{
      day: string;
      user_id: string;
      name: string | null;
      finished_at: unknown;
      started_at: unknown;
    }>(
      `select r.day::text as day,
              r.user_id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
              r.finished_at,
              r.started_at
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day >= $1::date and r.status = 'done'`,
      [FEAT_TRACK_FROM],
    );
    const today = dailyDayStamp();
    const visible: EarlyBirdRow[] = [];
    for (const row of rows) {
      if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
      const at = asTime(row.finished_at) || asTime(row.started_at);
      if (!at) continue;
      const day = String(row.day).slice(0, 10);
      if (day < today && dailyDayStamp(at) !== day) continue;
      visible.push({ day, userId: row.user_id, at });
    }
    if (nightOwlDayCount(userId, visible) < NIGHT_OWL_NEED) return;
    await grantFeat(sql, userId, NIGHT_OWL_ID);
  } catch (err) {
    console.error("[darkness] night owl grant failed", err);
  }
}

export async function maybeGrantLost(sql: Sql, userId: string, day: string): Promise<void> {
  try {
    if (!day || day < FEAT_TRACK_FROM) return;
    const prev = await sql.query<{ day: string }>(
      `select r.day::text as day
         from darkness_daily_runs r
        where r.user_id = $1 and r.status = 'done' and r.day < $2::date
        order by r.day desc
        limit 1`,
      [userId, day],
    );
    const prevDay = String(prev[0]?.day ?? "").slice(0, 10);
    if (!lostGapHit(prevDay, day)) return;
    await grantFeat(sql, userId, LOST_ID);
  } catch (err) {
    console.error("[darkness] lost grant failed", err);
  }
}

export async function maybeGrantHeavyHitter(
  sql: Sql,
  userId: string,
  season: number,
  week: number,
  picks: { score?: number }[],
): Promise<void> {
  try {
    if (skipHeavyHitterWeek(season, week)) return;
    if (!picks.some((row) => hitHeavyHitterScore(Number(row.score)))) return;
    await grantFeat(sql, userId, HEAVY_HITTER_ID);
  } catch (err) {
    console.error("[darkness] heavy hitter grant failed", err);
  }
}

export async function maybeGrantVegas(sql: Sql, userId: string): Promise<void> {
  try {
    await grantFeat(sql, userId, VEGAS_ID);
  } catch (err) {
    console.error("[darkness] vegas grant failed", err);
  }
}

async function visiblePlaceIds(sql: Sql, day: string, edge: "min" | "max"): Promise<string[]> {
  if (!day || day < FEAT_TRACK_FROM) return [];
  const rows = await sql.query<{ user_id: string; name: string | null; score: number | string }>(
    `select r.user_id,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name,
            r.score
       from darkness_daily_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.day = $1::date and r.status = 'done' and r.score is not null`,
    [day],
  );
  const visible: { userId: string; score: number }[] = [];
  for (const row of rows) {
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    visible.push({ userId: row.user_id, score });
  }
  if (visible.length < 2) return [];
  const bound = edge === "min" ? Math.min(...visible.map((row) => row.score)) : Math.max(...visible.map((row) => row.score));
  return visible.filter((row) => row.score === bound).map((row) => row.userId);
}

async function dayAwarded(sql: Sql, day: string): Promise<boolean> {
  const rows = await sql.query<{ awarded: boolean }>(
    `select awarded from darkness_daily_days where day = $1::date`,
    [day],
  );
  return Boolean(rows[0]?.awarded);
}

export async function maybeGrantComebackPair(sql: Sql, day: string): Promise<void> {
  try {
    if (!day || day < FEAT_TRACK_FROM) return;
    const prev = dailyYesterday(day);
    if (prev < FEAT_TRACK_FROM) return;
    if (!(await dayAwarded(sql, day)) || !(await dayAwarded(sql, prev))) return;
    const prevLast = await visiblePlaceIds(sql, prev, "min");
    const prevFirst = await visiblePlaceIds(sql, prev, "max");
    const todayLast = await visiblePlaceIds(sql, day, "min");
    const todayFirst = await visiblePlaceIds(sql, day, "max");
    const ids = new Set([...prevLast, ...prevFirst, ...todayLast, ...todayFirst]);
    for (const userId of ids) {
      if (comebackKidHit(prevLast, todayFirst, userId)) await grantFeat(sql, userId, COMEBACK_KID_ID);
      if (freeFallHit(prevFirst, todayLast, userId)) await grantFeat(sql, userId, FREE_FALL_ID);
    }
  } catch (err) {
    console.error("[darkness] comeback pair grant failed", err);
  }
}

export async function maybeGrantBoxLunch(sql: Sql, userId: string, at = Date.now()): Promise<void> {
  try {
    const day = dailyDayStamp(at);
    if (!day || day < FEAT_TRACK_FROM) return;
    const box = await sql.query<{ ok: number | string }>(
      `select 1 as ok
         from darkness_news
        where kind = 'box'
          and source_key like $1
          and to_char(created_at at time zone 'America/New_York', 'YYYY-MM-DD') = $2
        limit 1`,
      [`box:${userId}:%`, day],
    );
    const scratch = await sql.query<{ ok: number | string }>(
      `select 1 as ok
         from darkness_scratch_cards
        where user_id = $1
          and scratched_at is not null
          and to_char(scratched_at at time zone 'America/New_York', 'YYYY-MM-DD') = $2
        limit 1`,
      [userId, day],
    );
    if (!box[0] || !scratch[0]) return;
    await grantFeat(sql, userId, BOX_LUNCH_ID);
  } catch (err) {
    console.error("[darkness] box lunch grant failed", err);
  }
}

const PAT_BOX_LUNCH_ID = "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh";
const PAT_BOX_LUNCH_FLAG = "boxlunch-pat-v1";

/** One check. Same ET day must have box news and a scratched card. Does not invent either. */
export async function grantPatBoxLunchOnce(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_feat_flags where key = $1`,
    [PAT_BOX_LUNCH_FLAG],
  );
  if (already[0]) return;
  const hit = await sql.query<{ ok: number | string }>(
    `select 1 as ok
       from darkness_news n
      where n.kind = 'box'
        and n.source_key like $1
        and to_char(n.created_at at time zone 'America/New_York', 'YYYY-MM-DD') >= $2
        and exists (
          select 1
            from darkness_scratch_cards c
           where c.user_id = $3
             and c.scratched_at is not null
             and to_char(c.scratched_at at time zone 'America/New_York', 'YYYY-MM-DD')
               = to_char(n.created_at at time zone 'America/New_York', 'YYYY-MM-DD')
        )
      limit 1`,
    [`box:${PAT_BOX_LUNCH_ID}:%`, FEAT_TRACK_FROM, PAT_BOX_LUNCH_ID],
  );
  if (hit[0]) await grantFeat(sql, PAT_BOX_LUNCH_ID, BOX_LUNCH_ID);
  await sql.query(`insert into darkness_feat_flags (key) values ($1) on conflict do nothing`, [PAT_BOX_LUNCH_FLAG]);
}

function rawElimWeek(id: string, week: number): number | null {
  const raw = ELIM_WEEKS[id] ?? ELIM_LEGACY_WEEKS[id];
  if (!raw || week < 1 || week > raw.length) return null;
  const score = raw[week - 1];
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

/** Real 0.0 on that lineup's week. Bye, blank, hidden week, and a missing cell do not count. */
export function dailyLineupRealZeroCount(
  picks: readonly { id?: string; name?: string; team?: string }[],
  year: number,
  week: number,
): number {
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1) return 0;
  if (hiddenWeeks(year).includes(week)) return 0;
  let n = 0;
  const seen = new Set<string>();
  for (const pick of picks) {
    const id = String(pick.id ?? "").trim();
    const name = String(pick.name ?? "").trim();
    const team = String(pick.team ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    if (team && teamBye(year, team as TeamId) === week) continue;
    const cell = rawElimWeek(id, week);
    if (cell == null || !isExactZeroScore(cell)) continue;
    seen.add(id);
    n += 1;
  }
  return n;
}

/** Real score under 0 on that Daily lineup. Bye, blank, hidden week, and a missing cell do not count. */
export function dailyLineupHasNegative(
  picks: readonly { id?: string; name?: string; team?: string }[],
  year: number,
  week: number,
): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1) return false;
  if (hiddenWeeks(year).includes(week)) return false;
  const seen = new Set<string>();
  for (const pick of picks) {
    const id = String(pick.id ?? "").trim();
    const name = String(pick.name ?? "").trim();
    const team = String(pick.team ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    if (team && teamBye(year, team as TeamId) === week) continue;
    const cell = rawElimWeek(id, week);
    if (cell != null && isNegativeScore(cell)) return true;
  }
  return false;
}

export async function maybeGrantNegative(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ day: string; year: number | string; week: number | string; picks: unknown }>(
      `select r.day::text as day, d.year, d.week, r.picks
         from darkness_daily_runs r
         join darkness_daily_days d on d.day = r.day
        where r.user_id = $1
          and r.status = 'done'
          and r.day >= $2::date
          and r.picks is not null`,
      [userId, NEGATIVE_FROM],
    );
    for (const row of rows) {
      const picks = Array.isArray(row.picks) ? (row.picks as { id?: string; name?: string; team?: string }[]) : [];
      if (!dailyLineupHasNegative(picks, Number(row.year), Number(row.week))) continue;
      await grantFeat(sql, userId, NEGATIVE_ID);
      return;
    }
  } catch (err) {
    console.error("[darkness] negative grant failed", err);
  }
}

export async function maybeGrantDoubleDonutDaily(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ day: string; year: number | string; week: number | string; picks: unknown }>(
      `select r.day::text as day, d.year, d.week, r.picks
         from darkness_daily_runs r
         join darkness_daily_days d on d.day = r.day
        where r.user_id = $1
          and r.status = 'done'
          and r.day >= $2::date
          and r.picks is not null`,
      [userId, DOUBLE_DONUT_FROM],
    );
    for (const row of rows) {
      const picks = Array.isArray(row.picks) ? (row.picks as { id?: string; name?: string; team?: string }[]) : [];
      if (!doubleDonutHit(dailyLineupRealZeroCount(picks, Number(row.year), Number(row.week)))) continue;
      await grantFeat(sql, userId, DOUBLE_DONUT_ID);
      return;
    }
  } catch (err) {
    console.error("[darkness] double donut daily failed", err);
  }
}

export async function maybeGrantDoubleDonutWeekly(
  sql: Sql,
  userId: string,
  picks: unknown,
  live: Readonly<Record<string, number>>,
  awardDay: string,
  weekDone: boolean,
  finalTeams: ReadonlySet<string>,
): Promise<void> {
  try {
    if (!weekDone) return;
    if (!awardDay || awardDay < DOUBLE_DONUT_FROM) return;
    const rows = Array.isArray(picks) ? (picks as { id?: string; sid?: string; name?: string; team?: string; vs?: string }[]) : [];
    if (!doubleDonutHit(weeklyRealZeroCount(rows, live, finalTeams))) return;
    await grantFeat(sql, userId, DOUBLE_DONUT_ID);
  } catch (err) {
    console.error("[darkness] double donut weekly failed", err);
  }
}

export async function maybeGrantLumpedUp(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ day: string; score: number | string }>(
      `select r.day::text as day, r.score
         from darkness_daily_runs r
        where r.user_id = $1
          and r.status = 'done'
          and r.score is not null
          and r.day >= $2::date`,
      [userId, FEAT_TRACK_FROM],
    );
    const played = rows.map((row) => ({ day: String(row.day).slice(0, 10), score: Number(row.score) }));
    if (!lumpedUpHit(played)) return;
    await grantFeat(sql, userId, LUMPED_UP_ID);
  } catch (err) {
    console.error("[darkness] lumped up grant failed", err);
  }
}
