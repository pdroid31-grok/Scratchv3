"use client";

import { useState } from "react";
import { AuthBar } from "@/components/game/auth-bar";
import { MatchHelpCard } from "@/components/game/match-help";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import type { ElimEra } from "@/lib/game/elim-data";
import { cn } from "@/lib/utils";

const ERAS: { id: ElimEra; years: string }[] = [
  { id: "classic", years: "2006–2015" },
  { id: "modern", years: "2016–2025" },
];

export function ElimStartScreen() {
  const names = useGame((s) => s.names);
  const era = useGame((s) => s.elimEra ?? "modern");
  const ready = useGame((s) => s.elimReady ?? [false, false]);
  const mode = useGame((s) => s.mode);
  const mySeat = useGame((s) => s.mySeat);
  const setElimEra = useGame((s) => s.setElimEra);
  const readyElim = useGame((s) => s.readyElim);
  const reset = useGame((s) => s.reset);
  const host = mode === "local" || mySeat === 0;
  const [help, setHelp] = useState(false);
  const waiting = ready[0] !== ready[1] ? names[ready[0] ? 1 : 0] : null;
  const myReady = mySeat === 1 ? ready[1] : ready[0];

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
            Elimination
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg">
            Darkness
          </h1>
        </div>
        <AuthBar className="shrink-0" />
      </header>

      <section className="mt-8 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="text-center font-display text-xl font-semibold uppercase tracking-wide text-fg">
          {names[0]} <span className="text-muted">vs</span> {names[1]}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-full font-display uppercase tracking-wider"
          onClick={() => setHelp(true)}
        >
          Rules
        </Button>

        <p className="mt-6 font-display text-xs font-semibold uppercase tracking-[0.24em] text-subtle">
          Select era
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {ERAS.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={!host}
              aria-pressed={era === row.id}
              onClick={() => setElimEra(row.id)}
              className={cn(
                "min-h-16 rounded-lg px-3 py-3 text-center font-display text-lg font-semibold uppercase tracking-wide shadow-[var(--shadow-border)]",
                era === row.id ? "bg-fg text-bg" : "bg-surface-2 text-fg",
                !host && era !== row.id ? "opacity-50" : "",
              )}
            >
              {row.years}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          {host ? "You pick the era." : "Host picks the era."}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <GmChip name={names[0]} ready={ready[0]} />
          <GmChip name={names[1]} ready={ready[1]} />
        </div>

        {mode === "local" ? (
          <div className="mt-5 grid gap-2">
            <StartSeat name={names[0]} ready={ready[0]} waiting={waiting} onStart={() => readyElim(0)} />
            <StartSeat name={names[1]} ready={ready[1]} waiting={waiting} onStart={() => readyElim(1)} />
          </div>
        ) : (
          <StartSeat className="mt-5" ready={myReady} waiting={waiting} onStart={() => readyElim()} />
        )}
      </section>

      <Button type="button" variant="ghost" className="mt-6 self-center text-muted" onClick={() => reset()}>
        Leave match
      </Button>
      {help ? <MatchHelpCard kind="elimination" onClose={() => setHelp(false)} /> : null}
    </main>
  );
}

function GmChip({ name, ready }: { name: string; ready: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
      <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">{name || "GM"}</p>
      <p className={cn("mt-0.5 text-xs", ready ? "text-good" : "text-muted")}>{ready ? "Ready" : "Not ready"}</p>
    </div>
  );
}

function StartSeat({
  name,
  ready,
  waiting,
  onStart,
  className,
}: {
  name?: string;
  ready: boolean;
  waiting: string | null;
  onStart: () => void;
  className?: string;
}) {
  const label = ready
    ? waiting
      ? `Waiting on ${waiting}`
      : "Starting…"
    : name
      ? `${name} · Start match`
      : "Start match";
  return (
    <Button
      type="button"
      size="lg"
      className={cn("w-full font-display uppercase tracking-wider", className)}
      disabled={ready}
      onClick={onStart}
    >
      {label}
    </Button>
  );
}
