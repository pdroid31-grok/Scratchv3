"use client";

import { useEffect, useState } from "react";
import { Lock, Star, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAR_UNLOCKS, avatarById } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { cn } from "@/lib/utils";

export function DailyUnlocksButton({ className, compact }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button
          type="button"
          className={cn(
            "flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg bg-bg px-2.5 text-fg shadow-[var(--shadow-border)] hover:bg-surface-2",
            className,
          )}
          onClick={() => setOpen(true)}
        >
          <Sun className="size-4 text-turf" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider">Unlocks</span>
        </button>
      ) : (
        <Button
          type="button"
          size="lg"
          className={cn("w-full bg-fg font-display uppercase tracking-wider text-bg hover:bg-fg/90", className)}
          onClick={() => setOpen(true)}
        >
          <Sun className="size-4" />
          Daily Unlocks
        </Button>
      )}
      {open ? <DailyUnlocksSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function DailyUnlocksSheet({ onClose }: { onClose: () => void }) {
  const book = useProfile((s) => s.book);
  const wearing = useProfile((s) => s.avatarId);
  const pick = useProfile((s) => s.pick);
  const load = useProfile((s) => s.load);
  const stars = book?.dailyStars ?? 0;
  const owned = book?.owned ?? ["poor"];

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Daily unlocks"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Daily stars</p>
            <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Unlocks</h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <Star className="size-3.5 text-accent" fill="currentColor" />
              <span className="tabular-nums">{stars}</span>
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
        <ul className="grid grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
          {STAR_UNLOCKS.map((row) => {
            const avatar = avatarById(row.id);
            const unlocked = owned.includes(row.id);
            const on = wearing === row.id;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    if (unlocked) void pick(row.id);
                  }}
                  className={cn(
                    "flex w-full flex-col overflow-hidden rounded-lg bg-bg text-left shadow-[var(--shadow-border)]",
                    on && "ring-2 ring-accent",
                    !unlocked && "opacity-80",
                  )}
                >
                  <div className="relative aspect-square overflow-hidden bg-surface-2">
                    <img src={avatar.src} alt="" className="size-full object-cover" />
                    {!unlocked ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-bg/45">
                        <Lock className="size-6 text-fg" strokeWidth={2} />
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate px-2 pt-1.5 text-center font-display text-xs font-semibold uppercase tracking-wide text-fg">
                    {avatar.name}
                  </p>
                  <p className="flex items-center justify-center gap-1 px-2 pb-2 text-[11px] tabular-nums text-muted">
                    <Star className="size-3 text-accent" fill="currentColor" />
                    {row.stars}
                    {unlocked ? " · owned" : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
