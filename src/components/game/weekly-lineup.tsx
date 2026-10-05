"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getWeeklyLineup, reviewWeeklyOptions, type WeeklyReview, type WeeklyReviewPick } from "@/lib/game/weekly-api";
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
    score: number | null;
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
                    ? `${season} · week ${week}${lineup.score == null ? "" : ` · ${lineup.score.toFixed(1)}`} · $${lineup.picks.reduce((n, pick) => n + pick.cost, 0)}`
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
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{pick.slot === "D" || !pick.team ? pick.name : `${pick.name} - ${pick.team}`}</span>
                  <span className="w-16 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-fg">
                    {lineup.live || lineup.awarded ? pick.score.toFixed(1) : ""}
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

const REVIEW_LABELS = ["Best Players", "Best Line up", "Worst Players"] as const;

function reviewName(pick: WeeklyReviewPick): string {
  if (pick.slot === "D" || !pick.team) return pick.name;
  return `${pick.name} - ${pick.team}`;
}

export function WeeklyReviewSheet({
  season,
  week,
  onClose,
}: {
  season: number;
  week: number;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [review, setReview] = useState<WeeklyReview | null | undefined>(undefined);
  const startX = useRef<number | null>(null);
  const max = REVIEW_LABELS.length - 1;
  const go = (next: number) => setPage(Math.max(0, Math.min(max, next)));

  useEffect(() => {
    let live = true;
    void reviewWeeklyOptions({ data: { season, week } })
      .then((next) => {
        if (live) setReview(next);
      })
      .catch(() => {
        if (live) setReview(null);
      });
    return () => {
      live = false;
    };
  }, [season, week]);

  const label = REVIEW_LABELS[page] ?? REVIEW_LABELS[0];
  const picks =
    review && review.ok
      ? page === 1
        ? review.lineup ?? []
        : page === 2
          ? review.worst ?? []
          : review.best ?? []
      : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Review Line Up Options"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
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
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Lineup</p>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold uppercase tracking-wide text-fg">{label}</h2>
            <p className="mt-1 text-sm text-muted">
              {review === undefined
                ? "Loading…"
                : review === null
                  ? "This card isn’t available."
                  : !review.ok
                    ? `No actual for ${review.missing ?? "a player"}.`
                    : page === 1
                      ? `${season} · week ${week} · ${(review.lineupScore ?? 0).toFixed(1)} · $${review.lineupCost ?? 0}`
                      : `${season} · week ${week}`}
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
        <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-2 disabled:opacity-30"
            aria-label="Previous"
            disabled={page <= 0}
            onClick={() => go(page - 1)}
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-muted">
            {page + 1} / {REVIEW_LABELS.length}
          </p>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-2 disabled:opacity-30"
            aria-label="Next"
            disabled={page >= max}
            onClick={() => go(page + 1)}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {review === undefined ? (
            <div className="h-40 animate-pulse rounded-md bg-bg" />
          ) : review === null || !review.ok ? (
            <p className="text-sm text-muted">
              {review === null ? "This card isn’t available." : `No actual for ${review.missing ?? "a player"}.`}
            </p>
          ) : (
            <ol className="grid gap-1.5">
              {picks.map((pick) => (
                <li
                  key={pick.slot}
                  className="flex items-center gap-3 rounded-md bg-bg px-3 py-2 shadow-[var(--shadow-border)]"
                >
                  <span className="w-10 shrink-0 font-display text-xs font-semibold uppercase tracking-wide text-subtle">
                    {pick.slot}
                  </span>
                  <span className="w-8 shrink-0 text-xs tabular-nums text-muted">${pick.cost}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{reviewName(pick)}</span>
                  <span className="w-16 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-fg">
                    {pick.score.toFixed(1)}
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