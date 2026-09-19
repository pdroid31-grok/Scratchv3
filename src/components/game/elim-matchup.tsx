"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Trophy } from "lucide-react";
import { weekToneClass } from "@/components/game/score-tone";
import { AuthBar } from "@/components/game/auth-bar";
import { ElimWinnerBanner } from "@/components/game/elim-winner";
import { ShareResultsButton } from "@/components/game/share-results";
import { GmName } from "@/components/game/gm-name";
import { SeasonCard } from "@/components/game/season-card";
import { TeamMarks } from "@/components/game/team-logo";
import { Button } from "@/components/ui/button";
import { slotLabel, weekScoreTone, type ElimPlayer, type ElimSlot } from "@/lib/game/elim-data";
import {
  ELIM_MAX_SETS,
  ELIM_REVEAL_STEPS,
  ELIM_WINS_NEEDED,
  byeHasRolled,
  elimDisplay,
  elimRevealReady,
  elimRevealSteps,
  elimSeriesWinner,
  elimSets,
  elimWeekReady,
  isByeWeek,
  pickAt,
  revealOpen,
  revealedCount,
  scoredWeek,
  type ElimSet,
  type ElimState,
} from "@/lib/game/elim";
import { otherSeat } from "@/lib/game/auction";
import { useGame } from "@/lib/game/store";
import { markDailyRankings, clearDailyRankings, markWeeklyRankings, markPlayHome } from "@/lib/game/rank-tabs";
import { weeklyVsLabel } from "@/lib/game/weekly";
import { dailyDayStamp } from "@/lib/game/daily";
import { cn } from "@/lib/utils";
import type { Seat } from "@/lib/game/types";

export function ElimMatchupScreen() {
  const names = useGame((s) => s.names);
  const elim = useGame((s) => s.elim);
  const phase = useGame((s) => s.phase);
  const startReveal = useGame((s) => s.startReveal);
  const finishElim = useGame((s) => s.finishElim);
  const reset = useGame((s) => s.reset);
  const rematchNight = useGame((s) => s.rematchNight);
  const acting = useGame((s) => s.acting);
  const busy = useGame((s) => s.busy);
  const mode = useGame((s) => s.mode);
  const mySeat = useGame((s) => s.mySeat);
  const rematchReady = useGame((s) => s.rematchReady);
  const avatars = useGame((s) => s.avatars);
  const hideWeek = useGame((s) => Boolean(s.daily?.hideWeek));
  const dailyDay = useGame((s) => s.daily?.day ?? null);
  const dailyScore = useGame((s) => s.daily?.score);
  const weekly = useGame((s) => s.weekly);
  const refreshWeekly = useGame((s) => s.refreshWeekly);
  const [now, setNow] = useState(() => Date.now());
  const [scout, setScout] = useState<{ player: ElimPlayer; week: number } | null>(null);

  const flushedFinish = useRef<{ at: number; until: number } | null>(null);

  useEffect(() => {
    if (phase !== "reveal" || !elim?.revealAt) {
      flushedFinish.current = null;
      return;
    }
    const revealAt = elim.revealAt;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (!elimRevealReady(elim, t)) return;
      const last = flushedFinish.current;
      if (last && last.until === revealAt && t - last.at < 1200) return;
      flushedFinish.current = { until: revealAt, at: t };
      finishElim();
    };
    tick();
    const id = window.setInterval(tick, 250);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [phase, elim, finishElim]);

  useEffect(() => {
    if (mode !== "weekly" || !weekly?.locked || weekly.awarded) return;
    void refreshWeekly();
    const id = window.setInterval(() => {
      void refreshWeekly();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshWeekly();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [mode, weekly?.locked, weekly?.awarded, refreshWeekly]);

  if (!elim) return null;
  const solo = Boolean(elim.solo);
  const steps = elimRevealSteps(elim);
  const display = elimDisplay();
  const last = phase === "matchup" ? elim.lastSet : null;
  const holding = Boolean(last);
  const week = elim.week;
  const scoreWeek = holding && last ? last.week : week;
  const shown = phase === "reveal" ? revealedCount(elim, now) : holding || phase === "results" ? steps : 0;
  const totals =
    mode === "daily"
      ? phase === "results" || (phase === "reveal" && shown >= steps)
        ? dailyScore != null && Number.isFinite(dailyScore)
          ? ([dailyScore, 0] as [number, number])
          : running(elim, shown, now, display, scoreWeek)
        : shown > 0
          ? running(elim, shown, now, display, scoreWeek)
          : ([0, 0] as [number, number])
      : holding && last
        ? last.scores
        : shown > 0
          ? running(elim, shown, now, display, scoreWeek)
          : ([0, 0] as [number, number]);
  const final = phase === "reveal" && shown >= steps;
  const live = phase === "reveal" && !final && shown > 0 ? shown - 1 : -1;
  const livePos = solo ? live : live >= 0 ? Math.floor(live / 2) : -1;
  const liveSeat: Seat | null = solo ? (live >= 0 ? 0 : null) : live >= 0 ? ((live % 2) as Seat) : null;
  const wins = elim.weekWins ?? [0, 0];
  const sets = elimSets(elim);
  const setNo = Math.min(ELIM_MAX_SETS, sets.length + (phase === "results" ? 0 : 1));
  const ready = elimWeekReady(elim);
  const nextSeat: Seat = !ready[0] ? 0 : 1;
  const mineReady = mode === "online" && mySeat !== null && ready[mySeat];
  const liveDaily = mode === "daily" && Boolean(dailyDay) && dailyDay === dailyDayStamp();
  const hideWeekNumber = hideWeek || liveDaily;
  const playLabel =
    solo
      ? hideWeekNumber
        ? "Play Week"
        : `Play week ${week}`
      : phase !== "matchup"
        ? "Play Next Week"
        : mineReady
          ? `Waiting for ${names[mySeat === 0 ? 1 : 0]}`
          : mode === "online"
            ? "Play Next Week"
            : ready[0] !== ready[1]
              ? `${names[ready[0] ? 0 : 1]} ready \u00b7 ${names[nextSeat]} start`
              : "Play Next Week";
  const hideScores = phase === "matchup" && !holding;
  const seriesWinner = phase === "results" ? elimSeriesWinner(elim) : null;
  const rematch = rematchReady ?? [false, false];
  const theirSeat: Seat | null = mode === "online" && mySeat !== null ? otherSeat(mySeat) : null;
  const theyReady = theirSeat !== null && rematch[theirSeat];

  return (
    <main className="elim-board">
      <div className="mx-auto flex h-full w-full max-w-lg min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
              {solo ? `${elim.year} \u00b7 ${mode === "weekly" ? "Weekly" : "Daily"}` : `${elim.year} \u00b7 Best of ${ELIM_MAX_SETS}`}
              {phase === "results" ? " \u00b7 Final" : solo ? "" : ` \u00b7 Set ${setNo}`}
            </p>
            <h1 className="mt-1 truncate font-display text-xl font-semibold uppercase leading-none tracking-tight text-fg sm:text-2xl">
              {phase === "results" ? (
                seriesWinner === null ? (
                  "Draw"
                ) : (
                  <GmName seat={seriesWinner} size="md" nameClassName="text-fg" />
                )
              ) : hideWeekNumber ? (
                "Week"
              ) : (
                <>Week {holding && last ? last.week : week}</>
              )}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <AuthBar />
            {phase !== "results" ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted"
                onClick={() => {
                  if (mode === "weekly") markPlayHome();
                  reset();
                }}
              >
                Leave
              </Button>
            ) : null}
          </div>
        </header>

        {!solo ? <SeriesBoard wins={wins} /> : null}

        {phase === "results" && sets.length > 0 && !solo ? (
          <WeekSlider
            elim={elim}
            sets={sets}
            names={names}
            wins={wins}
            now={now}
            display={display}
            onScout={(player, week) => setScout({ player, week })}
          />
        ) : (
          <>
            <ScoreCards
              names={names}
              totals={totals}
              wins={wins}
              ready={ready}
              phase={phase}
              hideScores={hideScores}
              solo={solo}
              scoreHint={mode === "weekly" ? "this week\u2019s score" : "today\u2019s score"}
              winner={
                holding && last
                  ? last.winner
                  : final
                    ? totals[0] === totals[1]
                      ? null
                      : totals[0] > totals[1]
                        ? 0
                        : 1
                    : undefined
              }
            />
            <p className="mt-2 shrink-0 truncate text-xs text-muted">
              {mode === "weekly" && phase === "matchup" ? (
                weekly?.awarded
                  ? weekly.winner
                    ? `Final. ${weekly.paid ? "$1 banked" : "Under 100"} \u00b7 1st +$2 \u00b7 2 stars.`
                    : weekly.paid
                      ? "Final. $1 banked."
                      : "Final. Under 100."
                  : weekly?.live
                    ? "Live Sleeper scoring. Come back as the slate plays."
                    : "Come back later to view live scores."
              ) : holding && last ? (
                <>
                  {`Week ${last.week}: ${last.scores[0].toFixed(1)}\u2013${last.scores[1].toFixed(1)}`}
                  {last.winner === null ? " \u00b7 draw" : ` \u00b7 ${names[last.winner]}`}. First to {ELIM_WINS_NEEDED}.
                </>
              ) : phase === "reveal" && liveSeat !== null && livePos >= 0 ? (
                <>
                  <span className="font-medium text-fg">{names[liveSeat]}</span>
                  {" \u00b7 "}
                  {slotLabel(display[livePos]!)}
                </>
              ) : phase === "matchup" ? (
                solo ? (
                  "Your lineup. One hidden week. Highest score leads the day."
                ) : (
                  <>Same lineups. Both GMs start the week. First to {ELIM_WINS_NEEDED}.</>
                )
              ) : final ? (
                "Tallying the week\u2026"
              ) : (
                ""
              )}
            </p>
            <BoardRows
              elim={elim}
              display={display}
              scoreWeek={scoreWeek}
              shown={shown}
              now={now}
              phase={phase}
              livePos={livePos}
              liveSeat={liveSeat}
              solo={solo}
              showOpp={mode === "weekly"}
              onScout={(player, week) => setScout({ player, week })}
            />
          </>
        )}

        {phase === "matchup" && mode !== "weekly" ? (
          <Button
            size="lg"
            className="mt-2 w-full shrink-0 font-display uppercase tracking-wider"
            disabled={acting || mineReady || hideWeek}
            onClick={() => startReveal()}
          >
            {mode === "daily" && acting && hideWeek ? "Locking\u2026" : playLabel}
          </Button>
        ) : null}

        {phase === "matchup" && mode === "weekly" ? (
          <div className="mt-2 grid shrink-0 gap-1.5">
            <Button
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              onClick={() => {
                markWeeklyRankings();
                reset();
              }}
            >
              <Trophy className="size-4" />
              Leaderboard
            </Button>
            <Button
              type="button"
              size="lg"
              className="w-full font-display uppercase tracking-wider bg-fg text-bg hover:bg-fg/90"
              onClick={() => {
                markPlayHome();
                reset();
              }}
            >
              Back
            </Button>
          </div>
        ) : null}

        {phase === "results" ? (
          solo ? (
            <div className="relative z-10 mt-1.5 grid shrink-0 gap-1.5">
              <Button
                size="lg"
                className="w-full font-display uppercase tracking-wider"
                onClick={() => {
                  markDailyRankings();
                  reset();
                }}
              >
                See results
              </Button>
              {mode !== "daily" ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full font-display uppercase tracking-wider"
                onClick={() => {
                  clearDailyRankings();
                  reset();
                }}
              >
                Leave game
              </Button>
              ) : null}
            </div>
          ) : (
          <div className="relative z-10 mt-1.5 grid shrink-0 gap-1.5">
            {theyReady ? (
              <p className="text-center text-xs text-fg">
                <GmName seat={theirSeat!} className="align-middle" /> wants a rematch.
              </p>
            ) : null}
            <ShareResultsButton />
            <Button
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              disabled={acting || busy}
              onClick={rematchNight}
            >
              <RotateCcw className="size-4" />
              {acting || busy ? "Sending\u2026" : theyReady ? "Join rematch" : "Rematch"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              onClick={reset}
            >
              {mode === "online" ? "Leave night" : "New night"}
            </Button>
          </div>
          )
        ) : null}
      </div>
      {phase === "results" && !solo ? (
        <ElimWinnerBanner elim={elim} names={names} avatars={avatars} wins={wins} />
      ) : null}
      {scout ? (
        <SeasonCard
          player={scout.player}
          year={elim.year}
          highlightWeek={hideWeekNumber ? undefined : scout.week}
          showZeroWeeks={mode !== "weekly"}
          onClose={() => setScout(null)}
        />
      ) : null}
    </main>
  );
}

function SeriesBoard({ wins }: { wins: [number, number] }) {
  const lead: Seat = wins[0] >= wins[1] ? 0 : 1;
  const trail: Seat = lead === 0 ? 1 : 0;
  const nameClass = "font-display text-sm font-semibold uppercase tracking-wide text-fg";
  return (
    <div className="mt-3 grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-surface/90 px-3 py-2 shadow-[var(--shadow-border)]">
      <div className="min-w-0 justify-self-start">
        <GmName seat={lead} size="md" nameClassName={nameClass} />
      </div>
      <span className="shrink-0 px-2 text-center font-display text-2xl font-semibold tabular-nums tracking-wide text-fg">
        {`${wins[lead]}\u2013${wins[trail]}`}
      </span>
      <div className="min-w-0 justify-self-end">
        <GmName seat={trail} size="md" nameClassName={nameClass} />
      </div>
    </div>
  );
}

function ScoreCards({
  names: _names,
  totals,
  wins: _wins,
  ready,
  phase,
  winner,
  compact = false,
  hideScores = false,
  solo = false,
  scoreHint = "today\u2019s score",
}: {
  names: [string, string];
  totals: [number, number];
  wins: [number, number];
  ready: [boolean, boolean];
  phase: string;
  winner?: Seat | null;
  compact?: boolean;
  hideScores?: boolean;
  solo?: boolean;
  scoreHint?: string;
}) {
  return (
    <div className={cn("grid shrink-0 gap-2", compact ? "mt-1.5" : "mt-3", solo ? "grid-cols-1" : "grid-cols-2")}>
      {((solo ? [0] : [0, 1]) as Seat[]).map((seat) => (
        <div
          key={seat}
          className={cn(
            "min-w-0 rounded-lg bg-surface/90 shadow-[var(--shadow-border)]",
            compact ? "px-2.5 py-1.5" : "px-3 py-2",
          )}
        >
          <p className="truncate font-display text-xs font-semibold uppercase tracking-wide text-fg">
            <GmName seat={seat} />
            {phase === "matchup" && ready[seat] ? (
              <span className="ml-1 font-sans text-xs font-normal normal-case tracking-normal text-turf">ready</span>
            ) : null}
          </p>
          <p
            className={cn(
              "mt-0.5 font-display leading-none tabular-nums",
              compact ? "text-3xl" : "text-4xl",
              hideScores ? "text-muted" : winner === seat ? "text-good" : winner === 0 || winner === 1 ? "text-danger" : "text-fg",
            )}
          >
            {hideScores ? "\u2014" : totals[seat].toFixed(1)}
          </p>
          {solo ? <p className="mt-0.5 text-xs text-muted">{scoreHint}</p> : null}
        </div>
      ))}
    </div>
  );
}

function BoardRows({
  elim,
  display,
  scoreWeek,
  shown,
  now,
  phase,
  livePos,
  liveSeat,
  compact = false,
  solo = false,
  showOpp = false,
  onScout,
}: {
  elim: ElimState;
  display: ElimSlot[];
  scoreWeek: number;
  shown: number;
  now: number;
  phase: string;
  livePos: number;
  liveSeat: Seat | null;
  compact?: boolean;
  solo?: boolean;
  showOpp?: boolean;
  onScout?: (player: ElimPlayer, week: number) => void;
}) {
  return (
    <ol className={cn("mt-1.5 grid min-h-0 flex-1 grid-rows-8", compact ? "gap-0.5" : "gap-1")}>
      {display.map((slot, i) => (
        <li
          key={slot}
          className={cn(
            "grid min-h-0 items-center gap-x-1 overflow-hidden rounded-lg bg-surface/90 shadow-[var(--shadow-border)]",
            solo ? "grid-cols-[2.25rem_minmax(0,1fr)]" : "grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)]",
            compact ? "px-1.5 py-0" : "px-2 py-0.5",
          )}
        >
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {slotLabel(slot)}
          </p>
          {((solo ? [0] : [0, 1]) as Seat[]).map((seat) => {
            const pick = pickAt(elim.picks[seat], slot);
            const open = revealOpen(shown, i, seat, solo);
            const liveCell = livePos === i && liveSeat === seat;
            const bye = Boolean(
              pick && isByeWeek(pick.player, scoreWeek) && phase === "reveal" && !byeHasRolled(elim, i, seat, now),
            );
            const pts = pick ? scoredWeek(pick.player, scoreWeek, elim.year) : 0;
            const tone = pick ? weekScoreTone(pick.player.pos, pts, bye) : "ok";
            const score = (
              <p
                key={open ? (bye ? "bye" : "open") : "hid"}
                className={cn(
                  "shrink-0 font-display leading-none tabular-nums",
                  compact ? "text-lg" : "text-2xl",
                  open ? weekToneClass[tone] : "text-muted",
                  open && phase === "reveal" && "score-in",
                )}
              >
                {open ? (bye ? "BYE" : pts.toFixed(1)) : "\u2014"}
              </p>
            );
            const name = (
              <p className="flex min-w-0 items-center gap-1 truncate text-xs text-fg">
                {pick ? <TeamMarks player={pick.player} /> : null}
                <span className="truncate">{pick?.player.name ?? "\u2014"}</span>
                {showOpp && pick?.player.vs ? (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {weeklyVsLabel(pick.player.vs)}
                  </span>
                ) : null}
              </p>
            );
            const inner = compact ? (
              <div className="flex min-w-0 items-baseline justify-between gap-1">
                {name}
                {score}
              </div>
            ) : (
              <>
                {name}
                {score}
              </>
            );
            return pick && onScout ? (
              <button
                key={seat}
                type="button"
                onClick={() => onScout(pick.player, scoreWeek)}
                className={cn(
                  "min-w-0 overflow-hidden rounded-md px-1 text-left",
                  liveCell && "ring-1 ring-accent/50",
                )}
              >
                {inner}
              </button>
            ) : (
              <div
                key={seat}
                className={cn("min-w-0 overflow-hidden rounded-md px-1", liveCell && "ring-1 ring-accent/50")}
              >
                {inner}
              </div>
            );
          })}
        </li>
      ))}
    </ol>
  );
}

function WeekSlider({
  elim,
  sets,
  names,
  wins,
  now,
  display,
  onScout,
}: {
  elim: ElimState;
  sets: ElimSet[];
  names: [string, string];
  wins: [number, number];
  now: number;
  display: ElimSlot[];
  onScout?: (player: ElimPlayer, week: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, sets.length - 1));

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, sets.length - 1) * el.clientWidth });
  }, [sets.length]);

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(sets.length - 1, next));
    setIndex(clamped);
    const el = scroller.current;
    if (el) el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  return (
    <>
      <div className="mt-1.5 flex shrink-0 items-center justify-center gap-1">
        <button
          type="button"
          aria-label="Previous week"
          className="flex size-8 items-center justify-center rounded-md text-muted disabled:opacity-30"
          disabled={index <= 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeft className="size-5" />
        </button>
        {sets.map((set, i) => (
          <button
            key={set.week}
            type="button"
            onClick={() => go(i)}
            className={cn(
              "rounded-md px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider",
              i === index ? "bg-accent text-bg" : "bg-surface-2 text-muted",
            )}
          >
            W{set.week}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next week"
          className="flex size-8 items-center justify-center rounded-md text-muted disabled:opacity-30"
          disabled={index >= sets.length - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div
        ref={scroller}
        className="elim-weeks mt-2 min-h-0 flex-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!el.clientWidth) return;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== index && i >= 0 && i < sets.length) setIndex(i);
        }}
      >
        {sets.map((set) => (
          <div key={set.week} className="elim-week">
            <ScoreCards
              names={names}
              totals={set.scores}
              wins={wins}
              ready={[false, false]}
              phase="results"
              winner={set.winner}
              compact
            />
            <p className="mt-1 shrink-0 truncate text-xs text-muted">
              {`Week ${set.week}: ${set.scores[0].toFixed(1)}\u2013${set.scores[1].toFixed(1)}`}
              {set.winner === null ? " \u00b7 draw" : ` \u00b7 ${names[set.winner]}`}
            </p>
            <BoardRows
              elim={elim}
              display={display}
              scoreWeek={set.week}
              shown={ELIM_REVEAL_STEPS}
              now={now}
              phase="results"
              livePos={-1}
              liveSeat={null}
              compact
              onScout={onScout}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function running(
  elim: ElimState,
  shown: number,
  now: number,
  display: readonly ElimSlot[],
  week: number,
): [number, number] {
  const sum = (seat: Seat) =>
    display.reduce((n, slot, posIndex) => {
      const pick = pickAt(elim.picks[seat], slot);
      if (!pick || !revealOpen(shown, posIndex, seat, elim.solo)) return n;
      if (isByeWeek(pick.player, week) && !byeHasRolled(elim, posIndex, seat, now)) return n;
      return n + scoredWeek(pick.player, week, elim.year);
    }, 0);
  return [Math.round(sum(0) * 10) / 10, Math.round(sum(1) * 10) / 10];
}
