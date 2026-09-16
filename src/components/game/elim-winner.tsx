"use client";

import { useEffect, useState } from "react";
import { TeamMarks } from "@/components/game/team-logo";
import { Button } from "@/components/ui/button";
import { avatarById, type AvatarId } from "@/lib/game/avatars";
import { slotLabel } from "@/lib/game/elim-data";
import { elimDisplay, elimSeriesWinner, pickAt, type ElimState } from "@/lib/game/elim";
import type { Seat } from "@/lib/game/types";

export function ElimWinnerBanner({
  elim,
  names,
  avatars,
  wins,
}: {
  elim: ElimState;
  names: [string, string];
  avatars: [AvatarId, AvatarId];
  wins: [number, number];
}) {
  const winner = elimSeriesWinner(elim);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (winner === null) return;
    const id = window.setTimeout(() => setOpen(true), 1000);
    return () => window.clearTimeout(id);
  }, [winner, elim.weekWins?.join(":")]);

  if (winner === null || !open) return null;
  const seat: Seat = winner;
  const src = avatarById(avatars[seat] ?? "poor").src;
  const lineup = elimDisplay();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="elim-winner-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <div className="px-4 py-5 text-center sm:px-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">Match winner</p>
          <img
            src={src}
            alt=""
            className="mx-auto mt-3 size-20 rounded-lg object-cover shadow-[var(--shadow-border)] sm:size-24"
          />
          <h2
            id="elim-winner-title"
            className="mt-3 font-display text-3xl font-semibold uppercase tracking-tight text-fg"
          >
            {names[seat]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Wins {wins[seat]}–{wins[seat === 0 ? 1 : 0]}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-3 sm:px-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-subtle">Drafted team</p>
          <ol className="mt-2 grid gap-1">
            {lineup.map((slot) => {
              const pick = pickAt(elim.picks[seat], slot);
              return (
                <li key={slot} className="flex items-center gap-2 rounded-md bg-bg px-2 py-1.5">
                  <span className="w-8 shrink-0 font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
                    {slotLabel(slot)}
                  </span>
                  {pick ? (
                    <>
                      <TeamMarks player={pick.player} />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{pick.player.name}</span>
                      <span className="shrink-0 font-display text-xs tabular-nums text-muted">${pick.player.cost}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <Button
            type="button"
            size="lg"
            className="w-full font-display uppercase tracking-wider"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
