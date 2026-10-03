import { clipDisplayName, isHiddenBoardId, isHiddenBoardName } from "../stats-shared";
import { hydrateWeeklyPicks, weeklyTotal } from "../weekly";
import { weekWindow } from "../weekly-sleeper";
import {
  floorEligibleRun,
  skipWeeklyFloorName,
  usableFloorPts,
  weekBoardIds,
  weekFloorMin,
  type SeasonDoneRun,
} from "./floor";

export type SeasonMove = "up" | "down" | "same";

/** Last finished week vs the week before, until the next week's weekWindow lock. */
export async function activeSeasonMove(
  season: number,
  clock: { season: number; week: number },
  current: { done: boolean; lockAt: number },
  awarded: readonly number[],
  now = Date.now(),
): Promise<{ from: number; to: number } | null> {
  if (season !== clock.season) return null;
  let finished = 0;
  for (const week of awarded) if (week > finished) finished = week;
  finished = current.done ? Math.max(finished, clock.week) : Math.max(finished, clock.week - 1);
  if (finished < 2) return null;
  const next = finished + 1;
  const lockAt = next === clock.week ? current.lockAt : (await weekWindow(season, next)).lockAt;
  if (lockAt && now >= lockAt) return null;
  return { from: finished - 1, to: finished };
}

function visible(id: string, name: string | null): string | null {
  const clean = clipDisplayName(name ?? "") || "GM";
  if (isHiddenBoardId(id) || isHiddenBoardName(clean) || isHiddenBoardName(name)) return null;
  return clean;
}

function floorForWeek(runs: readonly SeasonDoneRun[], week: number): number | null {
  const shown: { hasPicks: boolean; score: number }[] = [];
  for (const row of runs) {
    if (row.week !== week) continue;
    const name = clipDisplayName(row.name ?? "") || "GM";
    if (skipWeeklyFloorName(name, row.user_id) || skipWeeklyFloorName(row.name, row.user_id)) continue;
    const stored = usableFloorPts(row.score);
    const computed = stored ?? usableFloorPts(weeklyTotal(hydrateWeeklyPicks(row.picks, {}, "stored")));
    if (computed == null) continue;
    shown.push({ hasPicks: true, score: computed });
  }
  return weekFloorMin(shown);
}

function ranksThrough(runs: readonly SeasonDoneRun[], floors: { week: number; score: number }[], through: number): Map<string, number> {
  const totals = new Map<string, { name: string; score: number }>();
  const add = (id: string, name: string | null, pts: number) => {
    const clean = visible(id, name);
    if (!clean || !Number.isFinite(pts)) return;
    const prev = totals.get(id);
    if (prev) prev.score = Math.round((prev.score + pts) * 10) / 10;
    else totals.set(id, { name: clean, score: Math.round(pts * 10) / 10 });
  };
  for (const row of runs) {
    if (row.week > through || row.score == null) continue;
    add(row.user_id, row.name, Number(row.score));
  }
  const eligible = new Map<string, SeasonDoneRun>();
  for (const row of runs) {
    if (!floorEligibleRun(row) || eligible.has(row.user_id)) continue;
    eligible.set(row.user_id, row);
  }
  for (const floor of floors) {
    if (floor.week > through) continue;
    const onBoard = weekBoardIds(runs, floor.week);
    for (const face of eligible.values()) {
      if (onBoard.has(face.user_id)) continue;
      add(face.user_id, face.name, floor.score);
    }
  }
  const ordered = [...totals.entries()].sort((a, b) => b[1].score - a[1].score || a[1].name.localeCompare(b[1].name));
  return new Map(ordered.map(([id], index) => [id, index + 1]));
}

/** Spots moved in Season rank. Missing prior rank is left out. */
export function seasonRankMoves(
  runs: readonly SeasonDoneRun[],
  weeks: readonly { week: number }[],
  through: number,
  from: number,
  to: number,
): Map<string, { move: SeasonMove; spots: number }> {
  const floors: { week: number; score: number }[] = [];
  for (const week of weeks) {
    if (week.week > through) continue;
    const score = floorForWeek(runs, week.week);
    if (score == null) continue;
    floors.push({ week: week.week, score });
  }
  const before = ranksThrough(runs, floors, from);
  const after = ranksThrough(runs, floors, to);
  const out = new Map<string, { move: SeasonMove; spots: number }>();
  for (const [id, rank] of after) {
    const prev = before.get(id);
    if (prev == null) continue;
    if (prev === rank) out.set(id, { move: "same", spots: 0 });
    else if (rank < prev) out.set(id, { move: "up", spots: prev - rank });
    else out.set(id, { move: "down", spots: rank - prev });
  }
  return out;
}
