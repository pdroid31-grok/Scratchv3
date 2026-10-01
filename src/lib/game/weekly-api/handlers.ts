/** Weekly get, claim, forfeit, save, lock, resume. Move-only from weekly-api.server. */
import type { ElimPick } from "../elim";
import { ELIM_SLOTS, slotPos, type ElimSlot } from "../elim-data";
import {
  WEEK1_TNF_TEAMS,
  applyWeeklyMigrationBoard,
  blockWeeklyTeams,
  clipWeeklyPickIds,
  fillSnapOpponents,
  hydrateWeeklyPicks,
  weeklyPickPayload,
  weeklyTeamBlocked,
  weeklyTotal,
  withPackedProjections,
  isSundaySlateWeek,
  weeklyDraftOpensAt,
  type WeeklyPackedBoard,
} from "../weekly";
import { fillPackedOpponents, playersFromPack, sidMap, weekOpponents, weeklyLiveStats } from "../weekly-sleeper";
import type { WeeklyMeta, WeeklyPickPayload, WeeklyResume, WeeklyStatus } from "../weekly-api-types";
import { currentWeek, mswanLateOk } from "./clock";
import { asNum, asTime, parseBoard, runStatus, type RunRow, type WeekRow } from "./shared";
import { ensureWeeklyTables, getSql, loadRun } from "./tables";

function metaFrom(week: WeekRow, status: WeeklyStatus, run: RunRow | null, live: boolean): WeeklyMeta {
  const lockAt = asTime(week.lock_at);
  const opensAt = isSundaySlateWeek(week.season, week.week) ? weeklyDraftOpensAt(lockAt) : 0;
  const gated =
    opensAt > 0 &&
    Date.now() < opensAt &&
    status !== "done" &&
    status !== "playing" &&
    status !== "forfeit" &&
    status !== "locked";
  return {
    season: week.season,
    week: week.week,
    status: gated ? "gated" : status,
    lockAt,
    endAt: asTime(week.end_at),
    opensAt,
    gated,
    live,
    awarded: Boolean(week.awarded),
    score: run?.score == null ? null : asNum(run.score),
    paid: Boolean(run?.payout_score),
    winner: Boolean(run?.payout_win),
    picks: status === "playing" ? clipWeeklyPickIds(run?.picks) : [],
  };
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
    const gated = isSundaySlateWeek(week.season, week.week) && Date.now() < weeklyDraftOpensAt(asTime(week.lock_at));
    if (status === "open" && !gated) {
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

export async function saveWeeklyDraftHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { picks: WeeklyPickPayload[] };
}): Promise<WeeklyMeta> {
  const sql = await getSql();
  await ensureWeeklyTables(sql);
  const { week, window } = await currentWeek(sql);
  const run = await loadRun(sql, week.season, week.week, context.userId);
  const open = (window.open || mswanLateOk(week.season, week.week, context.userId, run)) && !week.awarded;
  const status = runStatus(run, open);
  if (status !== "playing") return metaFrom(week, status, run, window.live);
  const payload = clipWeeklyPickIds(data.picks);
  await sql.query(
    `update darkness_weekly_runs
        set picks = $4::jsonb,
            status = 'playing'
      where season = $1 and week = $2 and user_id = $3 and status = 'playing'`,
    [week.season, week.week, context.userId, JSON.stringify(payload)],
  );
  const next = await loadRun(sql, week.season, week.week, context.userId);
  return metaFrom(week, runStatus(next, open), next, window.live);
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
    pack = applyWeeklyMigrationBoard(fillPackedOpponents(pack, window.games), week.season, week.week);
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
    try {
      const { maybeGrantMirrorWeek, maybeGrantThreeHeaded } = await import("../board-feats.server");
      await maybeGrantThreeHeaded(
        sql,
        context.userId,
        snap.map((pick) => pick.team),
      );
      await maybeGrantMirrorWeek(sql, week.season, week.week);
    } catch (err) {
      console.error("[darkness] weekly lock feat failed", err);
    }
    const next = await loadRun(sql, week.season, week.week, context.userId);
    return {
      ...metaFrom(week, runStatus(next, false), next, window.live),
      score: window.live ? (next?.score == null ? null : asNum(next.score)) : weeklyTotal(snap),
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
