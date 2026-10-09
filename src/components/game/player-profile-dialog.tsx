"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { PlayerBook } from "@/components/game/player-book";
import { getPublicProfile, type PublicBook } from "@/lib/game/stats";

const OpenPlayerProfile = createContext<(userId: string) => void>(() => {});

export function useOpenPlayerProfile(): (userId: string) => void {
  return useContext(OpenPlayerProfile);
}

export function PlayerProfileHost({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  return (
    <OpenPlayerProfile.Provider value={setUserId}>
      {children}
      {userId ? <PlayerProfileDialog userId={userId} onClose={() => setUserId(null)} /> : null}
    </OpenPlayerProfile.Provider>
  );
}

export function PlayerProfileDialog({
  userId,
  onClose,
  layer = "z-50",
}: {
  userId: string;
  onClose: () => void;
  layer?: string;
}) {
  const [book, setBook] = useState<PublicBook | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setBook(undefined);
    void getPublicProfile({ data: { userId } })
      .then((next) => {
        if (live) setBook(next);
      })
      .catch(() => {
        if (live) setBook(null);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={
        layer === "z-[80]"
          ? "fixed inset-0 z-[80] overflow-y-auto bg-bg/90 p-4 pt-16"
          : "fixed inset-0 z-50 overflow-y-auto bg-bg/90 p-4 pt-16"
      }
      role="dialog"
      aria-modal="true"
      aria-label="Player profile"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)]"
        aria-label="Close"
        onClick={onClose}
      >
        <X className="size-5" strokeWidth={2} />
      </button>
      <div className="mx-auto w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        {book === undefined ? (
          <div className="h-64 animate-pulse rounded-xl bg-surface/90" />
        ) : book === null ? (
          <section className="rounded-xl bg-surface/90 p-5 shadow-[var(--shadow-border)]">
            <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-fg">No book</h2>
            <p className="mt-2 text-sm text-muted">That GM isn’t on the board.</p>
          </section>
        ) : (
          <PlayerBook book={book} popup />
        )}
      </div>
    </div>
  );
}
