import { dailyYesterday } from "./daily";
import { stampDayGap } from "./avatars";

/** Consecutive done days ending today, or yesterday if today is not in yet. A missing day is 0. */
export function currentCalendarRun(days: readonly string[], today: string): number {
  const have = new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)));
  let anchor = today;
  if (!have.has(anchor)) {
    const prev = dailyYesterday(today);
    if (!have.has(prev)) return 0;
    anchor = prev;
  }
  let n = 0;
  let day = anchor;
  while (have.has(day)) {
    n += 1;
    const prev = dailyYesterday(day);
    if (prev >= day) break;
    day = prev;
  }
  return n;
}

/** Trailing played scores that stay at or over the line. A lower score is 0. Skips are not in the list. */
export function trailingAtLeast(scores: readonly number[], line: number): number {
  let n = 0;
  for (let i = scores.length - 1; i >= 0; i -= 1) {
    if (scores[i]! < line) break;
    n += 1;
  }
  return n;
}

/** Played days in the current strict rise. The latest day counts as 1. A score that does not rise stops it. */
export function risingTail(scores: readonly number[]): number {
  if (!scores.length) return 0;
  let n = 1;
  for (let i = scores.length - 1; i > 0; i -= 1) {
    if (!(scores[i]! > scores[i - 1]!)) break;
    n += 1;
  }
  return n;
}

/** Played days in the current strict fall. The latest day counts as 1. A score that does not fall stops it. */
export function fallingTail(scores: readonly number[]): number {
  if (!scores.length) return 0;
  let n = 1;
  for (let i = scores.length - 1; i > 0; i -= 1) {
    if (!(scores[i]! < scores[i - 1]!)) break;
    n += 1;
  }
  return n;
}

/** Consecutive last-place days ending today, or yesterday if today is still open. */
export function currentLastPlaceRun(awardedDays: readonly string[], lastDays: readonly string[], today: string): number {
  const awarded = new Set(awardedDays);
  const last = new Set(lastDays);
  const anchor = awarded.has(today) ? today : dailyYesterday(today);
  if (!awarded.has(anchor)) return 0;
  let n = 0;
  let day = anchor;
  while (awarded.has(day) && last.has(day)) {
    n += 1;
    const prev = dailyYesterday(day);
    if (prev >= day) break;
    day = prev;
  }
  return n;
}

/** Current no-win run. A win is 0. Days that were not played are absent. */
export function currentColdRun(rows: readonly { day: string; won: boolean }[]): number {
  const won = new Map<string, boolean>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    won.set(day, Boolean(won.get(day)) || Boolean(row.won));
  }
  let run = 0;
  for (const day of [...won.keys()].sort()) {
    run = won.get(day) ? 0 : run + 1;
  }
  return run;
}

/** Consecutive calendar days ending today or yesterday, each a score under the line. */
export function currentUnderRun(rows: readonly { day: string; score: number }[], today: string, line: number): number {
  const scores = new Map<string, number>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(row.score)) continue;
    scores.set(day, row.score);
  }
  let anchor = today;
  if (!scores.has(anchor)) {
    const prev = dailyYesterday(today);
    if (!scores.has(prev)) return 0;
    anchor = prev;
  }
  if (scores.get(anchor)! >= line) return 0;
  let n = 0;
  let day = anchor;
  while (scores.has(day) && scores.get(day)! < line) {
    n += 1;
    const prev = dailyYesterday(day);
    if (prev >= day) break;
    day = prev;
  }
  return n;
}

export function daysSince(lastDay: string, today: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return 0;
  return stampDayGap(lastDay, today);
}

export type FeatProgressLines = Record<string, string>;

/** 1-based finish. Ties share the place. The next place skips the tied count. */
export function finishPlace(rows: readonly { userId: string; score: number }[], userId: string): number | null {
  const mine = rows.find((row) => row.userId === userId);
  if (!mine || !Number.isFinite(mine.score)) return null;
  let ahead = 0;
  for (const row of rows) {
    if (row.score > mine.score) ahead += 1;
  }
  return ahead + 1;
}

/** Distinct places 1 through 10. A place already held is not counted again. */
export function placesHeld(
  days: readonly (readonly { userId: string; score: number }[])[],
  userId: string,
  need = 10,
): number[] {
  const held = new Set<number>();
  for (const rows of days) {
    const place = finishPlace(rows, userId);
    if (place == null || place < 1 || place > need) continue;
    held.add(place);
  }
  return [...held].sort((a, b) => a - b);
}

export function musicalChairLine(places: readonly number[]): string {
  const n = places.length;
  if (!n) return "0/10";
  return `${places.join(", ")} · ${n}/10`;
}

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

function ymdFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ymdAdd(ymd: string, days: number): string {
  const date = utcDay(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return ymdFromUtc(date);
}

export function ymdWeekday(ymd: string): number {
  return utcDay(ymd).getUTCDay();
}

/** Sunday of the calendar week that contains this date. */
export function weekSunday(ymd: string): string {
  return ymdAdd(ymd, -ymdWeekday(ymd));
}

export function placeWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function consistentLine(average: number | null, place: number | null): string {
  if (average == null || place == null || !Number.isFinite(average)) return "—";
  return `${average.toFixed(1)} · ${placeWord(place)}`;
}
