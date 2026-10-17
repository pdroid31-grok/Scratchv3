import {
  COLD_STREAK_FROM,
  NUMBER_ONE_FAN_ID,
  NUMBER_ONE_FAN_NEED,
  SCORE_1234_ID,
  SUNDIAL_ID,
  SUNDIAL_NEED,
} from "../avatars";
import { etYmd, hitScore1234, sundialHours, teamCounts } from "../feat-progress";
import { grantFeat, type Sql } from "./grant";
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

export async function maybeGrantScore1234(sql: Sql, userId: string): Promise<void> {
  try {
    const scores = await score1234Scores(sql, userId);
    if (scores.some((score) => hitScore1234(score))) await grantFeat(sql, userId, SCORE_1234_ID);
  } catch (err) {
    console.error("[darkness] 1234 grant failed", err);
  }
}
