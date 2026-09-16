"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { AuthBar } from "@/components/game/auth-bar";
import { GmName } from "@/components/game/gm-name";
import { TeamMarks } from "@/components/game/team-logo";
import { SeasonCard } from "@/components/game/season-card";
import { Button } from "@/components/ui/button";
import { slotLabel, type ElimPlayer, type ElimSlot } from "@/lib/game/elim-data";
import { elimLineup, legalElimPicks, maxElimCost, pickAt, pickClockLeft, ELIM_PICK_CLOCK_MS, type ElimPick } from "@/lib/game/elim";
import { isOnClock, useGame } from "@/lib/game/store";
import { weeklyVsLabel } from "@/lib/game/weekly";
import type { Seat } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function ElimDraftScreen() {
  const names = useGame((s) => s.names);
  const cash = useGame((s) => s.cash);
  const elim = useGame((s) => s.elim);
  const currentBidder = useGame((s) => s.currentBidder);
  const pickElim = useGame((s) => s.pickElim);
  const flushElimDraft = useGame((s) => s.flushElimDraft);
  const timeoutElim = useGame((s) => s.timeoutElim);
  const reset = useGame((s) => s.reset);
  const mode = useGame((s) => s.mode);
  const acting = useGame((s) => s.acting);
  const mine = isOnClock(useGame((s) => s));
  const [scout, setScout] = useState<ElimPlayer | null>(null);
  const [roster, setRoster] = useState<Seat | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flushedHold = useRef<{ until: number; at: number } | null>(null);
  const firedClock = useRef<{ until: number; at: number } | null>(null);

  useEffect(() => {
    setScout(null);
    setRoster(null);
  }, [elim?.round, elim?.year]);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (elim?.pickHoldUntil && t >= elim.pickHoldUntil) {
        const last = flushedHold.current;
        if (!last || last.until !== elim.pickHoldUntil || t - last.at >= 1200) {
          flushedHold.current = { until: elim.pickHoldUntil, at: t };
          flushElimDraft();
        }
        return;
      }
      if (elim?.pickHoldUntil && t < elim.pickHoldUntil) return;
      if (elim?.pickClockUntil && t >= elim.pickClockUntil) {
        const last = firedClock.current;
        if (!last || last.until !== elim.pickClockUntil || t - last.at >= 1200) {
          firedClock.current = { until: elim.pickClockUntil, at: t };
          timeoutElim();
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [elim?.pickHoldUntil, elim?.pickClockUntil, flushElimDraft, timeoutElim]);

  if (!elim) return null;
  const holding = Boolean(elim.pickHoldUntil && now < elim.pickHoldUntil);
  const lastPick = elim.lastPickId ? elim.board.find((row) => row.id === elim.lastPickId) : undefined;
  const lineup = elimLineup(elim);
  const pos = lineup[Math.min(elim.round, lineup.length - 1)] ?? "QB";
  const cap = maxElimCost(elim, cash[currentBidder], currentBidder);
  const legal = new Set(legalElimPicks(elim, cash[currentBidder], currentBidder).map((row) => row.id));
  const clockMs = holding ? 0 : pickClockLeft(elim, now);
  const showClock = !holding && Boolean(elim.pickClockUntil);
  const clockUrgent = showClock && clockMs <= 10_000;

  const takenBy = (id: string): Seat | null => {
    if (elim.picks[0].some((pick) => pick.player.id === id)) return 0;
    if (elim.picks[1].some((pick) => pick.player.id === id)) return 1;
    return null;
  };

  const canPick = (id: string) => {
    if (holding || acting || !mine) return false;
    if (takenBy(id) !== null) return false;
    return legal.has(id);
  };

  const draft = (id: string) => {
    if (!canPick(id)) return;
    pickElim(id);
    setScout(null);
  };

  return (
    <main className="elim-board">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
            {elim.solo ? (mode === "weekly" ? "Weekly Elimination" : "Daily Elimination") : "Elimination"}
          </p>
          <p className="mt-1 font-display text-4xl font-semibold leading-none tabular-nums tracking-tight text-fg sm:text-5xl">
            {elim.year}
          </p>
          <h1 className="mt-2 font-display text-xl font-semibold uppercase leading-none tracking-tight text-fg">
            Round {elim.round + 1} · {slotLabel(pos)}
          </h1>
        </div>
        <AuthBar className="shrink-0" />
      </header>

      <div className={cn("mt-3 grid shrink-0 gap-2", elim.solo ? "grid-cols-1" : "grid-cols-2")}>
        {((elim.solo ? [0] : [0, 1]) as Seat[]).map((seat) => (
          <button
            key={seat}
            type="button"
            onClick={() => setRoster(seat)}
            className={cn(
              "rounded-xl bg-surface/90 p-2 text-left shadow-[var(--shadow-border)]",
              currentBidder === seat && !holding && (clockUrgent ? "ring-1 ring-danger" : "ring-1 ring-accent"),
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                <GmName seat={seat} link={false} />
              </p>
              {currentBidder === seat && showClock ? (
                <p
                  className={cn(
                    "shrink-0 font-display text-xl tabular-nums leading-none",
                    clockUrgent ? "text-danger" : "text-accent",
                  )}
                >
                  {formatPickClock(clockMs)}
                </p>
              ) : null}
            </div>
            {currentBidder === seat && showClock ? (
              <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-bg">
                <div
                  className={cn("h-full", clockUrgent ? "bg-danger" : "bg-accent")}
                  style={{ width: `${Math.max(0, Math.min(100, (clockMs / ELIM_PICK_CLOCK_MS) * 100))}%` }}
                />
              </div>
            ) : null}
            <p className="mt-0.5 font-display text-xl tabular-nums leading-none text-fg">${cash[seat]}</p>
            <p className="mt-0.5 text-[10px] text-muted">{currentBidder === seat ? `max $${cap}` : "Tap for roster"}</p>
            <ul className="mt-1.5 grid grid-cols-4 gap-0.5">
              {lineup.map((slot) => {
                const pick = pickAt(elim.picks[seat], slot);
                return (
                  <li key={slot} className="rounded-md bg-bg px-1 py-0.5">
                    <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
                      {slotLabel(slot)}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-fg">{pick ? pick.player.name : "—"}</p>
                  </li>
                );
              })}
            </ul>
          </button>
        ))}
      </div>

      <p className="mt-2 shrink-0 truncate text-sm text-muted">
        {holding && lastPick ? (
          <>
            <span className="font-medium text-fg">{names[elim.picks.flat().find((pick) => pick.player.id === lastPick.id)?.seat ?? currentBidder]}</span>
            {" drafts "}
            <span className="font-medium text-fg">{lastPick.name}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-fg">{names[currentBidder]}</span>
            {mine ? " is on the clock — plus takes the name." : " is on the clock. Wait your turn."}
          </>
        )}
      </p>

      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto grid content-start gap-1.5 pr-0.5">
        {elim.board.map((player) => {
          const owner = takenBy(player.id);
          const tooMuch = owner === null && !legal.has(player.id);
          const pickDisabled = !canPick(player.id);
          return (
            <li key={player.id} className="flex items-stretch gap-1.5">
              <button
                type="button"
                aria-label={`Draft ${player.name}`}
                disabled={pickDisabled}
                onClick={() => draft(player.id)}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface/90 text-accent shadow-[var(--shadow-border)]",
                  pickDisabled ? "opacity-40" : "hover:bg-surface-2",
                )}
              >
                <Plus className="size-5" strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label={`${player.name} season card`}
                onClick={() => setScout(player)}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface/90 px-2 py-1 text-left shadow-[var(--shadow-border)] hover:bg-surface-2",
                  owner !== null && !(elim.lastPickId === player.id && holding) && "opacity-40",
                  tooMuch && owner === null && "opacity-50",
                  elim.lastPickId === player.id && holding && "ring-1 ring-accent",
                )}
              >
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 font-display text-xs font-semibold tabular-nums text-fg">
                  ${player.cost}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <TeamMarks player={player} />
                    <span className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                      {player.name}
                    </span>
                  </span>
                  {mode === "weekly" && player.vs ? (
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {weeklyVsLabel(player.vs)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-[10px] tabular-nums text-muted">
                  {owner === null
                    ? tooMuch
                      ? `Max $${cap}`
                      : `${player.team} · ${player.ppr.toFixed(1)}`
                    : names[owner]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button
        variant="ghost"
        className="mt-2 shrink-0 self-start text-muted"
        onClick={() => (mode === "daily" || mode === "weekly" ? setLeaveAsk(true) : reset())}
      >
        Leave
      </Button>
      </div>

      {leaveAsk ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-3" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="font-display text-lg font-semibold uppercase tracking-wide text-fg">
              {mode === "weekly" ? "Leave weekly?" : "Leave daily?"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {mode === "weekly"
                ? "This uses your one attempt for the week. You will not get a score."
                : "The clock keeps running. Leftover slots auto-pick and the lineup still submits."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setLeaveAsk(false)}>
                Stay
              </Button>
              <Button type="button" variant="danger" onClick={reset}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {scout ? (
        <SeasonCard
          player={scout}
          year={elim.year}
          onClose={() => setScout(null)}
          action={
            <Button
              type="button"
              size="lg"
              className={cn(
                "font-display uppercase tracking-wider",
                !canPick(scout.id) && "opacity-40",
              )}
              aria-disabled={!canPick(scout.id)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                draft(scout.id);
              }}
            >
              Draft ${scout.cost}
            </Button>
          }
        >
          {takenBy(scout.id) !== null ? (
            <p className="text-center text-sm text-muted">{names[takenBy(scout.id)!]} already has him.</p>
          ) : !legal.has(scout.id) ? (
            <p className="text-center text-sm text-muted">Over the ${cap} cap this pick.</p>
          ) : null}
          <Button variant="secondary" size="lg" className="w-full font-display uppercase tracking-wider" onClick={() => setScout(null)}>
            Return to game
          </Button>
        </SeasonCard>
      ) : null}
      {roster !== null ? (
        <DraftRosterCard
          seat={roster}
          cash={cash[roster]}
          picks={elim.picks[roster]}
          lineup={lineup}
          showOpp={mode === "weekly"}
          onClose={() => setRoster(null)}
        />
      ) : null}
    </main>
  );
}

function formatPickClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function DraftRosterCard({
  seat,
  cash,
  picks,
  lineup,
  showOpp = false,
  onClose,
}: {
  seat: Seat;
  cash: number;
  picks: ElimPick[];
  lineup: ElimSlot[];
  showOpp?: boolean;
  onClose: () => void;
}) {
  const spent = picks.reduce((n, pick) => n + pick.player.cost, 0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-card-title"
      onClick={onClose}
    >
      <div
        className="season-card flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
            Roster · ${spent} spent · ${cash} left
          </p>
          <h2 id="roster-card-title" className="mt-2 font-display text-3xl font-semibold uppercase tracking-tight text-fg">
            <GmName seat={seat} size="md" link={false} />
          </h2>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {lineup.map((slot) => {
            const pick = pickAt(picks, slot);
            return (
              <li key={slot} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <span className="w-9 shrink-0 font-display text-xs font-semibold uppercase tracking-wider text-subtle">
                  {slotLabel(slot)}
                </span>
                {pick ? (
                  <>
                    <TeamMarks player={pick.player} />
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">
                      {pick.player.name}
                      {showOpp && pick.player.vs ? (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {weeklyVsLabel(pick.player.vs)}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-display text-lg tabular-nums text-fg">${pick.player.cost}</span>
                  </>
                ) : (
                  <span className="text-sm text-muted">Open</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <Button size="lg" className="w-full font-display uppercase tracking-wider" onClick={onClose}>
            Return to game
          </Button>
        </div>
      </div>
    </div>
  );
}
