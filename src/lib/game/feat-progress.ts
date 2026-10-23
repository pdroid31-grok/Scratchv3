import { dailyYesterday } from "./daily";
import { RIDE_OR_DIE_NEED, stampDayGap } from "./avatars";

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

/** Three played days in a row are 1st, 2nd, and 3rd in any order. A 4th or worse breaks that row. */
export function podiumRowHit(places: readonly number[]): boolean {
  for (let i = 0; i + 2 < places.length; i += 1) {
    const row = [places[i], places[i + 1], places[i + 2]];
    if (row.some((place) => place == null || place >= 4)) continue;
    if (row.includes(1) && row.includes(2) && row.includes(3)) return true;
  }
  return false;
}

/** Places still on the row. A 4th or worse clears it. Skipped days are not in the list. */
export function livePodiumRow(places: readonly number[]): number[] {
  const row: number[] = [];
  for (const place of places) {
    if (place >= 4) {
      row.length = 0;
      continue;
    }
    row.push(place);
  }
  return row;
}

export function podiumLine(places: readonly number[]): string {
  const row = livePodiumRow(places);
  const word = (place: number) => (place === 1 ? "1st" : place === 2 ? "2nd" : "3rd");
  const held = row.map(word);
  const missing = [1, 2, 3].filter((place) => !row.includes(place)).map(word);
  if (!held.length) return `need ${missing.join(", ")}`;
  if (!missing.length) return held.join(", ");
  return `${held.join(", ")} · need ${missing.join(", ")}`;
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

/** Clock hour 1–12 in ET. Noon and midnight are 12. 1 AM and 1 PM are both 1. */
export function etClockHour(at: number): number | null {
  if (!at) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h12",
  }).formatToParts(new Date(at));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  return hour;
}

export function etYmd(at: number): string {
  if (!at) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function sundialHours(times: readonly number[]): number[] {
  const held = new Set<number>();
  for (const at of times) {
    const hour = etClockHour(at);
    if (hour != null) held.add(hour);
  }
  return [...held].sort((a, b) => a - b);
}

export function sundialLine(hours: readonly number[]): string {
  if (!hours.length) return "0/12";
  return `${hours.join(", ")} · ${hours.length}/12`;
}

export function tenth(score: number): number | null {
  if (!Number.isFinite(score)) return null;
  return Math.round(score * 10);
}

export function hitScore1234(score: number): boolean {
  return tenth(score) === 1234;
}

export function hitAlmost(score: number): boolean {
  return tenth(score) === 999;
}

/** Closest Daily tenth still under 99.9. 99.9 and anything over it are left out. */
export function almostLine(scores: readonly number[]): string {
  let best: number | null = null;
  for (const score of scores) {
    const hit = tenth(score);
    if (hit == null || hit >= 999) continue;
    if (best == null || hit > best) best = hit;
  }
  if (best == null) return "—";
  return (best / 10).toFixed(1);
}

/** Distinct days per one-decimal score. 0.0 is not a score. */
export function jackpotDays(rows: readonly { day: string; score: number }[]): Map<number, number> {
  const days = new Map<number, Set<string>>();
  for (const row of rows) {
    const hit = tenth(row.score);
    const day = String(row.day).slice(0, 10);
    if (hit == null || hit === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const held = days.get(hit) ?? new Set<string>();
    held.add(day);
    days.set(hit, held);
  }
  const counts = new Map<number, number>();
  for (const [hit, held] of days) counts.set(hit, held.size);
  return counts;
}

export function jackpotLine(rows: readonly { day: string; score: number }[]): string {
  const hits = [...jackpotDays(rows).entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (!hits.length) return "—";
  return hits.map(([hit]) => (hit / 10).toFixed(1)).join(", ");
}

/** Player slug and NFL season from a Daily pick id. e:2016:QB:drew-brees -> drew-brees, 2016. */
export function rideOrDieKey(id: string): { slug: string; season: string } | null {
  const parts = String(id ?? "").split(":");
  if (parts.length < 2) return null;
  const slug = parts[parts.length - 1].trim().toLowerCase();
  const season = parts.map((part) => part.trim()).find((part) => /^\d{4}$/.test(part)) ?? "";
  if (!slug || !season) return null;
  return { slug, season };
}

/** Distinct NFL seasons per player slug. Highest count first. */
export function rideOrDieCounts(ids: readonly string[]): { slug: string; n: number }[] {
  const seasons = new Map<string, Set<string>>();
  for (const id of ids) {
    const key = rideOrDieKey(id);
    if (!key) continue;
    const held = seasons.get(key.slug) ?? new Set<string>();
    held.add(key.season);
    seasons.set(key.slug, held);
  }
  return [...seasons.entries()]
    .map(([slug, held]) => ({ slug, n: held.size }))
    .sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug));
}

export function rideOrDieLine(ids: readonly string[]): string {
  const top = rideOrDieCounts(ids).slice(0, 3);
  if (!top.length) return "—";
  return top.map((row) => `${row.slug} ${row.n}`).join(", ");
}

export function rideOrDieHit(ids: readonly string[]): boolean {
  return rideOrDieCounts(ids).some((row) => row.n >= RIDE_OR_DIE_NEED);
}

export function closestTenth(scores: readonly number[]): number | null {
  let best: number | null = null;
  let dist = Infinity;
  for (const score of scores) {
    const hit = tenth(score);
    if (hit == null) continue;
    const away = Math.abs(hit - 1234);
    if (away < dist || (away === dist && best != null && hit < best)) {
      dist = away;
      best = hit;
    }
  }
  return best;
}

export function score1234Line(scores: readonly number[]): string {
  const best = closestTenth(scores);
  if (best == null) return "—";
  return (best / 10).toFixed(1);
}

export function teamCounts(teams: readonly string[]): { team: string; n: number }[] {
  const map = new Map<string, number>();
  for (const raw of teams) {
    const team = raw.trim().toUpperCase();
    if (!team) continue;
    map.set(team, (map.get(team) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([team, n]) => ({ team, n }))
    .sort((a, b) => b.n - a.n || a.team.localeCompare(b.team));
}

export function fanLine(counts: readonly { team: string; n: number }[]): string {
  const top = counts.slice(0, 5);
  if (!top.length) return "0";
  return top.map((row) => `${row.team} ${row.n}`).join(", ");
}
