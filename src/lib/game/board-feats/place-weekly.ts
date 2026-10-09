import {
  hitHeavyHitterScore,
  skipHeavyHitterWeek,
  HEAVY_HITTER_ID,
  FLASH_ID,
  IRON_BOOT_ID,
  OVERHEAD_ID,
  MIRROR_ID,
  TWIN_ID,
  IRON_BOOT_POINTS,
  featWeekFromW3,
  hitFlashTotal,
  OVERHEAD_FROM,
  MIRROR_FROM,
  TWIN_FROM,
  HOSPITAL_ID,
  HOSPITAL_FROM_SEASON,
  HOSPITAL_FROM_WEEK,
  HOSPITAL_NEED,
  GROUP_WIN_ID,
  GROUP_WIN_FROM_SEASON,
  GROUP_WIN_FROM_WEEK,
  lineupSignature,
  overheadPassed,
  mirrorUserIds,
  twinUserIds,
} from "../avatars";
import { clipGm, isHiddenBoardId } from "../stats-shared";
import { dailyDayStamp } from "../daily";
import { teamBye } from "../elim-byes";
import type { TeamId } from "../types";
import { grantFeat, skipBoardRow, type Sql } from "./grant";
import { weeklyInjuredSids, weeklyWinningTeams } from "../weekly-sleeper";

export function asTime(value: unknown): number {
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
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

type BootPick = { slot?: string; sid?: string; team?: string; vs?: string };

function bootCell(
  pick: BootPick | undefined,
  season: number,
  week: number,
  live: Record<string, number>,
): number | null {
  if (!pick) return null;
  if (String(pick.vs ?? "").trim().toUpperCase() === "BYE") return null;
  const team = String(pick.team ?? "").trim().toUpperCase();
  if (team && teamBye(season, team as TeamId) === week) return null;
  const sid = String(pick.sid ?? "").trim();
  if (!sid || !Object.prototype.hasOwnProperty.call(live, sid)) return null;
  const score = Number(live[sid]);
  return Number.isFinite(score) ? score : null;
}

export async function maybeGrantIronBoot(
  sql: Sql,
  userId: string,
  season: number,
  week: number,
  picks: BootPick[],
  live: Record<string, number>,
): Promise<void> {
  try {
    if (!featWeekFromW3(season, week)) return;
    const defense = bootCell(
      picks.find((row) => row.slot === "D"),
      season,
      week,
      live,
    );
    const kicker = bootCell(
      picks.find((row) => row.slot === "K"),
      season,
      week,
      live,
    );
    if (defense == null || kicker == null) return;
    if (Math.round((defense + kicker) * 10) / 10 < IRON_BOOT_POINTS) return;
    await grantFeat(sql, userId, IRON_BOOT_ID);
  } catch (err) {
    console.error("[darkness] iron boot grant failed", err);
  }
}

/** First live pass at 100.0 locks the week on one player. Later crossings do not grant. */
export async function maybeGrantFlashWeek(
  sql: Sql,
  season: number,
  week: number,
  rows: { userId: string; score: number }[],
): Promise<void> {
  try {
    if (!featWeekFromW3(season, week)) return;
    await sql.query(`
      create table if not exists darkness_weekly_flags (
        key text primary key,
        created_at timestamptz not null default now()
      )`);
    const key = `flash-week:${season}-W${week}`;
    const already = await sql.query<{ key: string }>(`select key from darkness_weekly_flags where key = $1`, [key]);
    if (already[0]) return;
    const hit = rows.filter((row) => row.userId && !isHiddenBoardId(row.userId) && hitFlashTotal(row.score));
    if (!hit.length) return;
    hit.sort((a, b) => b.score - a.score || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
    const winner = hit[0];
    if (!winner) return;
    const inserted = await sql.query<{ key: string }>(
      `insert into darkness_weekly_flags (key) values ($1) on conflict (key) do nothing returning key`,
      [key],
    );
    if (!inserted[0]) return;
    await grantFeat(sql, winner.userId, FLASH_ID);
  } catch (err) {
    console.error("[darkness] flash grant failed", err);
  }
}

export type DailyContestRow = {
  user_id: string;
  name: string | null;
  score: number | string | null;
  picks: unknown;
  finished_at: unknown;
  started_at: unknown;
};

export function visibleContest(rows: DailyContestRow[]): DailyContestRow[] {
  return rows.filter(
    (row) => !skipBoardRow(row.user_id, row.name) && !skipBoardRow(row.user_id, clipGm(row.name ?? "")),
  );
}

export function asPicks(raw: unknown): { slot?: string; id?: string }[] {
  return Array.isArray(raw) ? (raw as { slot?: string; id?: string }[]) : [];
}

/** Overhead + Mirror for one Daily day. Hidden rows are not in the set. */
export async function maybeGrantDailyContestFeats(sql: Sql, day: string): Promise<void> {
  try {
    if (!day || (day < OVERHEAD_FROM && day < MIRROR_FROM)) return;
    const rows = await sql.query<DailyContestRow>(
      `select r.user_id, r.score, r.picks, r.finished_at, r.started_at,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day = $1::date and r.status = 'done' and r.score is not null`,
      [day],
    );
    const visible = visibleContest(rows);
    if (day >= OVERHEAD_FROM) {
      const scored = visible.map((row) => ({
        userId: row.user_id,
        score: Number(row.score),
        at: asTime(row.finished_at) || asTime(row.started_at),
      }));
      for (const row of scored) {
        if (overheadPassed(scored, row.userId)) await grantFeat(sql, row.userId, OVERHEAD_ID);
      }
    }
    if (day >= MIRROR_FROM) {
      const signed = visible.map((row) => ({
        userId: row.user_id,
        signature: lineupSignature(asPicks(row.picks)),
      }));
      for (const userId of mirrorUserIds(signed)) await grantFeat(sql, userId, MIRROR_ID);
    }
  } catch (err) {
    console.error("[darkness] daily contest feats failed", err);
  }
}

/** Mirror for one Weekly week. Locks from earlier in that week still count. Weeks before 2026-W3 do not. */
export async function maybeGrantMirrorWeek(sql: Sql, season: number, week: number): Promise<void> {
  try {
    if (dailyDayStamp() < MIRROR_FROM || !featWeekFromW3(season, week)) return;
    const rows = await sql.query<{ user_id: string; name: string | null; picks: unknown }>(
      `select r.user_id, r.picks,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
         from darkness_weekly_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.season = $1 and r.week = $2 and r.status = 'done'`,
      [season, week],
    );
    const signed = rows
      .filter((row) => !skipBoardRow(row.user_id, row.name) && !skipBoardRow(row.user_id, clipGm(row.name ?? "")))
      .map((row) => ({ userId: row.user_id, signature: lineupSignature(asPicks(row.picks)) }));
    for (const userId of mirrorUserIds(signed)) await grantFeat(sql, userId, MIRROR_ID);
  } catch (err) {
    console.error("[darkness] mirror grant failed", err);
  }
}

/** Twin for a finished Weekly week. Live and waiting-kickoff weeks do not grant. Weeks before 2026-W3 do not. */
export async function maybeGrantTwinWeek(sql: Sql, season: number, week: number, finished: boolean): Promise<void> {
  try {
    if (!finished || dailyDayStamp() < TWIN_FROM || !featWeekFromW3(season, week)) return;
    const rows = await sql.query<{ user_id: string; name: string | null; score: number | string | null; picks: unknown }>(
      `select r.user_id, r.score, r.picks,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
         from darkness_weekly_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.season = $1 and r.week = $2 and r.status = 'done' and r.score is not null`,
      [season, week],
    );
    const signed = rows
      .filter((row) => !skipBoardRow(row.user_id, row.name) && !skipBoardRow(row.user_id, clipGm(row.name ?? "")))
      .map((row) => ({
        userId: row.user_id,
        score: Number(row.score),
        signature: lineupSignature(asPicks(row.picks)),
      }));
    for (const userId of twinUserIds(signed)) await grantFeat(sql, userId, TWIN_ID);
  } catch (err) {
    console.error("[darkness] twin grant failed", err);
  }
}

/** Two or more locked Weekly picks injured at close. From 2026 week 4. The board is not counted. */
export async function maybeGrantHospital(
  sql: Sql,
  season: number,
  week: number,
  runs: readonly { userId: string; picks: readonly { sid?: string }[] }[],
): Promise<void> {
  try {
    if (season < HOSPITAL_FROM_SEASON || (season === HOSPITAL_FROM_SEASON && week < HOSPITAL_FROM_WEEK)) return;
    const injured = await weeklyInjuredSids(season, week);
    for (const run of runs) {
      const seen = new Set<string>();
      let n = 0;
      for (const pick of run.picks) {
        const sid = String(pick.sid || "");
        if (!sid || seen.has(sid) || !injured.has(sid)) continue;
        seen.add(sid);
        n += 1;
      }
      if (n >= HOSPITAL_NEED) await grantFeat(sql, run.userId, HOSPITAL_ID);
    }
  } catch (err) {
    console.error("[darkness] hospital grant failed", err);
  }
}

/** Every locked pick's NFL team won. From 2026 week 5. A tie, a bye, or a missing result does not count. */
export async function maybeGrantGroupWin(
  sql: Sql,
  season: number,
  week: number,
  runs: readonly { userId: string; picks: readonly { team?: string }[] }[],
): Promise<void> {
  try {
    if (season < GROUP_WIN_FROM_SEASON || (season === GROUP_WIN_FROM_SEASON && week < GROUP_WIN_FROM_WEEK)) return;
    const winners = await weeklyWinningTeams(season, week);
    for (const run of runs) {
      if (run.picks.length === 0) continue;
      const won = run.picks.every((pick) => {
        const team = String(pick.team || "").trim().toUpperCase();
        return Boolean(team) && winners.has(team);
      });
      if (won) await grantFeat(sql, run.userId, GROUP_WIN_ID);
    }
  } catch (err) {
    console.error("[darkness] group win grant failed", err);
  }
}
