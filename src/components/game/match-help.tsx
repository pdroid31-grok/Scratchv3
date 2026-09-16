"use client";

import { useEffect } from "react";
import { Calendar, Dices, Gavel, ListOrdered, Shuffle, Timer, Trophy, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type RuleLine = { icon: LucideIcon; text: string };

const RULES: Record<"auction" | "elimination", { title: string; lines: readonly RuleLine[] }> = {
  auction: {
    title: "Auction",
    lines: [
      { icon: Users, text: "Two GMs. $25 each. Twelve lots of two same-position names." },
      { icon: Gavel, text: "Ratings stay hidden until the end. Pick a name, then bid or pass. Highest bid takes the player." },
      { icon: Trophy, text: "Fill QB, two RBs, two WRs, and TE. Highest total wins." },
      { icon: Shuffle, text: "Shuffle: once per night, $2, before the opening bid. Swaps both names on the lot." },
      { icon: Dices, text: "Reroll: $2, only on a forced $1 lot. Replaces the pair. 10% chance for a dud." },
    ],
  },
  elimination: {
    title: "Elimination",
    lines: [
      { icon: Calendar, text: "Host picks an era: 2006–2015 or 2016–2025. A random season from that era. Snake draft. $35 each." },
      { icon: ListOrdered, text: "Draft QB, two RBs, two WRs, TE, K, and D." },
      { icon: Timer, text: "You have 60 seconds per pick. Time out and a player is auto-picked." },
      { icon: Trophy, text: "Best of five weeks. Same lineups. Highest score wins the week. First to three takes the night." },
    ],
  },
};

export type MatchHelpKind = keyof typeof RULES;

export function MatchHelpButton({
  kind,
  onOpen,
}: {
  kind: MatchHelpKind;
  onOpen: (kind: MatchHelpKind) => void;
}) {
  return (
    <button
      type="button"
      className="mx-auto flex size-11 items-center justify-center"
      aria-label={`${RULES[kind].title} rules`}
      onClick={() => onOpen(kind)}
    >
      <span className="flex size-7 items-center justify-center rounded-full border-2 border-fg font-display text-base font-semibold leading-none text-fg">
        ?
      </span>
    </button>
  );
}

export function MatchHelpCard({ kind, onClose }: { kind: MatchHelpKind; onClose: () => void }) {
  const rules = RULES[kind];

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
      aria-labelledby="match-help-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">How it plays</p>
        <h2 id="match-help-title" className="mt-1 font-display text-3xl font-semibold uppercase tracking-tight text-fg">
          {rules.title}
        </h2>
        <ul className="mt-4 grid gap-3">
          {rules.lines.map((line) => (
            <li key={line.text} className="flex gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
                <line.icon className="size-4" strokeWidth={1.75} />
              </span>
              <p className="text-sm leading-relaxed text-fg">{line.text}</p>
            </li>
          ))}
        </ul>
        <Button type="button" size="lg" className="mt-5 w-full font-display uppercase tracking-wider" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
