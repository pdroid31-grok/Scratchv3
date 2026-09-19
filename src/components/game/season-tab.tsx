"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { avatarById } from "@/lib/game/avatars";
import { getWeeklyLineup, listSeasonBoard, listWeeklyBoard, type SeasonBoard, type WeeklyBoard, type WeeklyBoardRow, type WeeklyLineup } from "@/lib/game/weekly-api";
import { canViewWeeklyLineup } from "@/lib/game/weekly";
import { WeeklyLineupSheet } from "@/components/game/weekly-lineup";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const SEASON_YEAR = 2026;
const LAST_WEEK = 17;
const WEEK_VIEW_KEY = "darkness-season-week-view";
const WEEK_FOCUS_KEY = "darkness-season-board-focus";

function openWeekOf(current: number): number {
  return Math.min(LAST_WEEK, Math.max(1, current || 1));
}

function readWeekView(): "list" | "board" {
  try {
    return localStorage.getItem(WEEK_VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
}

export function writeWeekView(view: "list" | "board") {
  try {
    localStorage.setItem(WEEK_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

export function markSeasonBoardFocus(userId: string) {
  try {
    sessionStorage.setItem(WEEK_FOCUS_KEY, userId);
  } catch {
    /* ignore */
  }
}

function takeSeasonBoardFocus(): string | null {
  try {
    const id = sessionStorage.getItem(WEEK_FOCUS_KEY);
    sessionStorage.removeItem(WEEK_FOCUS_KEY);
    return id;
  } catch {
    return null;
  }
}

export function SeasonTab() {
  const [pane, setPane] = useState<"weeks" | "season">("weeks");

  return (
    <section className="mt-5 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Season</p>
      <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">2026 Season</h2>
      <div
        className="mx-auto mt-4 flex aspect-square w-full max-w-28 flex-col items-center justify-center rounded-xl bg-black shadow-[var(--shadow-border)]"
        aria-label="2026 Champ locked"
      >
        <span className="font-display text-3xl font-semibold leading-none text-white">?</span>
        <span className="mt-2 font-display text-[11px] font-semibold uppercase tracking-wide text-white">2026 Champ</span>
      </div>
      <p className="mx-auto mt-3 max-w-sm text-center text-sm text-muted">
        The player who scores the most cumulative weekly points at the end of the season wins the 2026 Champ Avatar
      </p>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
        {(
          [
            { id: "weeks" as const, label: "Weeks" },
            { id: "season" as const, label: "Season" },
          ] as const
        ).map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setPane(row.id)}
            className={cn(
              "h-11 rounded-md font-display text-xs font-semibold uppercase tracking-wider sm:text-sm",
              pane === row.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      {pane === "weeks" ? <WeeklyWeekBoard seasonViews startAtCurrent /> : <SeasonPane />}
    </section>
  );
}

export function WeeklyWeekBoard({
  peekLineups = false,
  seasonViews = false,
  startAtCurrent = false,
}: {
  peekLineups?: boolean;
  seasonViews?: boolean;
  startAtCurrent?: boolean;
}) {
  const { user } = useCurrentUserState();
  const [week, setWeek] = useState(startAtCurrent ? 0 : 1);
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">(readWeekView);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = () =>
      listWeeklyBoard({ data: { season: SEASON_YEAR, week } })
        .then((next) => {
          if (stop) return;
          setBoard(next);
          const open = openWeekOf(next.currentWeek);
          setWeek((prev) => (prev < 1 || prev > open ? open : prev));
          if (next.live && !timer) {
            timer = setInterval(() => {
              void load();
            }, 30_000);
          }
        })
        .catch(() => {
          if (stop) return;
          if (startAtCurrent && week < 1) return;
          setBoard({
            season: SEASON_YEAR,
            week,
            currentSeason: SEASON_YEAR,
            currentWeek: 1,
            awarded: false,
            live: false,
            lockAt: 0,
            rows: [],
          });
        });
    void load();
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, [week]);

  const open = openWeekOf(board?.currentWeek ?? 1);
  const weeks = useMemo(() => Array.from({ length: open }, (_, i) => i + 1), [open]);
  const weekReady = !startAtCurrent || (Boolean(board) && week >= 1);
  const viewWeek = weekReady ? Math.min(week, open) : 0;
  const locked = Boolean(board && (board.live || board.awarded));
  const teams = board?.rows.filter((row) => row.hasPicks) ?? [];

  function setSeasonView(next: "list" | "board") {
    setView(next);
    writeWeekView(next);
  }

  return (
    <div className="mt-3">
      <div className={cn("grid gap-3", seasonViews && locked ? "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" : "")}>
        <label className="grid gap-1">
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted">Week</span>
          {weekReady ? (
            <select
              className="h-11 rounded-md bg-bg px-3 font-display text-sm font-semibold uppercase tracking-wide text-fg shadow-[var(--shadow-border)]"
              value={viewWeek}
              onChange={(event) => setWeek(Number(event.target.value) || 1)}
            >
              {weeks.map((n) => (
                <option key={n} value={n}>
                  Week {n}
                </option>
              ))}
            </select>
          ) : (
            <div className="h-11 animate-pulse rounded-md bg-bg shadow-[var(--shadow-border)]" aria-hidden />
          )}
        </label>
        {seasonViews && locked ? (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
            {(
              [
                { id: "list" as const, label: "List" },
                { id: "board" as const, label: "Board" },
              ] as const
            ).map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSeasonView(row.id)}
                className={cn(
                  "h-11 min-w-20 rounded-md font-display text-xs font-semibold uppercase tracking-wider",
                  view === row.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {row.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        {board === null ? (
          <div className="h-40 animate-pulse rounded-md bg-bg" />
        ) : board.rows.length === 0 ? (
          <p className="text-sm text-muted">No one has locked a lineup this week yet.</p>
        ) : seasonViews && locked && view === "board" ? (
          <SeasonTeamPager
            season={board.season}
            week={board.week}
            rows={teams}
            onBack={() => setSeasonView("list")}
          />
        ) : (
          <ol className="grid gap-1.5">
            {board.rows.map((row, index) => {
              const canPeek = seasonViews
                ? locked && row.hasPicks
                : peekLineups && row.hasPicks && canViewWeeklyLineup(board.awarded, board.live, user?.id, row.id);
              return (
                <li key={row.id} className="flex items-stretch overflow-hidden rounded-md bg-bg shadow-[var(--shadow-border)]">
                  <Link
                    to="/player/$id"
                    params={{ id: row.id }}
                    className="min-w-0 flex-1 px-3 py-2.5 hover:shadow-[var(--shadow-border-hover)]"
                  >
                    <WeekRowBody row={row} place={index + 1} />
                  </Link>
                  {canPeek ? (
                    <button
                      type="button"
                      aria-label={`View ${row.name} lineup`}
                      className="inline-flex w-11 shrink-0 items-center justify-center text-muted hover:bg-surface-2 hover:text-fg"
                      onClick={() => setPeek(row.id)}
                    >
                      <Search className="size-4" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {peek && board ? (
        <WeeklyLineupSheet
          season={board.season}
          week={board.week}
          userId={peek}
          onClose={() => setPeek(null)}
        />
      ) : null}
    </div>
  );
}

function WeekRowBody({ row, place }: { row: WeeklyBoardRow; place: number }) {
  return (
    <span className="flex items-center gap-3">
      <span className="w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-subtle">
        {place}
      </span>
      <img
        src={avatarById(row.avatarId).src}
        alt=""
        className="size-9 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
          {row.name}
        </span>
        <span className="mt-0.5 block text-xs tabular-nums text-muted">
          {row.score.toFixed(1)}
          {row.floor ? "*" : ""}
        </span>
      </span>
    </span>
  );
}

function SeasonTeamPager({
  season,
  week,
  rows,
  onBack,
}: {
  season: number;
  week: number;
  rows: WeeklyBoardRow[];
  onBack: () => void;
}) {
  const [page, setPage] = useState(0);
  const [cards, setCards] = useState<Record<string, WeeklyLineup | null>>({});
  const startX = useRef<number | null>(null);
  const ids = rows.map((row) => row.id).join("|");
  const focusRef = useRef(takeSeasonBoardFocus());

  useEffect(() => {
    const id = focusRef.current;
    focusRef.current = null;
    const list = ids.split("|").filter(Boolean);
    if (!id) {
      setPage(0);
      return;
    }
    const i = list.indexOf(id);
    setPage(i >= 0 ? i : 0);
  }, [season, week, ids]);

  useEffect(() => {
    if (!ids) return;
    let live = true;
    void Promise.all(
      ids.split("|").filter(Boolean).map((userId) =>
        getWeeklyLineup({ data: { season, week, userId } })
          .then((lineup) => [userId, lineup] as const)
          .catch(() => [userId, null] as const),
      ),
    ).then((pairs) => {
      if (!live) return;
      setCards((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [season, week, ids]);

  const max = Math.max(0, rows.length - 1);
  const go = (next: number) => setPage(Math.max(0, Math.min(max, next)));
  const current = rows[Math.min(page, max)];

  if (!current) return <p className="text-sm text-muted">No locked lineups this week.</p>;

  return (
    <div
      onTouchStart={(event) => {
        startX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (startX.current == null) return;
        const dx = (event.changedTouches[0]?.clientX ?? startX.current) - startX.current;
        startX.current = null;
        if (dx < -40) go(page + 1);
        if (dx > 40) go(page - 1);
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-11 shrink-0 rounded-md px-3 font-display text-xs font-semibold uppercase tracking-wider text-fg hover:bg-surface-2"
          onClick={onBack}
        >
          List
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img
            src={avatarById(current.avatarId).src}
            alt=""
            className="size-9 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold uppercase tracking-wide text-fg">{current.name}</p>
            <p className="text-[0.9625rem] tabular-nums leading-tight text-white">
              #{page + 1} · {(cards[current.id]?.score ?? current.score).toFixed(1)}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-fg hover:bg-surface-2 disabled:opacity-30"
          aria-label="Previous team"
          disabled={page <= 0}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-fg hover:bg-surface-2 disabled:opacity-30"
          aria-label="Next team"
          disabled={page >= max}
          onClick={() => go(page + 1)}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg bg-bg shadow-[var(--shadow-border)]">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.25rem_3.25rem] gap-2 px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
          <span>Slot</span>
          <span>Player</span>
          <span className="text-right">$</span>
          <span className="text-right">Pts</span>
        </div>
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {rows.map((row) => {
              const lineup = cards[row.id];
              const picks = lineup?.picks;
              return (
                <div key={row.id} className="w-full shrink-0">
                  {lineup === undefined ? (
                    <div className="h-40 animate-pulse bg-surface-2/40" />
                  ) : !picks || picks.length === 0 ? (
                    <p className="px-3 py-6 text-sm text-muted">No lineup saved for this run.</p>
                  ) : (
                    <ol>
                      {picks.map((pick) => (
                        <li
                          key={pick.slot}
                          className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.25rem_3.25rem] items-center gap-2 border-t border-border px-3 py-2.5"
                        >
                          <span className="font-display text-[10px] font-semibold uppercase tracking-wide text-subtle">
                            {pick.slot}
                          </span>
                          <span className="min-w-0 truncate text-sm text-fg">{pick.name}</span>
                          <span className="text-right text-xs tabular-nums text-muted">${pick.cost}</span>
                          <span className="text-right font-display text-sm font-semibold tabular-nums text-fg">
                            {pick.score.toFixed(1)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SeasonPane() {
  const [board, setBoard] = useState<SeasonBoard | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = () =>
      listSeasonBoard({ data: { season: SEASON_YEAR } })
        .then((next) => {
          if (stop) return;
          setBoard(next);
          if (next.live && !timer) {
            timer = setInterval(() => {
              void load();
            }, 30_000);
          }
        })
        .catch(() => {
          if (stop) return;
          setBoard({ season: SEASON_YEAR, currentSeason: SEASON_YEAR, currentWeek: 1, live: false, rows: [] });
        });
    void load();
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div className="mt-3">
      <p className="text-sm text-muted">Cumulative weekly points · 2026</p>
      <div className="mt-3">
        {board === null ? (
          <div className="h-40 animate-pulse rounded-md bg-bg" />
        ) : board.rows.length === 0 ? (
          <p className="text-sm text-muted">No weekly scores yet.</p>
        ) : (
          <ol className="grid gap-1.5">
            {board.rows.map((row, index) => (
              <li key={row.id}>
                <Link
                  to="/player/$id"
                  params={{ id: row.id }}
                  className="flex items-center gap-3 rounded-md bg-bg px-3 py-2.5 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
                >
                  <span className="w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-subtle">
                    {index + 1}
                  </span>
                  <img
                    src={avatarById(row.avatarId).src}
                    alt=""
                    className="size-9 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                      {row.name}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted">{row.score.toFixed(1)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}