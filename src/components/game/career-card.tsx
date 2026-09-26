"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BookFormats, bookHasScores } from "@/components/game/book-slice";
import { getMyStats, type CareerBook } from "@/lib/game/stats";

export function CareerCard() {
  const { user, isPending } = useCurrentUserState();
  const [book, setBook] = useState<CareerBook | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isPending || !user) {
      setBook(null);
      return;
    }
    let live = true;
    void getMyStats()
      .then((next) => {
        if (live) setBook(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [isPending, user]);

  if (isPending) {
    return <div className="mt-5 h-40 animate-pulse rounded-xl bg-surface/90" />;
  }

  if (!user) {
    return (
      <section className="mt-5 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]">
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Career book</p>
        <p className="mt-1 text-sm text-muted">
          Sign in to keep wins, losses, and your high and low nights across devices.
        </p>
        <Link
          to="/login"
          className="mt-3 inline-flex h-11 min-h-11 items-center rounded-md bg-surface-2 px-4 text-sm font-medium text-fg shadow-[var(--shadow-border)] hover:bg-surface-2/80"
        >
          Open the book
        </Link>
      </section>
    );
  }

  if (failed || !book) {
    return (
      <section className="mt-5 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]">
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Career book</p>
        <p className="mt-1 text-sm text-muted">{failed ? "Could not load the book." : "Loading nights…"}</p>
      </section>
    );
  }

  if (!bookHasScores(book)) {
    return (
      <section className="mt-5 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]">
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Career book</p>
        <p className="mt-1 text-sm text-muted">No nights yet. Finish an auction and it lands here.</p>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Career</p>
      <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Your book</h2>
      <BookFormats
        slices={{ total: book.total, auction: book.auction, elimination: book.elimination }}
        opponents={book.opponentsBy}
      />
    </section>
  );
}
