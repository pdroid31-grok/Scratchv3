"use client";

import { useEffect, type ReactNode } from "react";
import { weekToneCell, weekToneClass } from "@/components/game/score-tone";
import { TeamMarks } from "@/components/game/team-logo";
import { Button } from "@/components/ui/button";
import type { ElimPlayer, WeekScoreTone } from "@/lib/game/elim-data";
import { playableWeeks, weekScoreTone } from "@/lib/game/elim-data";
import { teamById } from "@/lib/game/teams";
import { cn } from "@/lib/utils";

export function SeasonCard({
  player,
  year,
  highlightWeek,
  onClose,
  action,
  children,
}: {
  player: ElimPlayer;
  year: number;
  highlightWeek?: number;
  onClose: () => void;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const team = teamById(player.team);
  const weekNums = playableWeeks(year);
  const weeks = player.weeks;
  const games = weekNums.filter((week) => {
    const v = weeks[week - 1];
    return Number.isFinite(v) && v !== 0 && week !== player.bye;
  }).length;
  const tot = weekNums.reduce((n, week) => {
    const v = weeks[week - 1];
    return Number.isFinite(v) && week !== player.bye ? n + Number(v) : n;
  }, 0);
  const avg = games ? Math.round((tot / games) * 10) / 10 : 0;

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
      aria-labelledby="season-card-title"
      onClick={onClose}
    >
      <div
        className="season-card flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
            {year} · {player.pos} · {player.team}
            {player.bye ? ` · Bye ${player.bye}` : ""}
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="season-card-title"
                className="flex items-center gap-2 font-display text-3xl font-semibold uppercase tracking-tight text-fg"
              >
                <TeamMarks player={player} />
                <span className="min-w-0 truncate">{player.name}</span>
              </h2>
              <p className="mt-1 text-sm text-muted">
                {team.city} {team.nick}
              </p>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Cost" value={`$${player.cost}`} />
            <Stat label="Season" value={player.ppr.toFixed(1)} />
            <Stat label="Avg" value={avg.toFixed(1)} tone={weekScoreTone(player.pos, avg)} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-subtle">
            Week by week · {year} PPR
            {highlightWeek ? ` · Week ${highlightWeek}` : ""}
          </p>
          <ol className="grid grid-cols-3 gap-1.5">
            {weekNums.map((week) => {
              const pts = weeks[week - 1];
              const bye = player.bye === week;
              const blank = !bye && !Number.isFinite(pts);
              const hot = highlightWeek === week;
              const tone = bye ? "bye" : blank ? "ok" : weekScoreTone(player.pos, pts, bye);
              return (
                <li
                  key={week}
                  className={cn(
                    "rounded-md px-2 py-2 text-center",
                    hot ? "bg-accent/20 ring-1 ring-accent" : weekToneCell[tone],
                  )}
                >
                  <span
                    className={cn(
                      "block font-display text-xs font-semibold uppercase tracking-wider",
                      hot ? "text-accent" : "text-subtle",
                    )}
                  >
                    W{week}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block font-display text-lg tabular-nums",
                      weekToneClass[tone],
                    )}
                  >
                    {bye ? "BYE" : blank ? "" : pts.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="grid gap-2 border-t border-border px-4 py-3 sm:px-5">
          {children ?? (
            <Button size="lg" className="w-full font-display uppercase tracking-wider" onClick={onClose}>
              Return to game
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: WeekScoreTone }) {
  return (
    <div className="rounded-md bg-bg px-2 py-2">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className={cn("mt-0.5 font-display text-xl font-semibold tabular-nums", tone ? weekToneClass[tone] : "text-fg")}>
        {value}
      </p>
    </div>
  );
}
