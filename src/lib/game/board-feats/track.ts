import {
  ALMOST_ID,
  BAD_BEAT_ID,
  BAD_BEAT_MARGIN,
  CALLED_IT_ID,
  COLD_STREAK_FROM,
  CONFLICT_OF_INTEREST_ID,
  JACKPOT_DAYS,
  JACKPOT_ID,
  NUMBER_ONE_FAN_ID,
  NUMBER_ONE_FAN_NEED,
  RIDE_OR_DIE_ID,
  SCORE_1234_ID,
  SUNDIAL_ID,
  SUNDIAL_NEED,
  TRIPLEPOINT_ID,
  TRIPLEPOINT_NEED,
} from "../avatars";
import { etYmd, hitAlmost, hitScore1234, jackpotDays, rideOrDieHit, sundialHours, teamCounts } from "../feat-progress";
import { grantFeat, skipWho, type Sql } from "./grant";
import { asTime } from "./place-weekly";

function pickTeams(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((pick) => {
    if (!pick || typeof pick !== "object") return [];
    const team = String((pick as { team?: string }).team ?? "").trim().toUpperCase();
    return team ? [team] : [];
  });
}

function asScore(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function sundialLockTimes(sql: Sql, userId: string): Promise<number[]> {
  const rows = await sql.query<{ finished_at: unknown }>(
    `select finished_at
       from darkness_daily_runs
      where user_id = $1
        and status = 'done'
        and day >= $2::date
        and finished_at is not null`,
    [userId, COLD_STREAK_FROM],
  );
  return rows.map((row) => asTime(row.finished_at));
}

export async function fanTeams(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql.query<{ picks: unknown; finished_at: unknown }>(
    `select picks, finished_at
       from darkness_weekly_runs
      where user_id = $1
        and status = 'done'
        and picks is not null
        and finished_at is not null`,
    [userId],
  );
  const teams: string[] = [];
  for (const row of rows) {
    if (etYmd(asTime(row.finished_at)) < COLD_STREAK_FROM) continue;
    teams.push(...pickTeams(row.picks));
  }
  return teams;
}

export async function score1234Scores(sql: Sql, userId: string): Promise<number[]> {
  const daily = await sql.query<{ score: number | string | null }>(
    `select score
       from darkness_daily_runs
      where user_id = $1
        and status = 'done'
        and day >= $2::date
        and score is not null`,
    [userId, COLD_STREAK_FROM],
  );
  const weekly = await sql.query<{ score: number | string | null; finished_at: unknown }>(
    `select score, finished_at
       from darkness_weekly_runs
      where user_id = $1
        and status = 'done'
        and picks is not null
        and score is not null
        and finished_at is not null`,
    [userId],
  );
  const scores = daily.flatMap((row) => {
    const score = asScore(row.score);
    return score == null ? [] : [score];
  });
  for (const row of weekly) {
    if (etYmd(asTime(row.finished_at)) < COLD_STREAK_FROM) continue;
    const score = asScore(row.score);
    if (score != null) scores.push(score);
  }
  return scores;
}

export async function maybeGrantSundial(sql: Sql, userId: string): Promise<void> {
  try {
    const hours = sundialHours(await sundialLockTimes(sql, userId));
    if (hours.length >= SUNDIAL_NEED) await grantFeat(sql, userId, SUNDIAL_ID);
  } catch (err) {
    console.error("[darkness] sundial grant failed", err);
  }
}

export async function maybeGrantNumberOneFan(sql: Sql, userId: string): Promise<void> {
  try {
    const hit = teamCounts(await fanTeams(sql, userId)).some((row) => row.n >= NUMBER_ONE_FAN_NEED);
    if (hit) await grantFeat(sql, userId, NUMBER_ONE_FAN_ID);
  } catch (err) {
    console.error("[darkness] number one fan grant failed", err);
  }
}

export async function dailyScoreRows(sql: Sql, userId: string): Promise<{ day: string; score: number }[]> {
  const rows = await sql.query<{ day: string; score: number | string | null }>(
    `select day::text as day, score
       from darkness_daily_runs
      where user_id = $1
        and status = 'done'
        and day >= $2::date
        and score is not null`,
    [userId, COLD_STREAK_FROM],
  );
  return rows.flatMap((row) => {
    const score = asScore(row.score);
    if (score == null) return [];
    return [{ day: String(row.day).slice(0, 10), score }];
  });
}

export async function maybeGrantAlmost(sql: Sql, userId: string): Promise<void> {
  try {
    const rows = await dailyScoreRows(sql, userId);
    if (rows.some((row) => hitAlmost(row.score))) await grantFeat(sql, userId, ALMOST_ID);
  } catch (err) {
    console.error("[darkness] almost grant failed", err);
  }
}

export async function maybeGrantJackpot(sql: Sql, userId: string): Promise<void> {
  try {
    const hit = [...jackpotDays(await dailyScoreRows(sql, userId)).values()].some((n) => n >= JACKPOT_DAYS);
    if (hit) await grantFeat(sql, userId, JACKPOT_ID);
  } catch (err) {
    console.error("[darkness] jackpot grant failed", err);
  }
}

export async function rideOrDieIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql.query<{ picks: unknown }>(
    `select picks
       from darkness_daily_runs
      where user_id = $1
        and status = 'done'
        and day >= $2::date
        and picks is not null`,
    [userId, COLD_STREAK_FROM],
  );
  const ids: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.picks)) continue;
    for (const pick of row.picks) {
      if (!pick || typeof pick !== "object") continue;
      const id = String((pick as { id?: string }).id ?? "").trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

export async function maybeGrantRideOrDie(sql: Sql, userId: string): Promise<void> {
  try {
    if (rideOrDieHit(await rideOrDieIds(sql, userId))) await grantFeat(sql, userId, RIDE_OR_DIE_ID);
  } catch (err) {
    console.error("[darkness] ride or die grant failed", err);
  }
}

export async function maybeGrantConflictOfInterest(sql: Sql, userId: string, picks: unknown): Promise<void> {
  try {
    if (!conflictHit(picks)) return;
    await grantFeat(sql, userId, CONFLICT_OF_INTEREST_ID);
  } catch (err) {
    console.error("[darkness] conflict of interest grant failed", err);
  }
}

function conflictHit(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  let team = "";
  let vs = "";
  for (const pick of raw) {
    if (!pick || typeof pick !== "object") continue;
    const row = pick as { slot?: string; team?: string; vs?: string };
    if (row.slot === "QB") team = String(row.team ?? "").trim().toUpperCase();
    if (row.slot === "D") vs = String(row.vs ?? "").trim().toUpperCase();
  }
  if (!team || !vs || vs === "BYE") return false;
  return team === vs;
}

/** One unique Weekly winner. Everyone tied for 2nd, less than BAD_BEAT_MARGIN behind, gets Bad Beat. Compared in tenths. */
export function badBeatIds(rows: readonly { userId: string; score: number }[]): string[] {
  const tenths = rows
    .map((row) => ({ userId: row.userId, t: Math.round(Number(row.score) * 10) }))
    .filter((row) => row.userId && Number.isFinite(row.t));
  if (tenths.length < 2) return [];
  const top = Math.max(...tenths.map((row) => row.t));
  if (tenths.filter((row) => row.t === top).length !== 1) return [];
  const below = tenths.filter((row) => row.t < top);
  if (!below.length) return [];
  const second = Math.max(...below.map((row) => row.t));
  if (top - second >= Math.round(BAD_BEAT_MARGIN * 10)) return [];
  return below.filter((row) => row.t === second).map((row) => row.userId);
}

export async function maybeGrantBadBeat(sql: Sql, rows: readonly { userId: string; score: number }[]): Promise<void> {
  try {
    for (const userId of badBeatIds(rows)) await grantFeat(sql, userId, BAD_BEAT_ID);
  } catch (err) {
    console.error("[darkness] bad beat grant failed", err);
  }
}

/** A locked Weekly pick's final score equals its saved-board projection to the tenth. Projection must be > 0. Joined on pick id. */
export function calledItHit(picks: unknown, board: unknown): boolean {
  if (!Array.isArray(picks)) return false;
  let pack: unknown = board;
  if (typeof pack === "string") {
    try {
      pack = JSON.parse(pack) as unknown;
    } catch {
      return false;
    }
  }
  if (!pack || typeof pack !== "object") return false;
  const proj = new Map<string, number>();
  for (const rows of Object.values(pack as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const { id, ppr } = row as { id?: string; ppr?: number };
      const t = Math.round(Number(ppr) * 10);
      if (id && Number.isFinite(t)) proj.set(String(id), t);
    }
  }
  for (const pick of picks) {
    if (!pick || typeof pick !== "object") continue;
    const { id, score } = pick as { id?: string; score?: number };
    const want = proj.get(String(id ?? ""));
    if (want == null || want <= 0) continue;
    const got = Math.round(Number(score) * 10);
    if (Number.isFinite(got) && got === want) return true;
  }
  return false;
}

export async function maybeGrantCalledIt(sql: Sql, userId: string, picks: unknown, board: unknown): Promise<void> {
  try {
    if (!calledItHit(picks, board)) return;
    await grantFeat(sql, userId, CALLED_IT_ID);
  } catch (err) {
    console.error("[darkness] called it grant failed", err);
  }
}

export async function maybeGrantTriplePoint(sql: Sql, avatarId: string): Promise<void> {
  try {
    if (!avatarId || avatarId === "poor") return;
    const rows = await sql.query<{ user_id: string; name: string | null }>(
      `select p.user_id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
         from player_profiles p
         left join "user" u on u.id = p.user_id
        where p.avatar_id = $1`,
      [avatarId],
    );
    const wearing = rows.filter((row) => row.user_id && !skipWho(row.user_id, row.name));
    if (wearing.length < TRIPLEPOINT_NEED) return;
    for (const row of wearing) await grantFeat(sql, row.user_id, TRIPLEPOINT_ID);
  } catch (err) {
    console.error("[darkness] triple point grant failed", err);
  }
}

export async function maybeGrantScore1234(sql: Sql, userId: string): Promise<void> {
  try {
    const scores = await score1234Scores(sql, userId);
    if (scores.some((score) => hitScore1234(score))) await grantFeat(sql, userId, SCORE_1234_ID);
  } catch (err) {
    console.error("[darkness] 1234 grant failed", err);
  }
}
