/** Server-only daily elimination writes. Do not import from client modules. */
import type { DailyBoard, DailyLineup, DailyMeta, DailyPickPayload, DailyStatus } from "./daily-api-types";
export type { DailyBoard, DailyBoardRow, DailyLineup, DailyLineupPick, DailyMeta, DailyStatus } from "./daily-api-types";
import { ELIM_SLOTS, buildSeason, slotPos, type ElimYear } from "./elim-data";
import {
  DAILY_PAY,
  autoFillDailyPicks,
  canViewDailyLineup,
  clipDailyPickIds,
  dailyDayStamp,
  dailyPickSnapshot,
  dailyScorePays,
  dailyYesterday,
  hydrateDailyPicks,
  isDailyDay,
  pickDailyPuzzle,
  puzzleIsLegal,
  tiedDailyWinners,
} from "./daily";
import { scoredWeek, type ElimPick } from "./elim";
import { clipDisplayName, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { clampAvatar, type AvatarId } from "./avatars";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type DayRow = {
  day: string;
  year: number;
  week: number;
  awarded: boolean;
  awarded_user_id: string | null;
};

type RunRow = {
  status: string;
  score: number | string | null;
  payout_score: boolean;
  picks: unknown;
  started_at?: string | Date | null;
};

function asDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensureDailyTables(sql: Sql): Promise<void> {
  await sql.query("alter table player_profiles add column if not exists daily_stars integer not null default 0");
  await sql.query(`
    create table if not exists darkness_daily_days (
      day date primary key,
      year integer not null,
      week integer not null,
      awarded boolean not null default false,
      awarded_user_id text,
      created_at timestamptz not null default now()
    )`);
  await sql.query(`
    create table if not exists darkness_daily_runs (
      day date not null,
      user_id text not null,
      status text not null default 'playing',
      score numeric,
      payout_score boolean not null default false,
      payout_win boolean not null default false,
      picks jsonb,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      primary key (day, user_id)
    )`);
  const { ensurePayoutsTable } = await import("./payouts");
  await ensurePayoutsTable(sql);
}

async function loadDay(sql: Sql, day: string): Promise<DayRow | null> {
  const rows = await sql.query<DayRow>(
    `select day::text as day, year, week, awarded, awarded_user_id
       from darkness_daily_days where day = $1::date`,
    [day],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, day: asDay(row.day) };
}

async function ensureToday(sql: Sql, day: string): Promise<DayRow> {
  const existing = await loadDay(sql, day);
  if (existing) return existing;
  let puzzle = pickDailyPuzzle();
  let guard = 0;
  while (!puzzleIsLegal(puzzle.year, puzzle.week) && guard < 8) {
    puzzle = pickDailyPuzzle();
    guard += 1;
  }
  await sql.query(
    `insert into darkness_daily_days (day, year, week)
     values ($1::date, $2, $3)
     on conflict (day) do nothing`,
    [day, puzzle.year, puzzle.week],
  );
  const saved = await loadDay(sql, day);
  if (!saved) throw new Error("daily day missing");
  return saved;
}

async function settleYesterdaySafe(sql: Sql, today: string): Promise<void> {
  try {
    await settleYesterday(sql, today);
  } catch (err) {
    console.error("[darkness] daily settle failed", err);
  }
}

async function importLegacyThenSettle(sql: Sql, today: string): Promise<void> {
  try {
    const { importLegacyHistory } = await import("./legacy-import.server");
    await importLegacyHistory(sql);
  } catch (err) {
    console.error("[darkness] legacy daily import failed", err);
  }
  await settleYesterdaySafe(sql, today);
}

async function settleYesterday(sql: Sql, today: string): Promise<void> {
  const yday = dailyYesterday(today);
  if (!isDailyDay(yday)) return;
  const day = await loadDay(sql, yday);
  if (!day) return;
  if (day.awarded) {
    try {
      const { syncDailyStarsFromPayouts } = await import("./payouts");
      const wins = await sql.query<{ user_id: string }>(
        `select user_id from darkness_payouts
          where kind = 'daily_win' and source_key like $1`,
        [`daily_win:${yday}:%`],
      );
      for (const row of wins) {
        await syncDailyStarsFromPayouts(sql, row.user_id);
      }
    } catch {
      /* payouts table may not exist yet */
    }
    return;
  }
  await finishStaleDailyRuns(sql, day, { force: true });
  const { recordPayout, dailyWinKey, syncDailyStarsFromPayouts } = await import("./payouts");
  const existingWin = await sql.query<{ user_id: string }>(
    `select user_id from darkness_payouts
      where kind = 'daily_win' and source_key like $1`,
    [`daily_win:${yday}:%`],
  );
  if (existingWin[0]) {
    await sql.query(
      `update darkness_daily_days
          set awarded = true, awarded_user_id = coalesce(awarded_user_id, $2)
        where day = $1::date and awarded = false`,
      [yday, existingWin[0].user_id],
    );
    for (const row of existingWin) {
      await syncDailyStarsFromPayouts(sql, row.user_id);
    }
    return;
  }
  const top = await sql.query<{ user_id: string; score: number | string }>(
    `select user_id, score
       from darkness_daily_runs
      where day = $1::date and status = 'done' and score is not null
      order by score desc, finished_at asc`,
    [yday],
  );
  let ids = tiedDailyWinners(top.map((row) => ({ userId: row.user_id, score: asNum(row.score) })));
  if (yday === "2026-09-08") ids = ids.slice(0, 1);
  for (const id of ids) {
    await sql.query(
      `update darkness_daily_runs
          set payout_win = true
        where day = $1::date and user_id = $2`,
      [yday, id],
    );
    await recordPayout(sql, {
      userId: id,
      amount: DAILY_PAY,
      stars: 1,
      kind: "daily_win",
      sourceKey: dailyWinKey(yday, id),
    });
  }
  await sql.query(
    `update darkness_daily_days
        set awarded = true, awarded_user_id = $2
      where day = $1::date and awarded = false`,
    [yday, ids[0] ?? null],
  );
}

async function loadRun(sql: Sql, day: string, userId: string): Promise<RunRow | null> {
  const rows = await sql.query<RunRow>(
    `select status, score, payout_score, picks, started_at
       from darkness_daily_runs
      where day = $1::date and user_id = $2`,
    [day, userId],
  );
  return rows[0] ?? null;
}

function runStatus(run: RunRow | null): DailyStatus {
  if (!run) return "open";
  if (run.status === "done" && run.score != null) return "done";
  // Leave / freeze / kick never burns the attempt. Old "forfeit" or empty-done
  // rows stay in play until the day closes; missed-day auto-submit fills leftover slots.
  return "playing";
}

function metaFrom(day: DayRow, status: DailyStatus, run: RunRow | null): DailyMeta {
  const locked = status === "done";
  return {
    day: day.day,
    year: day.year,
    week: locked ? day.week : null,
    status,
    score: run?.score == null ? null : asNum(run.score),
    paid: Boolean(run?.payout_score),
    launch: "2026-09-02",
    picks: status === "playing" ? clipDailyPickIds(run?.picks) : [],
  };
}

function scorePicks(year: ElimYear, week: number, picks: ElimPick[]): number {
  const total = picks.reduce((n, pick) => n + scoredWeek(pick.player, week, year), 0);
  return Math.round(total * 10) / 10;
}

function rebuildPicks(year: ElimYear, payload: { slot: string; id: string }[]): ElimPick[] | null {
  if (payload.length !== ELIM_SLOTS.length) return null;
  const season = buildSeason(year);
  const used = new Set<string>();
  const picks: ElimPick[] = [];
  for (const slot of ELIM_SLOTS) {
    const row = payload.find((item) => item.slot === slot);
    if (!row) return null;
    const pos = slotPos(slot);
    const player = season[pos].find((item) => item.id === row.id);
    if (!player || used.has(player.id)) return null;
    used.add(player.id);
    picks.push({ slot, pos, player, seat: 0 });
  }
  return picks;
}

function costsLegal(picks: ElimPick[]): boolean {
  const spent = picks.reduce((n, row) => n + row.player.cost, 0);
  return spent >= ELIM_SLOTS.length && spent <= 35;
}

async function ensureDailyProfile(sql: Sql, userId: string): Promise<void> {
  const { settleProfile } = await import("./stats.server");
  await settleProfile(sql, userId);
  const auth = await sql.query<{ name: string | null }>(`select name from "user" where id = $1`, [userId]);
  const name = clipDisplayName(auth[0]?.name ?? "");
  if (!name) return;
  await sql.query(
    `update player_profiles
        set display_name = coalesce(nullif(trim(display_name), ''), $2),
            updated_at = now()
      where user_id = $1`,
    [userId, name],
  );
}

const OPEN_RUN = "status in ('playing', 'forfeit')";
const UNFINISHED_RUN = `(${OPEN_RUN} or (status = 'done' and score is null))`;

async function completeDailyRun(
  sql: Sql,
  day: DayRow,
  userId: string,
  picks: import("./elim").ElimPick[],
): Promise<RunRow | null> {
  if (!picks.length || !costsLegal(picks)) return loadRun(sql, day.day, userId);
  const score = scorePicks(day.year as ElimYear, day.week, picks);
  const overLine = dailyScorePays(score);
  const { recordPayout, dailyScoreKey } = await import("./payouts");
  const scoreKey = dailyScoreKey(day.day, userId);
  const alreadyScore = overLine
    ? await sql.query<{ ok: number | string }>(
        `select 1 as ok from darkness_payouts where source_key = $1 limit 1`,
        [scoreKey],
      )
    : [];
  const payScore = overLine && !alreadyScore[0];
  const snap = dailyPickSnapshot(day.year as ElimYear, day.week, picks);
  await sql.query(
    `update darkness_daily_runs
        set status = 'done',
            score = $3,
            picks = $4::jsonb,
            payout_score = $5,
            finished_at = now()
      where day = $1::date and user_id = $2 and ${UNFINISHED_RUN}`,
    [day.day, userId, score, JSON.stringify(snap), payScore],
  );
  if (payScore) {
    await recordPayout(sql, {
      userId,
      amount: DAILY_PAY,
      kind: "daily_score",
      sourceKey: scoreKey,
    });
  }
  void ensureDailyProfile(sql, userId).catch((err) => console.error("[darkness] daily profile failed", err));
  void import("./scratch.server")
    .then(({ syncScratchBank }) => syncScratchBank(sql, userId))
    .catch((err) => console.error("[darkness] scratch bank failed", err));
  return loadRun(sql, day.day, userId);
}

async function finishStaleDailyRuns(sql: Sql, day: DayRow, _opts?: { force?: boolean }): Promise<void> {
  // Today's open Daily is never auto-filled — playing runs stay live until the
  // day rolls. Missed-day random finish only after the stamp is closed.
  if (asDay(day.day) >= dailyDayStamp()) return;
  let rows: { user_id: string; started_at: string | Date | null; picks: unknown; score: number | string | null; status: string }[] = [];
  try {
    rows = await sql.query(
      `select user_id, started_at, picks, score, status
         from darkness_daily_runs
        where day = $1::date and ${UNFINISHED_RUN}`,
      [day.day],
    );
  } catch {
    return;
  }
  for (const row of rows) {
    if (row.status === "done" && row.score != null) continue;
    try {
      const existing = clipDailyPickIds(row.picks);
      const picks = autoFillDailyPicks(day.year as ElimYear, day.day, `${day.day}:${row.user_id}`, existing);
      await completeDailyRun(sql, day, row.user_id, picks);
    } catch (err) {
      console.error("[darkness] daily auto-submit failed", err);
    }
  }
}

export async function getDailyHandler({ context }: { context: { userId: string | null } }): Promise<DailyMeta> {
    const sql = await getSql();
    await ensureDailyTables(sql);
    const today = dailyDayStamp();
    const day = await ensureToday(sql, today);
    const userId = context.userId;
    if (!userId) return metaFrom(day, "signed_out", null);
    const run = await loadRun(sql, today, userId);
    return metaFrom(day, runStatus(run), run);
}

export async function claimDailyHandler({ context }: { context: { userId: string } }): Promise<DailyMeta> {
    const sql = await getSql();
    await ensureDailyTables(sql);
    const today = dailyDayStamp();
    const day = await ensureToday(sql, today);
    const run = await loadRun(sql, today, context.userId);
    const status = runStatus(run);
    if (status === "done") return metaFrom(day, status, run);
    if (run?.status === "forfeit") {
      await sql.query(
        `update darkness_daily_runs
            set status = 'playing'
          where day = $1::date and user_id = $2 and status = 'forfeit'`,
        [today, context.userId],
      );
    }
    if (status === "open") {
      await sql.query(
        `insert into darkness_daily_runs (day, user_id, status)
         values ($1::date, $2, 'playing')
         on conflict (day, user_id) do nothing`,
        [today, context.userId],
      );
      try {
        await ensureDailyProfile(sql, context.userId);
      } catch (err) {
        console.error("[darkness] daily profile failed", err);
      }
    }
    const next = await loadRun(sql, today, context.userId);
    return metaFrom(day, runStatus(next), next);
}

export async function forfeitDailyHandler({ context }: { context: { userId: string } }): Promise<DailyMeta> {
  const sql = await getSql();
  await ensureDailyTables(sql);
  const today = dailyDayStamp();
  const day = await ensureToday(sql, today);
  const next = await loadRun(sql, today, context.userId);
  return metaFrom(day, runStatus(next), next);
}

export async function saveDailyDraftHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { picks: DailyPickPayload[] };
}): Promise<DailyMeta> {
  const sql = await getSql();
  await ensureDailyTables(sql);
  const today = dailyDayStamp();
  const day = await ensureToday(sql, today);
  const run = await loadRun(sql, today, context.userId);
  const status = runStatus(run);
  if (status !== "playing") return metaFrom(day, status, run);
  const payload = clipDailyPickIds(data.picks);
  await sql.query(
    `update darkness_daily_runs
        set picks = $3::jsonb,
            status = 'playing'
      where day = $1::date and user_id = $2 and ${OPEN_RUN}`,
    [today, context.userId, JSON.stringify(payload)],
  );
  const next = await loadRun(sql, today, context.userId);
  return metaFrom(day, runStatus(next), next);
}

export async function lockDailyHandler({ context, data }: { context: { userId: string }; data: { picks: DailyPickPayload[] } }): Promise<DailyMeta & { week: number; score: number }> {
    const sql = await getSql();
    await ensureDailyTables(sql);
    const today = dailyDayStamp();
    const day = await ensureToday(sql, today);
    const run = await loadRun(sql, today, context.userId);
    const status = runStatus(run);
    if (status === "done") {
      return { ...metaFrom(day, "done", run), week: day.week, score: asNum(run?.score) };
    }
    if (status !== "playing") {
      return { ...metaFrom(day, status, run), week: 0, score: 0 };
    }
    const picks = rebuildPicks(day.year as ElimYear, data.picks);
    if (!picks || !costsLegal(picks)) {
      return { ...metaFrom(day, "playing", run), week: 0, score: 0 };
    }
    const next = await completeDailyRun(sql, day, context.userId, picks);
    return { ...metaFrom(day, runStatus(next), next), week: day.week, score: asNum(next?.score) };
}

export async function listDailyBoardHandler({ data }: { data: { day: string } }): Promise<DailyBoard> {
    const sql = await getSql();
    await ensureDailyTables(sql);
    const today = dailyDayStamp();
    await importLegacyThenSettle(sql, today);
    if (data.day === today) await ensureToday(sql, today);
    const day = await loadDay(sql, data.day);
    if (!day) {
      return { day: data.day, year: 0, week: null, awarded: false, winnerId: null, rows: [] };
    }
    const rows = await sql.query<{
      id: string;
      name: string | null;
      avatar_id: string | null;
      score: number | string;
      payout_score: boolean;
      payout_win: boolean;
      daily_stars: number | string | null;
      has_picks: boolean;
    }>(
      `select r.user_id as id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
              coalesce(p.avatar_id, 'poor') as avatar_id,
              r.score,
              r.payout_score,
              r.payout_win,
              coalesce(p.daily_stars, 0) as daily_stars,
              (r.picks is not null) as has_picks
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day = $1::date and r.status = 'done' and r.score is not null
        order by r.score desc, r.finished_at asc`,
      [day.day],
    );
    return {
      day: day.day,
      year: day.year,
      week: day.awarded || day.day < today ? day.week : day.week,
      awarded: day.awarded,
      winnerId: day.awarded_user_id,
      rows: rows.flatMap((row) => {
        const name = clipDisplayName(row.name ?? "");
        if (!name || isHiddenBoardId(row.id) || isHiddenBoardName(name)) return [];
        return [
          {
            id: row.id,
            name,
            avatarId: clampAvatar(row.avatar_id ?? "poor"),
            score: asNum(row.score),
            paid: Boolean(row.payout_score),
            winner: Boolean(day.awarded && (row.payout_win || row.id === day.awarded_user_id)),
            stars: Math.max(0, Math.floor(Number(row.daily_stars) || 0)),
            hasPicks: Boolean(row.has_picks),
          },
        ];
      }),
    };
}

export async function getDailyLineupHandler({ context, data }: { context: { userId: string | null }; data: { day: string; userId: string } }): Promise<DailyLineup | null> {
    if (!data.userId) return null;
    const today = dailyDayStamp();
    if (!canViewDailyLineup(data.day, today, context.userId, data.userId)) return null;
    const sql = await getSql();
    await ensureDailyTables(sql);
    const day = await loadDay(sql, data.day);
    if (!day) return null;
    const rows = await sql.query<{
      name: string | null;
      score: number | string | null;
      picks: unknown;
    }>(
      `select coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
              r.score,
              r.picks
         from darkness_daily_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.day = $1::date and r.user_id = $2 and r.status = 'done'`,
      [day.day, data.userId],
    );
    const row = rows[0];
    if (!row) return null;
    let raw: unknown = row.picks;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw) as unknown;
      } catch {
        raw = [];
      }
    }
    const picks = hydrateDailyPicks(day.year, day.week, raw);
    if (!picks.length) {
      return {
        day: day.day,
        name: clipDisplayName(row.name ?? "") || "GM",
        year: day.year,
        week: day.week,
        score: asNum(row.score),
        picks: [],
      };
    }
    return {
      day: day.day,
      name: clipDisplayName(row.name ?? "") || "GM",
      year: day.year,
      week: day.week,
      score: asNum(row.score),
      picks,
    };
}
