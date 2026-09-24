/** One-shot: copy donor 2026-W2 slate onto Commish by id. Weekly only. */
import { HIDDEN_BOARD_IDS } from "./stats-shared";
import { clipWeeklyPickIds } from "./weekly";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export const COMMISH_SURVIVOR_ID = "e7APj7EJ03oPUXuukNxNpWqDzsCjUrIM";
export const COMMISH_W2_DONOR_ID = "e20r0ZNjMbkgSw6DsHSpqQLTfXX3Xnfh";
export const COMMISH_W2_MERGE_KEY = "commish-w2-arkeayes-2026";
const COMMISH_W2_RUN_KEY = "commish-w2-e20r0-2026";
export const COMMISH_W2_SCORE_KEY = "commish-w2-score-v1";
export const COMMISH_W2_SCORE_KEY_V2 = "commish-w2-score-v2";
const SEASON = 2026;
const WEEK = 2;

async function ensureFlagTable(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
}

function pickRows(raw: unknown): unknown[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function pickCount(raw: unknown): number {
  return clipWeeklyPickIds(pickRows(raw)).length;
}

export async function mergeCommishW2Once(sql: Sql): Promise<void> {
  await ensureFlagTable(sql);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_weekly_flags where key = $1`,
    [COMMISH_W2_RUN_KEY],
  );
  if (already[0]) return;

  await sql.query(`delete from darkness_weekly_flags where key = $1`, [COMMISH_W2_MERGE_KEY]);
  HIDDEN_BOARD_IDS.add(COMMISH_W2_DONOR_ID);

  const donorRuns = await sql.query<{ user_id: string; status: string; picks: unknown }>(
    `select user_id, status, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and user_id = $3
      limit 1`,
    [SEASON, WEEK, COMMISH_W2_DONOR_ID],
  );
  const donor = donorRuns[0];
  const picks = donor?.picks ?? null;
  const copied = Boolean(donor && donor.status === "done" && picks != null);
  const n = copied ? pickCount(picks) : 0;

  if (copied) {
    const payload = typeof picks === "string" ? picks : JSON.stringify(picks);
    await sql.query(
      `insert into darkness_weekly_runs (season, week, user_id, status, score, payout_score, payout_win, picks, finished_at)
       values ($1, $2, $3, 'done', null, false, false, $4::jsonb, now())
       on conflict (season, week, user_id) do update
         set status = 'done',
             score = case
               when darkness_weekly_runs.score is not null then darkness_weekly_runs.score
               else null
             end,
             payout_score = false,
             payout_win = false,
             picks = excluded.picks,
             finished_at = now()`,
      [SEASON, WEEK, COMMISH_SURVIVOR_ID, payload],
    );
  }

  const mail = await sql.query<{ has_email: boolean }>(
    `select (email is not null and btrim(email) <> '') as has_email from "user" where id = $1`,
    [COMMISH_W2_DONOR_ID],
  );
  if (mail[0]?.has_email) {
    await sql.query(
      `update "user"
          set email = $1,
              "updatedAt" = now()
        where id = $2
          and email is not null
          and btrim(email) <> ''
          and email not like 'merged+%@users.invalid'`,
      [`merged+${COMMISH_W2_DONOR_ID}@users.invalid`, COMMISH_W2_DONOR_ID],
    );
  }
  await sql.query(
    `update account
        set "userId" = $1
      where "userId" = $2
        and "providerId" in ('google', 'credential')
        and not exists (
          select 1 from account a2
           where a2."userId" = $1 and a2."providerId" = account."providerId"
        )`,
    [COMMISH_SURVIVOR_ID, COMMISH_W2_DONOR_ID],
  );

  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict do nothing`, [COMMISH_W2_RUN_KEY]);
  console.log(
    `[darkness] commish w2 merge donor=${COMMISH_W2_DONOR_ID} copied=${copied ? "yes" : "no"} picks=${n}`,
  );
}

/** One-shot: store Commish 2026-W2 score from final Sleeper stats. Does not re-settle or pay. */
export async function scoreCommishW2Once(sql: Sql): Promise<void> {
  await ensureFlagTable(sql);
  await sql.query(`delete from darkness_weekly_flags where key = $1`, [COMMISH_W2_SCORE_KEY]);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_weekly_flags where key = $1`,
    [COMMISH_W2_SCORE_KEY_V2],
  );
  if (already[0]) return;

  const { isWeekSlateFinal, weekWindow, weeklyLiveStats, attachFinishedWeekActuals, sidMap } = await import(
    "./weekly-sleeper"
  );
  const window = await weekWindow(SEASON, WEEK);
  if (!window.done || !isWeekSlateFinal(window.games)) return;

  const runs = await sql.query<{ status: string; picks: unknown }>(
    `select status, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and user_id = $3
      limit 1`,
    [SEASON, WEEK, COMMISH_SURVIVOR_ID],
  );
  const row = runs[0];
  if (!row || row.status !== "done") return;

  let picks = pickRows(row.picks);
  if (pickCount(picks) === 0) {
    const donorRuns = await sql.query<{ status: string; picks: unknown }>(
      `select status, picks
         from darkness_weekly_runs
        where season = $1 and week = $2 and user_id = $3
        limit 1`,
      [SEASON, WEEK, COMMISH_W2_DONOR_ID],
    );
    const donor = donorRuns[0];
    if (!donor || donor.status !== "done" || pickCount(donor.picks) === 0) return;
    picks = pickRows(donor.picks);
    await sql.query(
      `update darkness_weekly_runs
          set picks = $4::jsonb
        where season = $1 and week = $2 and user_id = $3 and status = 'done'`,
      [SEASON, WEEK, COMMISH_SURVIVOR_ID, JSON.stringify(picks)],
    );
  }

  const live = await weeklyLiveStats(SEASON, WEEK);
  const liveKeys = Object.keys(live).length;
  if (liveKeys === 0) return;
  const weeks = await sql.query<{ board: unknown }>(
    `select board from darkness_weekly_weeks where season = $1 and week = $2 limit 1`,
    [SEASON, WEEK],
  );
  const board = packedBoard(weeks[0]?.board);
  const finished = board ? await attachFinishedWeekActuals(board, SEASON, WEEK + 1) : null;
  const sids = finished ? sidMap(finished) : {};
  const byId = finished ? weekActuals(finished, WEEK) : new Map<string, number>();
  const scored = scoreFinishedPicks(picks, live, sids, byId);
  if (scored == null) return;

  await sql.query(
    `update darkness_weekly_runs
        set score = $4
      where season = $1 and week = $2 and user_id = $3 and status = 'done'`,
    [SEASON, WEEK, COMMISH_SURVIVOR_ID, scored.score],
  );
  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict do nothing`, [COMMISH_W2_SCORE_KEY_V2]);
  console.log(`[darkness] commish w2 score-v2=${scored.score} picks=${scored.picks} liveKeys=${liveKeys}`);
}

function packedBoard(raw: unknown): import("./weekly").WeeklyPackedBoard | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const board = value as import("./weekly").WeeklyPackedBoard;
  if (!Array.isArray(board.QB)) return null;
  return board;
}

function weekActuals(pack: import("./weekly").WeeklyPackedBoard, week: number): Map<string, number> {
  const out = new Map<string, number>();
  const idx = week - 1;
  for (const rows of Object.values(pack)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const pts = row.weeks?.[idx];
      if (pts != null && Number.isFinite(Number(pts))) out.set(row.id, Math.round(Number(pts) * 10) / 10);
    }
  }
  return out;
}

/** Final Sleeper points only. A miss stays missing — never a fake 0.0. */
function scoreFinishedPicks(
  raw: unknown,
  live: Record<string, number>,
  sids: Record<string, string>,
  byId: Map<string, number>,
): { score: number; picks: number } | null {
  const rows = pickRows(raw);
  const seen = new Set<string>();
  let total = 0;
  let n = 0;
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const slot = String((item as { slot?: string }).slot ?? "").trim();
    const id = String((item as { id?: string }).id ?? "").trim();
    const sid = String((item as { sid?: string }).sid ?? "").trim() || sids[id] || "";
    if (!slot || !id || seen.has(slot)) continue;
    seen.add(slot);
    const livePts = sid && Object.prototype.hasOwnProperty.call(live, sid) ? live[sid] : undefined;
    const sheet = byId.get(id);
    const pts = livePts != null && Number.isFinite(livePts) ? livePts : sheet;
    if (pts == null || !Number.isFinite(pts)) return null;
    total += pts;
    n += 1;
  }
  if (n === 0) return null;
  return { score: Math.round(total * 10) / 10, picks: n };
}
