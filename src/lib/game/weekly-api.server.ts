/** Server-only weekly elimination writes. Do not import from client modules. */
import type { WeeklyBoard, WeeklyBoardPack, WeeklyLineup, WeeklyMeta, WeeklyPickPayload, WeeklyResume, WeeklyStatus, SeasonBoard } from "./weekly-api-types";
export type { WeeklyBoard, WeeklyBoardPack, WeeklyLineup, WeeklyMeta, WeeklyResume, WeeklyStatus, SeasonBoard } from "./weekly-api-types";
import { ELIM_SLOTS, slotPos, type ElimSlot } from "./elim-data";
import {
  WEEKLY_PAY,
  WEEKLY_WIN_PAY,
  WEEKLY_WIN_STARS,
  canViewWeeklyLineup,
  fillSnapOpponents,
  hydrateWeeklyPicks,
  tiedWeeklyWinners,
  weeklyPickPayload,
  weeklyScorePays,
  weeklyTeamBlocked,
  weeklyTotal,
  withPackedProjections,
  WEEK1_TNF_TEAMS,
  blockWeeklyTeams,
  type WeeklyPackedBoard,
  type WeeklyPickSnap,
} from "./weekly";
import { fillPackedOpponents, nflClock, playersFromPack, sidMap, weekOpponents, weekWindow, weeklyLiveStats, weeklyProjections } from "./weekly-sleeper";
import { type ElimPick } from "./elim";
import { clipDisplayName } from "./stats-shared";
import { clampAvatar } from "./avatars";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type WeekRow = {
  season: number;
  week: number;
  lock_at: Date | string;
  end_at: Date | string;
  awarded: boolean;
  board: unknown;
};

type RunRow = {
  status: string;
  score: number | string | null;
  payout_score: boolean;
  payout_win: boolean;
  picks: unknown;
};

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

async function getSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensureWeeklyTables(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_weeks (
      season integer not null,
      week integer not null,
      lock_at timestamptz not null,
      end_at timestamptz not null,
      awarded boolean not null default false,
      board jsonb not null,
      created_at timestamptz not null default now(),
      primary key (season, week)
    )`);
  await sql.query(`
    create table if not exists darkness_weekly_runs (
      season integer not null,
      week integer not null,
      user_id text not null,
      status text not null default 'playing',
      score numeric,
      payout_score boolean not null default false,
      payout_win boolean not null default false,
      picks jsonb,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      primary key (season, week, user_id)
    )`);
  const { ensurePayoutsTable } = await import("./payouts");
  await ensurePayoutsTable(sql);
}

function parseBoard(raw: unknown): WeeklyPackedBoard | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const board = raw as WeeklyPackedBoard;
  if (!Array.isArray(board.QB) || board.QB.length < 8) return null;
  return board;
}

async function loadWeek(sql: Sql, season: number, week: number): Promise<WeekRow | null> {
  const rows = await sql.query<WeekRow>(
    `select season, week, lock_at, end_at, awarded, board
       from darkness_weekly_weeks where season = $1 and week = $2`,
    [season, week],
  );
  return rows[0] ?? null;
}

async function ensureWeek(sql: Sql, season: number, week: number): Promise<WeekRow> {
  const existing = await loadWeek(sql, season, week);
  const window = await weekWindow(season, week);
  if (existing) {
    if (!existing.awarded) {
      const lockAt = asTime(existing.lock_at);
      const endAt = asTime(existing.end_at);
      if (Math.abs(lockAt - window.lockAt) > 60_000 || Math.abs(endAt - window.endAt) > 60_000) {
        await sql.query(
          `update darkness_weekly_weeks
              set lock_at = to_timestamp($3 / 1000.0), end_at = to_timestamp($4 / 1000.0)
            where season = $1 and week = $2 and awarded = false`,
          [season, week, window.lockAt, window.endAt],
        );
      }
      const runs = await sql.query<{ n: string }>(
        `select count(*)::text as n from darkness_weekly_runs where season = $1 and week = $2 and status = 'done'`,
        [season, week],
      );
      if (Number(runs[0]?.n) === 0 && window.open) {
        const board = await weeklyProjections(season, week);
        await sql.query(
          `update darkness_weekly_weeks
              set board = $3::jsonb,
                  lock_at = to_timestamp($4 / 1000.0),
                  end_at = to_timestamp($5 / 1000.0)
            where season = $1 and week = $2 and awarded = false`,
          [season, week, JSON.stringify(board), window.lockAt, window.endAt],
        );
      }
      const latest = await loadWeek(sql, season, week);
      if (latest) return latest;
    }
    return existing;
  }
  const board = await weeklyProjections(season, week);
  await sql.query(
    `insert into darkness_weekly_weeks (season, week, lock_at, end_at, board)
     values ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5::jsonb)
     on conflict (season, week) do nothing`,
    [season, week, window.lockAt, window.endAt, JSON.stringify(board)],
  );
  const saved = await loadWeek(sql, season, week);
  if (!saved) throw new Error("weekly week missing");
  return saved;
}

async function loadRun(sql: Sql, season: number, week: number, userId: string): Promise<RunRow | null> {
  const rows = await sql.query<RunRow>(
    `select status, score, payout_score, payout_win, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and user_id = $3`,
    [season, week, userId],
  );
  return rows[0] ?? null;
}

async function settleWeek(sql: Sql, season: number, week: number): Promise<void> {
  const day = await loadWeek(sql, season, week);
  if (!day) return;
  const { recordPayout, weeklyScoreKey, weeklyWinKey, syncDailyStarsFromPayouts } = await import("./payouts");
  if (day.awarded) {
    try {
      const wins = await sql.query<{ user_id: string }>(
        `select user_id from darkness_payouts
          where kind = 'weekly_win' and source_key like $1`,
        [`weekly_win:${season}-W${week}:%`],
      );
      for (const row of wins) {
        await syncDailyStarsFromPayouts(sql, row.user_id);
      }
    } catch {
      /* payouts table may not exist yet */
    }
    return;
  }
  const window = await weekWindow(season, week);
  if (!window.done) return;
  const live = await weeklyLiveStats(season, week);
  const runs = await sql.query<{ user_id: string; picks: unknown }>(
    `select user_id, picks from darkness_weekly_runs
      where season = $1 and week = $2 and status = 'done'`,
    [season, week],
  );
  const scored = runs.map((row) => {
    const picks = hydrateWeeklyPicks(row.picks, live, "zero");
    return { userId: row.user_id, score: weeklyTotal(picks), picks };
  });
  const winners = new Set(tiedWeeklyWinners(scored));
  for (const row of scored) {
    const paid = weeklyScorePays(row.score);
    const win = winners.has(row.userId);
    await sql.query(
      `update darkness_weekly_runs
          set score = $4, payout_score = $5, payout_win = $6, picks = $7::jsonb
        where season = $1 and week = $2 and user_id = $3`,
      [season, week, row.userId, row.score, paid, win, JSON.stringify(row.picks)],
    );
    if (paid) {
      await recordPayout(sql, {
        userId: row.userId,
        amount: WEEKLY_PAY,
        kind: "weekly_score",
        sourceKey: weeklyScoreKey(season, week, row.userId),
      });
    }
    if (win) {
      await recordPayout(sql, {
        userId: row.userId,
        amount: WEEKLY_WIN_PAY,
        stars: WEEKLY_WIN_STARS,
        kind: "weekly_win",
        sourceKey: weeklyWinKey(season, week, row.userId),
      });
    }
  }
  await sql.query(
    `update darkness_weekly_weeks set awarded = true where season = $1 and week = $2 and awarded = false`,
    [season, week],
  );
}

async function settleSafe(sql: Sql, season: number, week: number): Promise<void> {
  try {
    await settleWeek(sql, season, week);
  } catch (err) {
    console.error("[darkness] weekly settle failed", err);
  }
}

function runStatus(run: RunRow | null, open: boolean): WeeklyStatus {
  if (!run) return open ? "open" : "locked";
  if (run.status === "done") return "done";
  if (run.status === "forfeit") return "forfeit";
  return "playing";
}

function metaFrom(week: WeekRow, status: WeeklyStatus, run: RunRow | null, live: boolean): WeeklyMeta {
  return {
    season: week.season,
    week: week.week,
    status,
    lockAt: asTime(week.lock_at),
    endAt: asTime(week.end_at),
    live,
    awarded: Boolean(week.awarded),
    score: run?.score == null ? null : asNum(run.score),
    paid: Boolean(run?.payout_score),
    winner: Boolean(run?.payout_win),
  };
}

async function expirePlaying(sql: Sql, season: number, week: number, open: boolean): Promise<void> {
  if (open) return;
  if (season === 2026 && week === 1) {
    await sql.query(
      `update darkness_weekly_runs
          set status = 'forfeit', finished_at = now()
        where season = $1 and week = $2 and status = 'playing'
          and user_id not in ($3, $4)`,
      [season, week, MSWAN_LIVE, MSWAN_SEED],
    );
    return;
  }
  await sql.query(
    `update darkness_weekly_runs
        set status = 'forfeit', finished_at = now()
      where season = $1 and week = $2 and status = 'playing'`,
    [season, week],
  );
}

const PAT_RETRY_KEY = "pat-retry-2026w1-spread18";
const MSWAN_LIVE = "FGR4MUWx09k2LG6w2T8g7X3WKh3KbtfY";
const MSWAN_SEED = "38GXVpMo8GE8bERLYLHaoQF4CPBjvUS0";

function isMswanId(userId: string): boolean {
  return userId === MSWAN_LIVE || userId === MSWAN_SEED;
}

function mswanLateOk(season: number, week: number, userId: string, run: RunRow | null): boolean {
  if (season !== 2026 || week !== 1 || !isMswanId(userId)) return false;
  if (!run) return true;
  return run.status !== "done";
}

async function reopenPatOnce(sql: Sql, season: number, week: number): Promise<void> {
  if (season !== 2026 || week !== 1) return;
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_weekly_flags where key = $1`,
    [PAT_RETRY_KEY],
  );
  if (already[0]) return;
  await sql.query(
    `delete from darkness_weekly_runs
      where season = $1 and week = $2
        and user_id in (
          select p.user_id
            from player_profiles p
            left join "user" u on u.id = p.user_id
           where lower(trim(coalesce(p.display_name, ''))) in ('pat', 'pastry pat', 'ap_690')
              or lower(trim(coalesce(u.name, ''))) in ('pat', 'pastry pat', 'ap_690')
        )`,
    [season, week],
  );
  try {
    const window = await weekWindow(season, week);
    if (window.open) {
      const board = await weeklyProjections(season, week);
      await sql.query(
        `update darkness_weekly_weeks
            set board = $3::jsonb,
                lock_at = to_timestamp($4 / 1000.0),
                end_at = to_timestamp($5 / 1000.0)
          where season = $1 and week = $2 and awarded = false`,
        [season, week, JSON.stringify(board), window.lockAt, window.endAt],
      );
    }
  } catch (err) {
    console.error("[darkness] weekly pat retry board failed", err);
  }
  await sql.query(
    `insert into darkness_weekly_flags (key) values ($1) on conflict do nothing`,
    [PAT_RETRY_KEY],
  );
}

async function reopenMswanLate(sql: Sql, season: number, week: number): Promise<void> {
  if (season !== 2026 || week !== 1) return;
  await sql.query(
    `delete from darkness_weekly_runs
      where season = $1 and week = $2
        and status in ('forfeit')
        and user_id in ($3, $4)`,
    [season, week, MSWAN_LIVE, MSWAN_SEED],
  );
}

async function resolveClock(sql: Sql): Promise<{
  clock: Awaited<ReturnType<typeof nflClock>>;
  window: Awaited<ReturnType<typeof weekWindow>>;
}> {
  const clock = await nflClock();
  let window = await weekWindow(clock.season, clock.week);
  await settleSafe(sql, clock.season, clock.week);
  await expirePlaying(sql, clock.season, clock.week, window.open);
  if (window.done && clock.week < 18) {
    const next = { ...clock, week: clock.week + 1 };
    window = await weekWindow(next.season, next.week);
    await settleSafe(sql, next.season, next.week);
    await expirePlaying(sql, next.season, next.week, window.open);
    await reopenPatOnce(sql, next.season, next.week);
    await reopenMswanLate(sql, next.season, next.week);
    return { clock: next, window };
  }
  await reopenPatOnce(sql, clock.season, clock.week);
  await reopenMswanLate(sql, clock.season, clock.week);
  return { clock, window };
}

async function currentWeek(sql: Sql): Promise<{ clock: Awaited<ReturnType<typeof nflClock>>; week: WeekRow; window: Awaited<ReturnType<typeof weekWindow>> }> {
  const { clock, window } = await resolveClock(sql);
  const week = await ensureWeek(sql, clock.season, clock.week);
  return { clock, week, window };
}

export async function getWeeklyHandler({ context }: { context: { userId: string | null } }): Promise<WeeklyMeta> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    if (!context.userId) return metaFrom(week, "signed_out", null, window.live);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    const open = (window.open || mswanLateOk(week.season, week.week, context.userId, run)) && !week.awarded;
    return metaFrom(week, runStatus(run, open), run, window.live);
}

export async function claimWeeklyHandler({ context }: { context: { userId: string } }): Promise<WeeklyMeta> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    const open = (window.open || mswanLateOk(week.season, week.week, context.userId, run)) && !week.awarded;
    const status = runStatus(run, open);
    if (status === "done" || status === "forfeit" || status === "locked") {
      return metaFrom(week, status, run, window.live);
    }
    if (status === "open") {
      await sql.query(
        `insert into darkness_weekly_runs (season, week, user_id, status)
         values ($1, $2, $3, 'playing')
         on conflict (season, week, user_id) do nothing`,
        [week.season, week.week, context.userId],
      );
    }
    const next = await loadRun(sql, week.season, week.week, context.userId);
    return metaFrom(week, runStatus(next, open), next, window.live);
}

export async function forfeitWeeklyHandler({ context }: { context: { userId: string } }): Promise<WeeklyMeta> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    if (runStatus(run, true) === "playing") {
      await sql.query(
        `update darkness_weekly_runs
            set status = 'forfeit', finished_at = now()
          where season = $1 and week = $2 and user_id = $3 and status = 'playing'`,
        [week.season, week.week, context.userId],
      );
    }
    const next = await loadRun(sql, week.season, week.week, context.userId);
    return metaFrom(week, runStatus(next, window.open && !week.awarded), next, window.live);
}

function rebuildPicks(pack: WeeklyPackedBoard, weekNo: number, payload: { slot: string; id: string }[]): ElimPick[] | null {
  if (payload.length !== ELIM_SLOTS.length) return null;
  const season = playersFromPack(pack, weekNo);
  const used = new Set<string>();
  const picks: ElimPick[] = [];
  for (const slot of ELIM_SLOTS) {
    const row = payload.find((item) => item.slot === slot);
    if (!row) return null;
    const pos = slotPos(slot as ElimSlot);
    const player = season[pos].find((item) => item.id === row.id);
    if (!player || used.has(player.id)) return null;
    used.add(player.id);
    picks.push({ slot: slot as ElimSlot, pos, player, seat: 0 });
  }
  return picks;
}

export async function lockWeeklyHandler({ context, data }: { context: { userId: string }; data: { picks: WeeklyPickPayload[] } }): Promise<WeeklyMeta> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    const late = mswanLateOk(week.season, week.week, context.userId, run);
    const open = (window.open || late) && !week.awarded;
    if (runStatus(run, open) === "done") return metaFrom(week, "done", run, window.live);
    if (!open) {
      const next = await loadRun(sql, week.season, week.week, context.userId);
      return metaFrom(week, runStatus(next, false), next, window.live);
    }
    let pack = parseBoard(week.board);
    if (!pack) return metaFrom(week, "playing", run, window.live);
    pack = fillPackedOpponents(pack, window.games);
    if (late) pack = blockWeeklyTeams(pack, WEEK1_TNF_TEAMS);
    const picks = rebuildPicks(pack, week.week, data.picks);
    if (!picks) return metaFrom(week, "playing", run, window.live);
    if (late && picks.some((pick) => weeklyTeamBlocked(pick.player.team))) {
      return metaFrom(week, "playing", run, window.live);
    }
    const sids = sidMap(pack);
    const snap = weeklyPickPayload(picks, sids);
    await sql.query(
      `insert into darkness_weekly_runs (season, week, user_id, status)
       values ($1, $2, $3, 'playing')
       on conflict (season, week, user_id) do nothing`,
      [week.season, week.week, context.userId],
    );
    await sql.query(
      `update darkness_weekly_runs
          set status = 'done', score = null, payout_score = false, payout_win = false, picks = $4::jsonb, finished_at = now()
        where season = $1 and week = $2 and user_id = $3 and status = 'playing'`,
      [week.season, week.week, context.userId, JSON.stringify(snap)],
    );
    const next = await loadRun(sql, week.season, week.week, context.userId);
    return {
      ...metaFrom(week, runStatus(next, false), next, window.live),
      score: window.live ? (next?.score == null ? null : asNum(next.score)) : weeklyTotal(snap),
    };
}

export async function weeklyBoardPackHandler({ context }: { context: { userId: string } }): Promise<WeeklyBoardPack | null> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    const late = mswanLateOk(week.season, week.week, context.userId, run);
    const open = (window.open || late) && !week.awarded;
    if (runStatus(run, open) === "locked") return null;
    const pack = parseBoard(week.board);
    if (!pack) return null;
    const filled = fillPackedOpponents(pack, window.games);
    return {
      season: week.season,
      week: week.week,
      board: late ? blockWeeklyTeams(filled, WEEK1_TNF_TEAMS) : filled,
    };
}

export async function listWeeklyBoardHandler({ data }: { data: { season: number; week: number; peek?: boolean } }): Promise<WeeklyBoard> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    try {
      const { importLegacyHistory } = await import("./legacy-import.server");
      await importLegacyHistory(sql);
    } catch (err) {
      console.error("[darkness] legacy weekly import failed", err);
    }
    const { clock } = await resolveClock(sql);
    const season = data.season || clock.season;
    const weekNo = data.week || clock.week;
    if (!data.peek) await settleSafe(sql, season, weekNo);
    const week = await loadWeek(sql, season, weekNo);
    const window = await weekWindow(season, weekNo);
    if (!week) {
      return {
        season,
        week: weekNo,
        currentSeason: clock.season,
        currentWeek: clock.week,
        awarded: false,
        live: window.live,
        lockAt: window.lockAt,
        rows: [],
      };
    }
    const live = week.awarded || !window.live ? {} : await weeklyLiveStats(season, weekNo);
    const rows = await sql.query<{
      user_id: string;
      name: string | null;
      avatar_id: string | null;
      score: number | string | null;
      payout_score: boolean;
      payout_win: boolean;
      daily_stars: number | string | null;
      has_picks: boolean;
      picks: unknown;
    }>(
      `select r.user_id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
              p.avatar_id,
              r.score,
              r.payout_score,
              r.payout_win,
              p.daily_stars,
              (r.picks is not null) as has_picks,
              r.picks
         from darkness_weekly_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.season = $1 and r.week = $2 and r.status = 'done'
        order by r.finished_at asc`,
      [season, weekNo],
    );
    const ranked = rows
      .map((row) => {
        const picks = hydrateWeeklyPicks(row.picks, live, window.live ? "zero" : "stored");
        const score = week.awarded
          ? asNum(row.score)
          : window.live
            ? weeklyTotal(picks)
            : 0;
        return {
          id: row.user_id,
          name: clipDisplayName(row.name ?? "") || "GM",
          avatarId: clampAvatar(row.avatar_id ?? "poor"),
          score,
          paid: Boolean(row.payout_score),
          winner: Boolean(week.awarded && row.payout_win),
          stars: Math.max(0, Math.floor(Number(row.daily_stars) || 0)),
          hasPicks: Boolean(row.has_picks),
        };
      })
      .sort((a, b) =>
        week.awarded || window.live ? b.score - a.score || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
      );
    return {
      season,
      week: weekNo,
      currentSeason: clock.season,
      currentWeek: clock.week,
      awarded: Boolean(week.awarded),
      live: window.live,
      lockAt: asTime(week.lock_at),
      rows: ranked,
    };
}

export async function getWeeklyLineupHandler({ context, data }: { context: { userId: string | null }; data: { season: number; week: number; userId: string } }): Promise<WeeklyLineup | null> {
    if (!data.userId) return null;
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const clock = await nflClock();
    const season = data.season || clock.season;
    const weekNo = data.week || clock.week;
    const week = await loadWeek(sql, season, weekNo);
    if (!week) return null;
    const window = await weekWindow(season, weekNo);
    if (!canViewWeeklyLineup(week.awarded, window.live, context.userId, data.userId)) return null;
    const rows = await sql.query<{ name: string | null; picks: unknown; score: number | string | null }>(
      `select coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
              r.picks, r.score
         from darkness_weekly_runs r
         left join player_profiles p on p.user_id = r.user_id
         left join "user" u on u.id = r.user_id
        where r.season = $1 and r.week = $2 and r.user_id = $3 and r.status = 'done'`,
      [season, weekNo, data.userId],
    );
    const row = rows[0];
    if (!row) return null;
    const live = week.awarded || !window.live ? {} : await weeklyLiveStats(season, weekNo);
    const pack = parseBoard(week.board);
    const picks = hydrateWeeklyPicks(row.picks, live, window.live ? "zero" : "stored");
    return {
      season,
      week: weekNo,
      name: clipDisplayName(row.name ?? "") || "GM",
      score: week.awarded
        ? asNum(row.score)
        : weeklyTotal(window.live ? picks : withPackedProjections(picks, pack)),
      live: window.live,
      awarded: Boolean(week.awarded),
      picks: window.live || week.awarded ? picks : withPackedProjections(picks, pack),
    };
}

export async function resumeWeeklyHandler({ context }: { context: { userId: string } }): Promise<WeeklyResume | null> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    if (!run || run.status !== "done") return null;
    const pack = parseBoard(week.board);
    const live = week.awarded || !window.live ? {} : await weeklyLiveStats(week.season, week.week);
    const picks = fillSnapOpponents(
      hydrateWeeklyPicks(run.picks, live, window.live ? "zero" : "stored"),
      weekOpponents(window.games),
    );
    const shown = week.awarded
      ? asNum(run.score)
      : weeklyTotal(window.live ? picks : withPackedProjections(picks, pack));
    return {
      season: week.season,
      week: week.week,
      live: window.live,
      awarded: Boolean(week.awarded),
      score: shown,
      paid: Boolean(run.payout_score),
      winner: Boolean(run.payout_win),
      picks: window.live || week.awarded ? picks : withPackedProjections(picks, pack),
    };
}

export async function listSeasonBoardHandler({ data }: { data: { season: number } }): Promise<SeasonBoard> {
  const sql = await getSql();
  await ensureWeeklyTables(sql);
  const { clock } = await resolveClock(sql);
  const season = data.season || clock.season;
  const window = await weekWindow(clock.season, clock.week);
  const rows = await sql.query<{
    user_id: string;
    name: string | null;
    avatar_id: string | null;
    score: number | string | null;
    weeks: number | string | null;
  }>(
    `select r.user_id,
            max(coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM')) as name,
            max(p.avatar_id) as avatar_id,
            coalesce(sum(r.score), 0) as score,
            count(r.score)::int as weeks
       from darkness_weekly_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.season = $1 and r.status = 'done' and r.score is not null
      group by r.user_id
      order by coalesce(sum(r.score), 0) desc, max(coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM'))`,
    [season],
  );
  const merged = new Map(
    rows.map((row) => [
      row.user_id,
      {
        id: row.user_id,
        name: clipDisplayName(row.name ?? "") || "GM",
        avatarId: clampAvatar(row.avatar_id ?? "poor"),
        score: asNum(row.score),
        weeks: Math.max(0, Math.floor(Number(row.weeks) || 0)),
      },
    ]),
  );
  if (window.live && season === clock.season) {
    const week = await loadWeek(sql, clock.season, clock.week);
    if (week && !week.awarded) {
      const live = await weeklyLiveStats(clock.season, clock.week);
      const liveRuns = await sql.query<{
        user_id: string;
        name: string | null;
        avatar_id: string | null;
        picks: unknown;
        score: number | string | null;
      }>(
        `select r.user_id,
                coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
                p.avatar_id,
                r.picks,
                r.score
           from darkness_weekly_runs r
           left join player_profiles p on p.user_id = r.user_id
           left join "user" u on u.id = r.user_id
          where r.season = $1 and r.week = $2 and r.status = 'done' and r.score is null`,
        [clock.season, clock.week],
      );
      for (const row of liveRuns) {
        const pts = weeklyTotal(hydrateWeeklyPicks(row.picks, live, "zero"));
        const prev = merged.get(row.user_id);
        if (prev) {
          prev.score = Math.round((prev.score + pts) * 10) / 10;
          prev.weeks += 1;
        } else {
          merged.set(row.user_id, {
            id: row.user_id,
            name: clipDisplayName(row.name ?? "") || "GM",
            avatarId: clampAvatar(row.avatar_id ?? "poor"),
            score: pts,
            weeks: 1,
          });
        }
      }
    }
  }
  return {
    season,
    currentSeason: clock.season,
    currentWeek: clock.week,
    live: window.live,
    rows: [...merged.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
  };
}
