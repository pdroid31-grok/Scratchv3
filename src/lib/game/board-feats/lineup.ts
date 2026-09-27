import {
  THRIFTY_ID,
  thriftyHit,
  thriftySlotCosts,
  DOUBLE_DONUT_ID,
  LUMPED_UP_ID,
  NEGATIVE_ID,
  THREE_HEADED_ID,
  TRIPLE_DONUT_ID,
  PENNY_ID,
  BLUE_STREAK_ID,
  COLD_STREAK_ID,
  TRIPLE_DONUT_FROM,
  PENNY_FROM,
  BLUE_STREAK_FROM,
  COLD_STREAK_FROM,
  threeHeadedHit,
  tripleDonutHit,
  pennyHit,
  blueStreakHit,
  coldStreakHit,
  FEAT_TRACK_FROM,
  DOUBLE_DONUT_FROM,
  NEGATIVE_FROM,
  doubleDonutHit,
  isExactZeroScore,
  isNegativeScore,
  lumpedUpHit,
  weeklyRealZeroCount,
} from "../avatars";
import { teamBye } from "../elim-byes";
import { hiddenWeeks, isElimSlot, slotPos, weekScoreTone } from "../elim-data";
import { ELIM_WEEKS } from "../elim-weeks";
import { ELIM_LEGACY_WEEKS } from "../elim-legacy-weeks";
import type { TeamId } from "../types";
import { grantFeat, type Sql } from "./grant";

type SlotPick = { slot?: string; cost?: number };

export async function maybeGrantThrifty(
  sql: Sql,
  userId: string,
  picks: readonly SlotPick[],
  won: boolean,
  day: string,
): Promise<void> {
  try {
    if (!won) return;
    if (!day || day < FEAT_TRACK_FROM) return;
    const costs = thriftySlotCosts(picks);
    if (!costs || !thriftyHit(costs)) return;
    await grantFeat(sql, userId, THRIFTY_ID);
  } catch (err) {
    console.error("[darkness] thrifty grant failed", err);
  }
}

export async function maybeGrantThriftyDaily(sql: Sql, day: string): Promise<void> {
  if (!day || day < FEAT_TRACK_FROM) return;
  const rows = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks
       from darkness_daily_runs
      where day = $1::date and status = 'done' and payout_win is true`,
    [day],
  );
  for (const row of rows) {
    const picks = Array.isArray(row.picks) ? (row.picks as SlotPick[]) : [];
    await maybeGrantThrifty(sql, row.user_id, picks, true, day);
  }
}

export async function maybeGrantThriftyWeekly(sql: Sql, season: number, week: number, awardDay: string): Promise<void> {
  if (!awardDay || awardDay < FEAT_TRACK_FROM) return;
  const rows = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and status = 'done' and payout_win is true`,
    [season, week],
  );
  for (const row of rows) {
    const picks = Array.isArray(row.picks) ? (row.picks as SlotPick[]) : [];
    await maybeGrantThrifty(sql, row.user_id, picks, true, awardDay);
  }
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

export type LinePick = { id?: string; name?: string; team?: string; slot?: string; cost?: number };

/** Blue band on the contest week only. Bye, blank, and a missing cell do not count. */
export function dailyBestToneCount(
  picks: readonly LinePick[],
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
    const slot = String(pick.slot ?? "");
    if (!id || !name || !isElimSlot(slot) || seen.has(id)) continue;
    const team = String(pick.team ?? "").trim();
    if (team && teamBye(year, team as TeamId) === week) continue;
    const cell = rawElimWeek(id, week);
    if (cell == null) continue;
    if (weekScoreTone(slotPos(slot), cell, false) !== "best") continue;
    seen.add(id);
    n += 1;
  }
  return n;
}

export async function maybeGrantThreeHeaded(sql: Sql, userId: string, teams: readonly string[]): Promise<void> {
  try {
    if (!threeHeadedHit(teams)) return;
    await grantFeat(sql, userId, THREE_HEADED_ID);
  } catch (err) {
    console.error("[darkness] three headed grant failed", err);
  }
}

export async function maybeGrantTripleDonutDaily(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ year: number | string; week: number | string; picks: unknown }>(
      `select d.year, d.week, r.picks
         from darkness_daily_runs r
         join darkness_daily_days d on d.day = r.day
        where r.user_id = $1
          and r.status = 'done'
          and r.day >= $2::date
          and r.picks is not null`,
      [userId, TRIPLE_DONUT_FROM],
    );
    for (const row of rows) {
      const picks = Array.isArray(row.picks) ? (row.picks as LinePick[]) : [];
      if (!tripleDonutHit(dailyLineupRealZeroCount(picks, Number(row.year), Number(row.week)))) continue;
      await grantFeat(sql, userId, TRIPLE_DONUT_ID);
      return;
    }
  } catch (err) {
    console.error("[darkness] triple donut daily failed", err);
  }
}

export async function maybeGrantTripleDonutWeekly(
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
    if (!awardDay || awardDay < TRIPLE_DONUT_FROM) return;
    const rows = Array.isArray(picks) ? (picks as { id?: string; sid?: string; name?: string; team?: string; vs?: string }[]) : [];
    if (!tripleDonutHit(weeklyRealZeroCount(rows, live, finalTeams))) return;
    await grantFeat(sql, userId, TRIPLE_DONUT_ID);
  } catch (err) {
    console.error("[darkness] triple donut weekly failed", err);
  }
}

export async function maybeGrantPenny(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ picks: unknown }>(
      `select r.picks
         from darkness_daily_runs r
        where r.user_id = $1
          and r.status = 'done'
          and r.day >= $2::date
          and r.picks is not null`,
      [userId, PENNY_FROM],
    );
    for (const row of rows) {
      const picks = Array.isArray(row.picks) ? (row.picks as LinePick[]) : [];
      if (!pennyHit(picks)) continue;
      await grantFeat(sql, userId, PENNY_ID);
      return;
    }
  } catch (err) {
    console.error("[darkness] penny grant failed", err);
  }
}

export async function maybeGrantBlueStreak(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ year: number | string; week: number | string; picks: unknown }>(
      `select d.year, d.week, r.picks
         from darkness_daily_runs r
         join darkness_daily_days d on d.day = r.day
        where r.user_id = $1
          and r.status = 'done'
          and r.day >= $2::date
          and r.picks is not null`,
      [userId, BLUE_STREAK_FROM],
    );
    for (const row of rows) {
      const picks = Array.isArray(row.picks) ? (row.picks as LinePick[]) : [];
      if (!blueStreakHit(dailyBestToneCount(picks, Number(row.year), Number(row.week)))) continue;
      await grantFeat(sql, userId, BLUE_STREAK_ID);
      return;
    }
  } catch (err) {
    console.error("[darkness] blue streak grant failed", err);
  }
}

export async function maybeGrantColdStreak(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await sql.query<{ day: string; payout_win: boolean | null }>(
      `select r.day::text as day, r.payout_win
         from darkness_daily_runs r
        where r.user_id = $1
          and r.status = 'done'
          and r.day >= $2::date`,
      [userId, COLD_STREAK_FROM],
    );
    const played = rows.map((row) => ({ day: String(row.day).slice(0, 10), won: Boolean(row.payout_win) }));
    if (!coldStreakHit(played)) return;
    await grantFeat(sql, userId, COLD_STREAK_ID);
  } catch (err) {
    console.error("[darkness] cold streak grant failed", err);
  }
}

