/** Played Daily scores from this ET day. Skipped days are absent, not zero. */
export const TREND_FROM = "2026-10-01";

function playedScores(
  rows: readonly { day: string; score: number }[],
  from = TREND_FROM,
): number[] {
  const scores = new Map<string, number>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    scores.set(day, score);
  }
  return [...scores.keys()]
    .sort()
    .slice(-3)
    .map((day) => scores.get(day)!);
}

export function trendingHit(rows: readonly { day: string; score: number }[], from = TREND_FROM): boolean {
  const last = playedScores(rows, from);
  return last.length === 3 && last[0]! < last[1]! && last[1]! < last[2]!;
}

export function canceledHit(rows: readonly { day: string; score: number }[], from = TREND_FROM): boolean {
  const last = playedScores(rows, from);
  return last.length === 3 && last[0]! > last[1]! && last[1]! > last[2]!;
}
