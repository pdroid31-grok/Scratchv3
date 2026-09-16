"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getWeeklyLineup } from "@/lib/game/weekly-api";
import type { WeeklyPickSnap } from "@/lib/game/weekly";

export function WeeklyLineupSheet({
  season,
  week,
  userId,
  onClose,
}: {
  season: number;
  week: number;
  userId: string;
  onClose: () => void;
}) {
  const [lineup, setLineup] = useState<{
    name: string;
    score: number;
    live: boolean;
    awarded: boolean;
    picks: WeeklyPickSnap[];
  } | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void getWeeklyLineup({ data: { season, week, userId } })
      .then((next) => {
        if (live) setLineup(next);
      })
      .catch(() => {
        if (live) setLineup(null);
      });
    return () => {
      live = false;
    };
  }, [season, week, userId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Weekly lineup"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Lineup</p>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold uppercase tracking-wide text-fg">
              {lineup?.name ?? "Weekly"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {lineup === undefined
                ? "Loading…"
                : lineup === null
                  ? "This card isn’t available."
                  : lineup.picks.length
                    ? `${season} · week ${week} · ${lineup.score.toFixed(1)}${!lineup.live && !lineup.awarded ? " proj" : ""} · $${lineup.picks.reduce((n, pick) => n + pick.cost, 0)}`
                    : "No lineup saved."}
            </p>
          </div>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {lineup === undefined ? (
            <div className="h-40 animate-pulse rounded-md bg-bg" />
          ) : lineup === null ? (
            <p className="text-sm text-muted">This card isn’t available.</p>
          ) : lineup.picks.length === 0 ? (
            <p className="text-sm text-muted">No lineup saved for this run.</p>
          ) : (
            <ol className="grid gap-1.5">
              {lineup.picks.map((pick) => (
                <li
                  key={pick.slot}
                  className="flex items-center gap-3 rounded-md bg-bg px-3 py-2 shadow-[var(--shadow-border)]"
                >
                  <span className="w-10 shrink-0 font-display text-xs font-semibold uppercase tracking-wide text-subtle">
                    {pick.slot}
                  </span>
                  <span className="w-8 shrink-0 text-xs tabular-nums text-muted">${pick.cost}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{pick.name}</span>
                  <span className="w-16 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-fg">
                    {pick.score.toFixed(1)}
                    {lineup && !lineup.live && !lineup.awarded ? (
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted">proj</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}