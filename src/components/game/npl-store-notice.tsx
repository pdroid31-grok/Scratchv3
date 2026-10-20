"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function NplStoreCopy() {
  return (
    <>
      <p className="font-display text-xl font-semibold uppercase tracking-wide text-fg">New Store Items Added (NPL)</p>
      <p className="mt-3 text-sm text-fg">
        This NFL offseason will begin the first NPL (National Pepe League) to fill weekly matches until the following NFL
        season. Check the store for current added items.
      </p>
    </>
  );
}

/** Same card as the toast. X and Escape only. Does not mark the toast seen. Does not grant. */
export function NplStoreDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New Store Items Added (NPL)"
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
          <NplStoreCopy />
        </div>
      </section>
    </div>
  );
}
