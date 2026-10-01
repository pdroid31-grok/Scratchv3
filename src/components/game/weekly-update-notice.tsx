"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function WeeklyUpdateCopy() {
  return (
    <>
      <p className="font-display text-xl font-semibold uppercase tracking-wide text-fg">UPDATE TO WEEKLY</p>
      <p className="mt-3 text-sm text-fg">
        Weekly Draft Board will open Friday Mornings 0800 EST and Lock with the Sunday 1:00 slate games.
      </p>
      <p className="mt-3 text-sm text-muted">
        This will help the draft board avoid injured/questionable players and have a more accurate projection score.
      </p>
    </>
  );
}

/** Same card as the toast. X and Escape only. Does not mark the toast seen. */
export function WeeklyUpdateDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Update to Weekly"
    >
      <section className="relative max-h-[min(88vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-surface px-4 py-5 shadow-[var(--shadow-border)] sm:px-5">
        <button
          type="button"
          className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-5" strokeWidth={2} />
        </button>
        <div className="pr-12">
          <WeeklyUpdateCopy />
        </div>
      </section>
    </div>
  );
}
