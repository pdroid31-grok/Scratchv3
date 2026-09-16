"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { LOAN_PENALTY } from "@/lib/game/halftime";
import { useGame } from "@/lib/game/store";
import { GmName } from "@/components/game/gm-name";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoanPopup() {
  const loans = useGame((s) => s.loans);
  const nights = useGame((s) => s.nights);
  const key = `${nights}:${loans.map((loan) => `${loan.seat}:${loan.taken}`).join(",")}`;
  const [acked, setAcked] = useState<string | null>(null);

  useEffect(() => {
    setAcked((prev) => (prev && !loans.length ? null : prev));
  }, [loans.length]);

  if (!loans.length || acked === key) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loan-title"
    >
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <span className="flex size-11 items-center justify-center rounded-md bg-danger/15 text-danger">
          <Landmark className="size-5" strokeWidth={1.75} />
        </span>
        <h2
          id="loan-title"
          className="mt-3 font-display text-3xl font-semibold uppercase tracking-tight text-fg"
        >
          Bankrupt
        </h2>
        <ul className="mt-3 grid gap-3">
          {loans.map((loan) => (
            <li key={loan.seat}>
              <p
                className={cn(
                  "font-display text-xl font-semibold uppercase tracking-wide",
                  loan.seat === 0 ? "text-p1" : "text-p2",
                )}
              >
                <GmName
                  seat={loan.seat}
                  size="md"
                  nameClassName={loan.seat === 0 ? "text-p1" : "text-p2"}
                />{" "}
                went bankrupt
              </p>
              <p className="mt-1 text-sm text-muted">
                They’ll have to take a loan and lose {LOAN_PENALTY} points. The box take was
                reversed so they can still finish the night.
              </p>
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          className="mt-5 w-full font-display uppercase tracking-wider"
          onClick={() => setAcked(key)}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
