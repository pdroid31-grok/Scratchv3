"use client";

import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACHIEVEMENT_UNLOCKS, avatarById } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { cn } from "@/lib/utils";

export function AchievementsButton({ className, compact }: { className?: string; compact?: boolean }) {
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
          <Trophy className="size-4 text-turf" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider">Feats</span>
        </button>
      ) : (
        <Button
          type="button"
          size="lg"
          className={cn("w-full bg-fg font-display uppercase tracking-wider text-bg hover:bg-fg/90", className)}
          onClick={() => setOpen(true)}
        >
          <Trophy className="size-4" />
          Achievements
        </Button>
      )}
      {open ? <AchievementsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function AchievementsSheet({ onClose }: { onClose: () => void }) {
  const book = useProfile((s) => s.book);
  const load = useProfile((s) => s.load);
  const owned = book?.owned ?? ["poor"];

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Achievements"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Store</p>
            <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Achievements</h2>
            <p className="mt-1 text-sm text-muted">Earn these looks. Equip them in the closet.</p>
            <p className="mt-1 text-sm text-muted">All obtained Achievements award +50 scratch points.</p>
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
        <ul className="grid gap-2 overflow-y-auto p-4">
          {ACHIEVEMENT_UNLOCKS.map((row) => {
            const avatar = avatarById(row.id);
            const unlocked = owned.includes(row.id);
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2.5 shadow-[var(--shadow-border)]"
              >
                <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-black">
                  {unlocked ? (
                    <img src={avatar.src} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center font-display text-2xl font-semibold text-white">
                      ?
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                    {avatar.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{row.how}</p>
                  {unlocked ? (
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-turf">Owned</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
