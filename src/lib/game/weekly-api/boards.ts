/** Weekly boards, lineup, and pack. Move-only from weekly-api.server. */
import { clampAvatar } from "../avatars";
import { clipDisplayName, isHiddenBoardId, isHiddenBoardName } from "../stats-shared";
import {
  WEEK1_TNF_TEAMS,
  applyWeeklyMigrationBoard,
  blockWeeklyTeams,
  canViewWeeklyLineup,
  hydrateWeeklyPicks,
  weeklyTotal,
  withPackedProjections,
  isSundaySlateWeek,
  weeklyDraftOpensAt,
} from "../weekly";
import { attachFinishedWeekActuals, fillPackedOpponents, nflClock, weekWindow, weeklyLiveStats } from "../weekly-sleeper";
import type { SeasonBoard, WeeklyBoard, WeeklyBoardPack, WeeklyBoardRow, WeeklyLineup } from "../weekly-api-types";
import { currentWeek, mswanLateOk, resolveClock } from "./clock";
import {
  floorEligibleRun,
  floorFace,
  loadSeasonDoneRuns,
  skipWeeklyFloorName,
  usableFloorPts,
  weekBoardIds,
  weekFinishedOwn,
  weekFloorMin,
  type SeasonDoneRun,
} from "./floor";
import { settleSafe } from "./settle";
import { asNum, asTime, parseBoard, runStatus } from "./shared";
import { ensureWeeklyTables, getSql, loadRun, loadWeek } from "./tables";

function rankWeeklyBoard(a: WeeklyBoardRow, b: WeeklyBoardRow, byScore: boolean): number {
  if (byScore) {
    const score = (b.score ?? 0) - (a.score ?? 0);
    if (score) return score;
    const floor = Number(Boolean(a.floor)) - Number(Boolean(b.floor));
    if (floor) return floor;
  }
  return a.name.localeCompare(b.name);
}

export async function weeklyBoardPackHandler({ context }: { context: { userId: string } }): Promise<WeeklyBoardPack | null> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    const { week, window } = await currentWeek(sql);
    const run = await loadRun(sql, week.season, week.week, context.userId);
    const late = mswanLateOk(week.season, week.week, context.userId, run);
    const open = (window.open || late) && !week.awarded;
    const opensAt = isSundaySlateWeek(week.season, week.week) ? weeklyDraftOpensAt(asTime(week.lock_at)) : 0;
    const keep = run?.status === "playing" || run?.status === "done";
    if (opensAt > 0 && Date.now() < opensAt && !keep) return null;
    if (runStatus(run, open) === "locked") return null;
    const pack = parseBoard(week.board);
    if (!pack) return null;
    const filled = applyWeeklyMigrationBoard(fillPackedOpponents(pack, window.games), week.season, week.week);
    const board = await attachFinishedWeekActuals(
      late ? blockWeeklyTeams(filled, WEEK1_TNF_TEAMS) : filled,
      week.season,
      week.week,
    );
    return {
      season: week.season,
      week: week.week,
      board,
    };
}

export async function listWeeklyBoardHandler({ data }: { data: { season: number; week: number; peek?: boolean } }): Promise<WeeklyBoard> {
    const sql = await getSql();
    await ensureWeeklyTables(sql);
    try {
      const { importLegacyHistory } = await import("../legacy-import.server");
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
            : null;
        const name = clipDisplayName(row.name ?? "") || "GM";
        if (window.live) {
          void import("../board-feats.server")
            .then(({ maybeGrantHeavyHitter, maybeGrantIronBoot }) =>
              Promise.all([
                maybeGrantHeavyHitter(sql, row.user_id, season, weekNo, picks),
                maybeGrantIronBoot(sql, row.user_id, season, weekNo, picks, live),
              ]),
            )
            .catch((err) => console.error("[darkness] weekly live feat failed", err));
        }
        if (isHiddenBoardId(row.user_id) || isHiddenBoardName(name) || isHiddenBoardName(row.name)) return null;
        return {
          id: row.user_id,
          name,
          avatarId: clampAvatar(row.avatar_id ?? "poor"),
          score,
          paid: Boolean(row.payout_score),
          winner: Boolean(week.awarded && row.payout_win),
          stars: Math.max(0, Math.floor(Number(row.daily_stars) || 0)),
          hasPicks: Boolean(row.has_picks),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => rankWeeklyBoard(a, b, week.awarded || window.live));
    if (window.live) {
      void import("../board-feats.server")
        .then(({ maybeGrantFlashWeek, maybeGrantMirrorWeek }) =>
          Promise.all([
            maybeGrantFlashWeek(
              sql,
              season,
              weekNo,
              ranked.flatMap((row) => (typeof row.score === "number" ? [{ userId: row.id, score: row.score }] : [])),
            ),
            maybeGrantMirrorWeek(sql, season, weekNo),
          ]),
        )
        .catch((err) => console.error("[darkness] flash live failed", err));
    }
    if (await weekFinishedOwn(Boolean(week.awarded), season, weekNo, clock, window)) {
      const seasonRuns = await loadSeasonDoneRuns(sql, season);
      const floorScore = weekFloorMin(ranked.filter((row): row is WeeklyBoardRow & { score: number } => typeof row.score === "number"));
      if (floorScore != null) {
        const onBoard = new Set([...ranked.map((row) => row.id), ...weekBoardIds(seasonRuns, weekNo)]);
        for (const row of seasonRuns) {
          if (!floorEligibleRun(row) || onBoard.has(row.user_id)) continue;
          onBoard.add(row.user_id);
          ranked.push({ ...floorFace(row), score: floorScore });
        }
        ranked.sort((a, b) => rankWeeklyBoard(a, b, true));
      }
    }
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
    rows.flatMap((row) => {
      const name = clipDisplayName(row.name ?? "") || "GM";
      if (isHiddenBoardId(row.user_id) || isHiddenBoardName(name) || isHiddenBoardName(row.name)) return [];
      return [[
        row.user_id,
        {
          id: row.user_id,
          name,
          avatarId: clampAvatar(row.avatar_id ?? "poor"),
          score: asNum(row.score),
          weeks: Math.max(0, Math.floor(Number(row.weeks) || 0)),
        },
      ] as const];
    }),
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
        if (isHiddenBoardId(row.user_id) || isHiddenBoardName(row.name)) continue;
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
  const weekRows = await sql.query<{ week: number; awarded: boolean }>(
    `select week, awarded from darkness_weekly_weeks where season = $1`,
    [season],
  );
  const seasonRuns = await loadSeasonDoneRuns(sql, season);
  const eligible = new Map<string, SeasonDoneRun>();
  for (const row of seasonRuns) {
    if (!floorEligibleRun(row)) continue;
    if (!eligible.has(row.user_id)) eligible.set(row.user_id, row);
  }
  for (const week of weekRows) {
    const own =
      season === clock.season && week.week === clock.week
        ? window
        : null;
    if (!(await weekFinishedOwn(Boolean(week.awarded), season, week.week, clock, own))) continue;
    const shown: { hasPicks: boolean; score: number }[] = [];
    for (const row of seasonRuns) {
      if (row.week !== week.week) continue;
      const name = clipDisplayName(row.name ?? "") || "GM";
      if (skipWeeklyFloorName(name, row.user_id) || skipWeeklyFloorName(row.name, row.user_id)) continue;
      const stored = usableFloorPts(row.score);
      const computed =
        stored ?? usableFloorPts(weeklyTotal(hydrateWeeklyPicks(row.picks, {}, "stored")));
      if (computed == null) continue;
      shown.push({ hasPicks: true, score: computed });
    }
    const floorScore = weekFloorMin(shown);
    if (floorScore == null) continue;
    const onBoard = weekBoardIds(seasonRuns, week.week);
    for (const [id, face] of eligible) {
      if (onBoard.has(id)) continue;
      const name = clipDisplayName(face.name ?? "") || "GM";
      const prev = merged.get(id);
      if (prev) {
        prev.score = Math.round((prev.score + floorScore) * 10) / 10;
      } else {
        merged.set(id, {
          id,
          name,
          avatarId: clampAvatar(face.avatar_id ?? "poor"),
          score: floorScore,
          weeks: 0,
        });
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
