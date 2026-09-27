import {
  THREE_LEAF_NEED,
  BANANA_SCORE_UNDER,
  SNIPER_MARGIN,
  FEAT_TRACK_FROM,
  LOST_GAP_DAYS,
  HEAVY_HITTER_PPR,
  LUMPED_UP_UNDER,
  LUMPED_UP_DAYS,
  DOUBLE_DONUT_NEED,
  THRIFTY_CAP,
  FLASH_FROM_SEASON,
  FLASH_FROM_WEEK,
  OVERHEAD_SCORE,
  COLD_STREAK_FROM,
  THREE_HEADED_NEED,
  TRIPLE_DONUT_NEED,
  BLUE_STREAK_NEED,
  COLD_STREAK_NEED,
} from "../avatars";

/** Daily Match score (not weekly, not private). Under 60 unlocks Trash Can. */
export function hitBananaScore(score: number): boolean {
  return Number.isFinite(score) && score < BANANA_SCORE_UNDER;
}

/** Distinct scratch prize keys. Two of the same result still count as one. */
export function threeLeafHit(prizes: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const prize of prizes) {
    const key = String(prize ?? "").trim();
    if (key) seen.add(key);
  }
  return seen.size >= THREE_LEAF_NEED;
}

export function hitBullseyeScore(score: number): boolean {
  return Number.isFinite(score) && Math.round(score * 10) / 10 === 100;
}

export function hitHeavyHitterScore(score: number): boolean {
  return Number.isFinite(score) && score >= HEAVY_HITTER_PPR;
}

export function skipHeavyHitterWeek(season: number, week: number): boolean {
  return season === 2026 && week === 1;
}

/** 2026 week 3 and later. Week 1 and week 2 never qualify. */
export function featWeekFromW3(season: number, week: number): boolean {
  return season > FLASH_FROM_SEASON || (season === FLASH_FROM_SEASON && week >= FLASH_FROM_WEEK);
}

/** Lineup total at one decimal. Floor times roster size is not a score. */
export function hitFlashTotal(score: number): boolean {
  return Number.isFinite(score) && Math.round(score * 10) / 10 >= 100;
}

export function thriftyHit(costs: readonly number[]): boolean {
  if (costs.length !== 8) return false;
  let sum = 0;
  for (const cost of costs) {
    if (!Number.isFinite(cost)) return false;
    sum += cost;
  }
  return sum <= THRIFTY_CAP;
}

const LINEUP_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "K", "D"] as const;

/** Eight slot prices. A missing or duplicate slot does not count. */
export function thriftySlotCosts(
  picks: readonly { slot?: string; cost?: number }[] | null | undefined,
): number[] | null {
  if (!picks) return null;
  const by = new Map<string, number>();
  for (const pick of picks) {
    const slot = String(pick?.slot ?? "").trim();
    const cost = Number(pick?.cost);
    if (!slot || by.has(slot) || !Number.isFinite(cost)) continue;
    by.set(slot, cost);
  }
  if (LINEUP_SLOTS.some((slot) => !by.has(slot))) return null;
  return LINEUP_SLOTS.map((slot) => by.get(slot)!);
}

/** Same player id in each of the 8 slots. Array order does not matter. */
export function lineupSignature(picks: readonly { slot?: string; id?: string }[] | null | undefined): string | null {
  if (!picks) return null;
  const by = new Map<string, string>();
  for (const row of picks) {
    const slot = String(row?.slot ?? "").trim();
    const id = String(row?.id ?? "").trim();
    if (!slot || !id || by.has(slot)) continue;
    by.set(slot, id);
  }
  if (LINEUP_SLOTS.some((slot) => !by.get(slot))) return null;
  return LINEUP_SLOTS.map((slot) => `${slot}=${by.get(slot)}`).join("|");
}

export function overheadTenths(score: number): number {
  return Math.round(Number(score) * 10) / 10;
}

export type OverheadRow = { userId: string; score: number; at: number };

/** 150.0+ and a later visible score strictly higher. A higher score already locked blocks it. Ties do not pass. */
export function overheadPassed(rows: readonly OverheadRow[], userId: string): boolean {
  const me = rows.find((row) => row.userId === userId);
  if (!me || !(me.at > 0)) return false;
  const mine = overheadTenths(me.score);
  if (!(mine >= OVERHEAD_SCORE)) return false;
  const alreadyPassed = rows.some(
    (row) => row.userId !== userId && row.at > 0 && row.at <= me.at && overheadTenths(row.score) > mine,
  );
  if (alreadyPassed) return false;
  return rows.some((row) => row.userId !== userId && row.at > me.at && overheadTenths(row.score) > mine);
}

export function mirrorUserIds(rows: readonly { userId: string; signature: string | null }[]): string[] {
  const buckets = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.signature) continue;
    const list = buckets.get(row.signature) ?? [];
    if (!list.includes(row.userId)) list.push(row.userId);
    buckets.set(row.signature, list);
  }
  const ids: string[] = [];
  for (const list of buckets.values()) {
    if (list.length >= 2) ids.push(...list);
  }
  return ids;
}

export type TwinRow = { userId: string; score: number; signature: string | null };

/** Same one-decimal score, at least two different full lineups. Identical lineups are Mirror, not Twin. */
export function twinUserIds(rows: readonly TwinRow[]): string[] {
  const buckets = new Map<number, TwinRow[]>();
  for (const row of rows) {
    if (!row.signature || !Number.isFinite(row.score)) continue;
    const key = Math.round(row.score * 10) / 10;
    const list = buckets.get(key) ?? [];
    if (!list.some((item) => item.userId === row.userId)) list.push(row);
    buckets.set(key, list);
  }
  const ids: string[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const sigs = new Set(list.map((row) => row.signature));
    if (sigs.size < 2) continue;
    for (const row of list) ids.push(row.userId);
  }
  return ids;
}

export function stampDayGap(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to <= from) return 0;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function lostGapHit(prev: string, cur: string, from = FEAT_TRACK_FROM): boolean {
  return prev >= from && stampDayGap(prev, cur) >= LOST_GAP_DAYS;
}

export function isExactZeroScore(score: number): boolean {
  return Number.isFinite(score) && Math.round(score * 10) / 10 === 0;
}

export function isNegativeScore(score: number): boolean {
  return Number.isFinite(score) && Math.round(score * 10) / 10 < 0;
}

export function doubleDonutHit(zeroCount: number): boolean {
  return zeroCount >= DOUBLE_DONUT_NEED;
}

export function tripleDonutHit(zeroCount: number): boolean {
  return zeroCount >= TRIPLE_DONUT_NEED;
}

/** Three picks share one NFL team. Blank teams do not count. */
export function threeHeadedHit(teams: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const raw of teams) {
    const team = String(raw).trim().toUpperCase();
    if (!team || team === "BYE") continue;
    const n = (counts.get(team) ?? 0) + 1;
    if (n >= THREE_HEADED_NEED) return true;
    counts.set(team, n);
  }
  return false;
}

/** Eight Daily slot prices. A missing slot or bad cost does not count. */
export function pennyHit(picks: readonly { slot?: string; cost?: number }[] | null | undefined): boolean {
  const costs = thriftySlotCosts(picks);
  if (!costs) return false;
  let sum = 0;
  for (const cost of costs) sum += cost;
  return sum <= 10;
}

export function blueStreakHit(bestCount: number): boolean {
  return bestCount >= BLUE_STREAK_NEED;
}

/** Done Daily runs since `from`. A win resets to 0. A missed day does not. */
export function coldStreakHit(
  rows: readonly { day: string; won: boolean }[],
  from = COLD_STREAK_FROM,
): boolean {
  const won = new Map<string, boolean>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from) continue;
    won.set(day, Boolean(won.get(day)) || Boolean(row.won));
  }
  let run = 0;
  for (const day of [...won.keys()].sort()) {
    if (won.get(day)) {
      run = 0;
      continue;
    }
    run += 1;
    if (run >= COLD_STREAK_NEED) return true;
  }
  return false;
}

function nextStamp(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** Any three calendar days in a row, each a submitted score under 100, on or after `from`. A missing day breaks the run. */
export function lumpedUpHit(
  rows: readonly { day: string; score: number }[],
  from = FEAT_TRACK_FROM,
): boolean {
  const scores = new Map<string, number>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    scores.set(day, score);
  }
  const days = [...scores.keys()].sort();
  if (!days.length) return false;
  let day = days[0]!;
  const last = days[days.length - 1]!;
  let run = 0;
  for (let i = 0; i < 400 && day <= last; i += 1) {
    const score = scores.get(day);
    if (score == null || score >= LUMPED_UP_UNDER) run = 0;
    else run += 1;
    if (run >= LUMPED_UP_DAYS) return true;
    const next = nextStamp(day);
    if (next <= day) break;
    day = next;
  }
  return false;
}

export function weeklyRealZeroCount(
  picks: readonly { id?: string; sid?: string; name?: string; team?: string; vs?: string }[],
  live: Readonly<Record<string, number>>,
  finalTeams?: ReadonlySet<string>,
): number {
  let n = 0;
  const seen = new Set<string>();
  for (const pick of picks) {
    const id = String(pick.id ?? "").trim();
    const sid = String(pick.sid ?? "").trim();
    const name = String(pick.name ?? "").trim();
    const team = String(pick.team ?? "").trim().toUpperCase();
    const vs = String(pick.vs ?? "").trim().toUpperCase();
    if (!id || !sid || !name || seen.has(id)) continue;
    if (!vs || vs === "BYE") continue;
    if (finalTeams && (!team || !finalTeams.has(team))) continue;
    if (!Object.prototype.hasOwnProperty.call(live, sid)) continue;
    if (!isExactZeroScore(Number(live[sid]))) continue;
    seen.add(id);
    n += 1;
  }
  return n;
}

export function freeFallHit(prevFirst: readonly string[], todayLast: readonly string[], userId: string): boolean {
  return prevFirst.includes(userId) && todayLast.includes(userId);
}

export function comebackKidHit(prevLast: readonly string[], todayFirst: readonly string[], userId: string): boolean {
  return prevLast.includes(userId) && todayFirst.includes(userId);
}

export type EarlyBirdRow = { day: string; userId: string; at: number };

/** Distinct days this user was first visible lock that day. Sep 16 and earlier skipped. */
export function earlyBirdDayCount(userId: string, rows: readonly EarlyBirdRow[], from = FEAT_TRACK_FROM): number {
  const byDay = new Map<string, { userId: string; at: number }[]>();
  for (const row of rows) {
    if (!row.day || row.day < from || !row.userId || !Number.isFinite(row.at)) continue;
    const list = byDay.get(row.day) ?? [];
    list.push({ userId: row.userId, at: row.at });
    byDay.set(row.day, list);
  }
  let n = 0;
  for (const list of byDay.values()) {
    const min = Math.min(...list.map((row) => row.at));
    if (list.some((row) => row.at === min && row.userId === userId)) n += 1;
  }
  return n;
}

/** Distinct days this user still holds last visible lock that day. Sep 16 and earlier skipped. Last can move until midnight ET. */
export function nightOwlDayCount(userId: string, rows: readonly EarlyBirdRow[], from = FEAT_TRACK_FROM): number {
  const byDay = new Map<string, { userId: string; at: number }[]>();
  for (const row of rows) {
    if (!row.day || row.day < from || !row.userId || !Number.isFinite(row.at)) continue;
    const list = byDay.get(row.day) ?? [];
    list.push({ userId: row.userId, at: row.at });
    byDay.set(row.day, list);
  }
  let n = 0;
  for (const list of byDay.values()) {
    const max = Math.max(...list.map((row) => row.at));
    if (list.some((row) => row.at === max && row.userId === userId)) n += 1;
  }
  return n;
}

/** Longest run of consecutive YYYY-MM-DD calendar days. */
export function longestDayStreak(days: readonly string[]): number {
  const uniq = [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
  if (uniq.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    const prev = Date.parse(`${uniq[i - 1]}T00:00:00Z`);
    const next = Date.parse(`${uniq[i]}T00:00:00Z`);
    cur = next - prev === 86_400_000 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

/** Unique 1st, margin over 2nd is (0, 1). Ties for 1st do not count. */
export function sniperWeekHit(rows: readonly { userId: string; score: number }[], userId: string): boolean {
  if (rows.length < 2) return false;
  let first = -Infinity;
  for (const row of rows) if (row.score > first) first = row.score;
  const leaders = rows.filter((row) => row.score === first);
  if (leaders.length !== 1 || leaders[0]?.userId !== userId) return false;
  let second = -Infinity;
  for (const row of rows) {
    if (row.score < first && row.score > second) second = row.score;
  }
  if (!Number.isFinite(second) || second === -Infinity) return false;
  const margin = first - second;
  return margin > 0 && margin < SNIPER_MARGIN;
}

/** Distinct days the user placed 2nd (second-highest score that day). */
export function silverSecondDayCount(rows: readonly { day: string; userId: string; score: number }[], userId: string): number {
  const byDay = new Map<string, { userId: string; score: number }[]>();
  for (const row of rows) {
    const day = row.day.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  let n = 0;
  for (const list of byDay.values()) {
    let first = -Infinity;
    for (const row of list) if (row.score > first) first = row.score;
    let second = -Infinity;
    for (const row of list) {
      if (row.score < first && row.score > second) second = row.score;
    }
    if (!Number.isFinite(second) || second === -Infinity) continue;
    if (list.some((row) => row.userId === userId && row.score === second)) n += 1;
  }
  return n;
}
