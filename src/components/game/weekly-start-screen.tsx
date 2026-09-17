"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Banknote, CalendarRange, Lock, MousePointerClick, Star, type LucideIcon } from "lucide-react";
import { AuthBar, useGmPrefill } from "@/components/game/auth-bar";
import { Button } from "@/components/ui/button";
import { DailyUnlocksButton } from "@/components/game/daily-unlocks";
import { getWeekly, type WeeklyMeta } from "@/lib/game/weekly-api";
import { WEEKLY_SCORE_LINE, WEEKLY_WIN_PAY, WEEKLY_WIN_STARS, formatWeeklyLock } from "@/lib/game/weekly";
import { useGame } from "@/lib/game/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const RULES: { icon: LucideIcon; text: string }[] = [
  { icon: Lock, text: "Lock your lineup before kickoff. Leave mid-draft and come back — the week is not spent until you lock." },
  { icon: Banknote, text: "Snake the board with $35. Last pick can go down to $1." },
  { icon: MousePointerClick, text: "Select players names to see their current season stats." },
  {
    icon: Star,
    text: `Score over ${WEEKLY_SCORE_LINE} pays $1. First place wins $${WEEKLY_WIN_PAY} and ${WEEKLY_WIN_STARS} Daily Stars. Ties all collect.`,
  },
];

export function WeeklyStartScreen({
  onClose,
  onSeeResults,
}: {
  onClose: () => void;
  onSeeResults: (userId?: string) => void;
}) {
  const startWeekly = useGame((s) => s.startWeekly);
  const busy = useGame((s) => s.busy);
  const netError = useGame((s) => s.netError);
  const { user, isPending } = useCurrentUserState();
  const gm = useGmPrefill();
  const [meta, setMeta] = useState<WeeklyMeta | null>(null);

  useEffect(() => {
    let live = true;
    void getWeekly({ data: {} })
      .then((next) => {
        if (live) setMeta(next);
      })
      .catch(() => {
        if (live) setMeta(null);
      });
    return () => {
      live = false;
    };
  }, [user?.id]);

  const signedIn = Boolean(user) && !isPending;
  const canStart = signedIn && (meta?.status === "open" || meta?.status === "playing");
  const canSee = meta?.status === "done";
  const lockedOut = meta?.status === "locked" || meta?.status === "forfeit";

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">Weekly Elimination</p>
          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg">
            Darkness
          </h1>
        </div>
        <AuthBar className="shrink-0" />
      </header>

      <section className="mt-8 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="text-center font-display text-xs font-semibold uppercase tracking-[0.24em] text-subtle">
          This week’s season
        </p>
        <p className="mt-2 text-center font-display text-7xl font-semibold leading-none tabular-nums tracking-tight text-fg">
          {meta?.season ?? "—"}
        </p>
        <p className="mt-2 text-center text-sm text-muted">
          {meta ? `Week ${meta.week}` : "Loading…"}
          {meta?.lockAt ? ` · locks ${formatWeeklyLock(meta.lockAt)}` : ""}
        </p>

        <ul className="mt-6 grid gap-3">
          {RULES.map((line) => (
            <li key={line.text} className="flex gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
                <line.icon className="size-4" strokeWidth={1.75} />
              </span>
              <p className="text-sm leading-relaxed text-fg">{line.text}</p>
            </li>
          ))}
        </ul>

        {netError ? <p className="mt-4 rounded-md bg-danger/20 px-3 py-2 text-sm text-fg">{netError}</p> : null}

        {!signedIn ? (
          <p className="mt-4 text-sm text-muted">
            Sign in to take this week’s run
            {gm ? ` as ${gm}` : ""}.
          </p>
        ) : null}

        {meta?.status === "done" ? (
          <p className="mt-4 text-sm text-fg">
            {meta.live || meta.awarded ? (
              <>
                You scored <span className="font-display font-semibold tabular-nums">{meta.score?.toFixed(1)}</span>
                {meta.awarded && meta.paid ? " · $1 banked" : ""}
                {meta.awarded && meta.winner ? ` · 1st +$${WEEKLY_WIN_PAY} · ${WEEKLY_WIN_STARS} stars` : ""}.
              </>
            ) : (
              <>Submitted. Waiting on kickoff{meta.score != null ? ` · ${meta.score.toFixed(1)}` : ""}.</>
            )}
          </p>
        ) : null}
        {meta?.status === "forfeit" ? (
          <p className="mt-4 text-sm text-muted">You left early. Next board unlocks after this week’s games.</p>
        ) : null}
        {meta?.status === "locked" ? (
          <p className="mt-4 text-sm text-muted">First kickoff has locked this week. Next board opens when the slate ends.</p>
        ) : null}

        {canSee ? (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full font-display uppercase tracking-wider"
            disabled={busy}
            onClick={() => onSeeResults(user?.id)}
          >
            See results
          </Button>
        ) : signedIn ? (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full font-display uppercase tracking-wider"
            disabled={busy || !meta || lockedOut || !canStart}
            onClick={() => void startWeekly()}
          >
            <CalendarRange className="size-4" />
            {busy ? "Starting…" : meta?.status === "playing" ? "Resume match" : "Start match"}
          </Button>
        ) : (
          <Link
            to="/login"
            className="mt-5 inline-flex h-12 min-h-12 w-full items-center justify-center rounded-md bg-accent px-5 font-display text-base font-medium uppercase tracking-wider text-accent-fg"
          >
            Sign in to play
          </Link>
        )}
      </section>

      <DailyUnlocksButton className="mt-6" />
      <Button
        type="button"
        size="lg"
        className="mt-3 w-full font-display uppercase tracking-wider bg-fg text-bg hover:bg-fg/90"
        onClick={onClose}
      >
        Back
      </Button>
    </main>
  );
}