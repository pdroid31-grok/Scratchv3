"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Search, Star } from "lucide-react";
import { RankSwipe, LEADERBOARD_TABS, type RankTabId } from "@/components/game/rank-tabs";
import { DailyLineupSheet } from "@/components/game/daily-lineup";
import { WeeklyWeekBoard } from "@/components/game/season-tab";
import { YesterdayWinner } from "@/components/game/yesterday-winner";
import { DailyLeagueChat } from "@/components/game/daily-league-chat";
import { avatarById } from "@/lib/game/avatars";
import type { BoardRow, Leaderboard as Boards } from "@/lib/game/stats";
import { listDailyBoard, type DailyBoard } from "@/lib/game/daily-api";
import { DAILY_LAUNCH, canViewDailyLineup, dailyDayStamp, formatDailyDate, isDailyDay } from "@/lib/game/daily";
import { isLeaderboardTab } from "@/lib/game/rank-tabs";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const empty: Boards = { total: [], auction: [], elimination: [], score: [], stars: [] };

function hasRows(boards: Boards | null | undefined): boolean {
  if (!boards) return false;
  return boards.total.length > 0 || boards.auction.length > 0 || boards.elimination.length > 0;
}

async function fetchBoards(): Promise<Boards> {
  const res = await fetch("/api/rankings", { credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error("rankings failed");
  const data = (await res.json()) as Boards;
  if (!data || !Array.isArray(data.total) || !Array.isArray(data.auction) || !Array.isArray(data.elimination)) {
    throw new Error("rankings shape");
  }
  return {
    ...data,
    score: Array.isArray(data.score) ? data.score : [],
    stars: Array.isArray(data.stars) ? data.stars : [],
  };
}

export function Leaderboard({
  board = "daily",
  initial = null,
}: {
  board?: RankTabId;
  initial?: Boards | null;
}) {
  const start = isLeaderboardTab(board) ? board : "daily";
  const [tab, setTab] = useState<RankTabId>(start);
  const [boards, setBoards] = useState<Boards | null>(hasRows(initial) ? initial : null);

  useEffect(() => {
    setTab(isLeaderboardTab(board) ? board : "daily");
  }, [board]);

  useEffect(() => {
    let live = true;
    void fetchBoards()
      .then((next) => {
        if (live) setBoards(next);
      })
      .catch(() => {
        if (live) setBoards((prev) => prev ?? empty);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="mt-5 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
      {tab === "daily" ? (
        <YesterdayWinner size="rank" />
      ) : (
        <>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Rankings</p>
          <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">
            {tab === "weekly" ? "Weekly" : tab === "stars" ? "Stars" : "Total"}
          </h2>
        </>
      )}
      <RankSwipe key={start} initial={start} tabs={LEADERBOARD_TABS} onTab={setTab}>
        {(id) =>
          id === "daily" ? (
            <DailyPane />
          ) : id === "weekly" ? (
            <WeeklyWeekBoard peekLineups />
          ) : id === "stars" ? (
            <BoardList
              rows={boards ? boards.stars : null}
              loading={boards === null}
              empty={LEADERBOARD_TABS.find((row) => row.id === id)?.empty ?? "No daily wins yet."}
              board="stars"
              metric="stars"
            />
          ) : (
            <BoardList
              rows={boards ? boards.total : null}
              loading={boards === null}
              empty={LEADERBOARD_TABS.find((row) => row.id === id)?.empty ?? "No matches yet."}
              board="total"
              metric="wins"
            />
          )
        }
      </RankSwipe>
    </section>
  );
}

function DailyPane() {
  const today = dailyDayStamp();
  const { user } = useCurrentUserState();
  const [day, setDay] = useState(today);
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listDailyBoard({ data: { day } })
      .then((next) => {
        if (live) setBoard(next);
      })
      .catch(() => {
        if (live) setBoard({ day, year: 0, week: null, awarded: false, winnerId: null, rows: [] });
      });
    return () => {
      live = false;
    };
  }, [day]);

  const top = board?.rows[0]?.score ?? 0;
  const past = day < today;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-muted">
          {formatDailyDate(day)}
          {board?.year ? ` · ${board.year}` : ""}
          {past && board?.week ? ` · week ${board.week}` : ""}
        </p>
        <div className="flex shrink-0 items-center">
          <DailyLeagueChat />
          <button
            type="button"
            aria-label="Pick a day"
            className="inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-2"
            onClick={() => setCalOpen((open) => !open)}
          >
            <CalendarDays className="size-5" />
          </button>
        </div>
      </div>
      {calOpen ? <DayPicker day={day} today={today} onPick={(next) => { setDay(next); setCalOpen(false); }} /> : null}
      <div className="mt-3">
        {board === null ? (
          <div className="h-40 animate-pulse rounded-md bg-bg" />
        ) : board.rows.length === 0 ? (
          <p className="text-sm text-muted">
            {past && !board.year ? "No daily on that date." : "No one has finished this daily yet."}
          </p>
        ) : (
          <ol className="grid gap-1.5">
            {board.rows.map((row, index) => {
              const width = top > 0 ? Math.max(8, Math.round((row.score / top) * 100)) : 8;
              const canPeek = row.hasPicks && canViewDailyLineup(day, today, user?.id, row.id);
              return (
                <li key={row.id} className="flex items-stretch overflow-hidden rounded-md bg-bg shadow-[var(--shadow-border)]">
                  <Link
                    to="/player/$id"
                    params={{ id: row.id }}
                    search={{ board: "daily" }}
                    className="min-w-0 flex-1 px-3 py-2.5 hover:shadow-[var(--shadow-border-hover)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-subtle">
                        {index + 1}
                      </span>
                      <img
                        src={avatarById(row.avatarId).src}
                        alt=""
                        className="size-9 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="block min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                            {row.name}
                          </span>
                          {row.winner ? <Star className="size-3.5 shrink-0 text-accent" fill="currentColor" /> : null}
                          <span className="inline-flex shrink-0 items-center gap-1 font-display text-xs font-semibold tabular-nums text-fg">
                            <Star className="size-3 text-accent" fill="currentColor" />
                            {row.stars}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-muted">{row.score.toFixed(1)}</span>
                      </span>
                    </div>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full bg-turf/80" style={{ width: `${width}%` }} />
                    </span>
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
      {peek ? <DailyLineupSheet day={day} userId={peek} onClose={() => setPeek(null)} /> : null}
    </div>
  );
}

function DayPicker({
  day,
  today,
  onPick,
}: {
  day: string;
  today: string;
  onPick: (day: string) => void;
}) {
  const [cursor, setCursor] = useState(day.slice(0, 7));
  const cells = useMemo(() => monthCells(cursor), [cursor]);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${cursor}-01T00:00:00Z`),
  );

  return (
    <div className="mt-3 rounded-lg bg-bg p-3 shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:text-fg"
          onClick={() => setCursor(shiftMonth(cursor, -1))}
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-fg">{label}</p>
        <button
          type="button"
          aria-label="Next month"
          className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:text-fg"
          onClick={() => setCursor(shiftMonth(cursor, 1))}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center font-display text-[10px] uppercase tracking-wider text-subtle">
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e${i}`} />;
          const open = isDailyDay(cell) && cell <= today && cell >= DAILY_LAUNCH;
          return (
            <button
              key={cell}
              type="button"
              disabled={!open}
              onClick={() => onPick(cell)}
              className={cn(
                "flex h-11 items-center justify-center rounded-md text-sm tabular-nums",
                cell === day ? "bg-accent text-accent-fg" : open ? "text-fg hover:bg-surface-2" : "text-subtle",
              )}
            >
              {Number(cell.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  const start = first.getUTCDay();
  const days = new Date(Date.UTC(y!, m ?? 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: start }, () => null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function BoardList({
  rows,
  loading,
  empty,
  board,
  metric = "wins",
}: {
  rows: BoardRow[] | null;
  loading: boolean;
  empty: string;
  board: RankTabId;
  metric?: "wins" | "score" | "stars";
}) {
  const top =
    metric === "score"
      ? rows?.[0]?.highest ?? 0
      : metric === "stars"
        ? rows?.[0]?.stars ?? 0
        : rows?.[0]?.wins ?? 0;
  if (loading) return <div className="h-40 animate-pulse rounded-md bg-bg" />;
  if (!rows || rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="grid gap-1.5">
      {rows.map((row, index) => {
        const value = metric === "score" ? (row.highest ?? 0) : metric === "stars" ? row.stars : row.wins;
        const width = top > 0 ? Math.max(8, Math.round((value / top) * 100)) : 8;
        const src = avatarById(row.avatarId).src;
        return (
          <li key={row.id}>
            <Link
              to="/player/$id"
              params={{ id: row.id }}
              search={{ board }}
              className="block rounded-md bg-bg px-3 py-2.5 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-subtle">
                  {index + 1}
                </span>
                <img
                  src={src}
                  alt=""
                  className="size-9 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="block min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                      {row.name}
                    </span>
                    {metric === "stars" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 font-display text-base font-semibold tabular-nums text-fg">
                        <Star className="size-4 text-accent" fill="currentColor" />
                        {row.stars}
                      </span>
                    ) : metric === "score" ? (
                      <span className="shrink-0 font-display text-base font-semibold tabular-nums text-fg">
                        {row.highest ?? "—"}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 font-display text-xs font-semibold tabular-nums text-fg">
                        <Star className="size-3 text-accent" fill="currentColor" />
                        {row.stars}
                      </span>
                    )}
                  </span>
                  {metric === "stars" || metric === "score" ? null : (
                    <span className="mt-0.5 block text-xs tabular-nums text-muted">
                      {row.wins} {row.wins === 1 ? "win" : "wins"}
                      <span className="text-subtle"> · {row.games} played</span>
                      {row.highest != null ? <span className="text-subtle"> · high {row.highest}</span> : null}
                    </span>
                  )}
                </span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full bg-turf/80" style={{ width: `${width}%` }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
