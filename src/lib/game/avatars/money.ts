import { TREND_FROM } from "./trend";

export const EASY_DOLLAR_NEED = 5;
export const EASY_DOLLAR_LINE = 100;

function playedTotals(rows: readonly { day: string; score: number }[], from: string): number[] {
  const scores = new Map<string, number>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    scores.set(day, score);
  }
  return [...scores.keys()].sort().map((day) => scores.get(day)!);
}

/** Last 5 played Daily totals, each at least 100. A lower score breaks that run. */
export function easyDollarHit(
  rows: readonly { day: string; score: number }[],
  from = TREND_FROM,
): boolean {
  const last = playedTotals(rows, from).slice(-EASY_DOLLAR_NEED);
  return last.length === EASY_DOLLAR_NEED && last.every((score) => score >= EASY_DOLLAR_LINE);
}

function lineScores(picks: readonly { cost?: number; score?: number }[] | null | undefined): { cost: number; score: number }[] {
  if (!picks?.length) return [];
  const out: { cost: number; score: number }[] = [];
  for (const pick of picks) {
    const cost = Number(pick.cost);
    const score = Number(pick.score);
    if (!Number.isFinite(cost) || !Number.isFinite(score)) continue;
    out.push({ cost, score });
  }
  return out;
}

/** A $1 pick ties or owns the high player score on this lineup. */
export function heroHit(picks: readonly { cost?: number; score?: number }[] | null | undefined): boolean {
  const rows = lineScores(picks);
  if (!rows.length) return false;
  const high = Math.max(...rows.map((row) => row.score));
  return rows.some((row) => row.cost === 1 && row.score === high);
}

/** A $10 pick ties or owns the low player score on this lineup. */
export function robbedHit(picks: readonly { cost?: number; score?: number }[] | null | undefined): boolean {
  const rows = lineScores(picks);
  if (!rows.length) return false;
  const low = Math.min(...rows.map((row) => row.score));
  return rows.some((row) => row.cost === 10 && row.score === low);
}
