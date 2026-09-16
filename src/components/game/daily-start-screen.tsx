"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Banknote, Lock, MousePointerClick, Star, Sun, type LucideIcon } from "lucide-react";
import { AuthBar, useGmPrefill } from "@/components/game/auth-bar";
import { Button } from "@/components/ui/button";
import { DailyUnlocksButton } from "@/components/game/daily-unlocks";
import { YesterdayWinner } from "@/components/game/yesterday-winner";
import { getDaily, type DailyMeta } from "@/lib/game/daily-api";
import { DAILY_SCORE_LINE } from "@/lib/game/daily";
import { useGame } from "@/lib/game/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const RULES: { icon: LucideIcon; text: string }[] = [
  { icon: Lock, text: "One attempt. If you leave the draft, the clock keeps running and leftover slots auto-pick." },
  { icon: Banknote, text: "Snake the board with $35. Last pick can go down to $1." },
  { icon: MousePointerClick, text: "Select players names to see their current season stats." },
  {
    icon: Star,
    text: `Score over ${DAILY_SCORE_LINE} pays $1. Top score for the day wins a bonus $1 and Daily Star.`,
  },
];

export function DailyStartScreen({ onClose, onSeeResults }: { onClose: () => void; onSeeResults: () => void }) {
  const startDaily = useGame((s) => s.startDaily);
  const busy = useGame((s) => s.busy);
  const netError = useGame((s) => s.netError);
  const { user, isPending } = useCurrentUserState();
  const gm = useGmPrefill();
  const [meta, setMeta] = useState<DailyMeta | null>(null);

  useEffect(() => {
    let live = true;
    void getDaily({ data: {} })
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
  const blocked = meta?.status === "done";
  const resume = meta?.status === "playing";

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">Daily Elimination</p>
          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg">
            Darkness
          </h1>
        </div>
        <AuthBar className="shrink-0" />
      </header>

      <section className="mt-8 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <YesterdayWinner size="lg" />

        <ul className="mt-6 grid gap-3">
          {RULES.map((line) => (
            <li key={line.text} className="flex gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
                <line.icon className="size-4" strokeWidth={1.75} />
              </span>
              <p className="text-sm leading-relaxed text-fg">
                {line.text.endsWith("Daily Star.") ? (
                  <>
                    Score over {DAILY_SCORE_LINE} pays $1. Top score for the day wins a bonus $1 and Daily Star
                    <Star
                      className="ml-1 inline size-3.5 align-[-2px] text-accent"
                      fill="currentColor"
                      aria-hidden
                    />
                    .
                  </>
                ) : (
                  line.text
                )}
              </p>
            </li>
          ))}
        </ul>

        {netError ? <p className="mt-4 rounded-md bg-danger/20 px-3 py-2 text-sm text-fg">{netError}</p> : null}

        {!signedIn ? (
          <p className="mt-4 text-sm text-muted">
            Sign in to take today’s run
            {gm ? ` as ${gm}` : ""}.
          </p>
        ) : null}

        {meta?.status === "done" && meta.score != null ? (
          <p className="mt-4 text-sm text-fg">
            You scored <span className="font-display font-semibold tabular-nums">{meta.score.toFixed(1)}</span>
            {meta.paid ? " · $1 banked" : ""}.
          </p>
        ) : null}

        {blocked ? (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full font-display uppercase tracking-wider"
            onClick={onSeeResults}
          >
            See results
          </Button>
        ) : signedIn ? (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full font-display uppercase tracking-wider"
            disabled={busy || !meta}
            onClick={() => void startDaily()}
          >
            <Sun className="size-4" />
            {busy ? "Starting…" : resume ? "Resume match" : "Start match"}
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
