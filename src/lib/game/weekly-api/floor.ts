/** Weekly floor helpers. Move-only from weekly-api.server. */
import { clampAvatar } from "../avatars";
import { clipDisplayName, isAwardSkippedName, isHiddenBoardId, isHiddenBoardName } from "../stats-shared";
import { clipWeeklyPickIds } from "../weekly";
import type { WeeklyBoardRow } from "../weekly-api-types";
import { weekWindow } from "../weekly-sleeper";
import type { Sql } from "./shared";

function realWeeklyLock(picks: unknown): boolean {
  if (picks == null) return false;
  let raw: unknown = picks;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text || text === "null" || text === "[]" || text === "{}") return false;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return true;
    }
  }
  if (clipWeeklyPickIds(raw).length > 0) return true;
  if (Array.isArray(raw)) return raw.length > 0;
  return Boolean(raw && typeof raw === "object" && Object.keys(raw as object).length > 0);
}

export function skipWeeklyFloorName(name?: string | null, userId?: string | null): boolean {
  return isHiddenBoardName(name) || isAwardSkippedName(name) || isHiddenBoardId(userId);
}

export type SeasonDoneRun = {
  user_id: string;
  week: number;
  score: number | string | null;
  picks: unknown;
  name: string | null;
  avatar_id: string | null;
  daily_stars: number | string | null;
};

export async function loadSeasonDoneRuns(sql: Sql, season: number): Promise<SeasonDoneRun[]> {
  return sql.query<SeasonDoneRun>(
    `select r.user_id,
            r.week,
            r.score,
            r.picks,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
            p.avatar_id,
            p.daily_stars
       from darkness_weekly_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.season = $1 and r.status = 'done'`,
    [season],
  );
}

export function usableFloorPts(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export async function weekFinishedOwn(
  awarded: boolean,
  season: number,
  weekNo: number,
  clock: { season: number; week: number },
  known?: { open: boolean; live: boolean; done: boolean } | null,
): Promise<boolean> {
  if (awarded) return true;
  if (season === clock.season && weekNo < clock.week) return true;
  if (known) return Boolean(known.done);
  const window = await weekWindow(season, weekNo);
  return Boolean(window.done);
}

export function floorEligibleRun(row: SeasonDoneRun): boolean {
  const name = clipDisplayName(row.name ?? "") || "GM";
  if (skipWeeklyFloorName(name, row.user_id) || skipWeeklyFloorName(row.name, row.user_id)) return false;
  return realWeeklyLock(row.picks);
}

export function weekFloorMin(shown: { hasPicks?: boolean; floor?: boolean; score: number }[]): number | null {
  const vals: number[] = [];
  for (const row of shown) {
    if (row.floor || row.hasPicks === false) continue;
    const pts = usableFloorPts(row.score);
    if (pts != null) vals.push(pts);
  }
  if (!vals.length) return null;
  return Math.min(...vals);
}

export function weekBoardIds(runs: SeasonDoneRun[], weekNo: number): Set<string> {
  return new Set(runs.filter((row) => row.week === weekNo).map((row) => row.user_id));
}

export function floorFace(row: SeasonDoneRun): WeeklyBoardRow {
  return {
    id: row.user_id,
    name: clipDisplayName(row.name ?? "") || "GM",
    avatarId: clampAvatar(row.avatar_id ?? "poor"),
    score: 0,
    paid: false,
    winner: false,
    stars: Math.max(0, Math.floor(Number(row.daily_stars) || 0)),
    hasPicks: false,
    floor: true,
  };
}
