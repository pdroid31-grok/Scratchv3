"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star, X } from "lucide-react";
import { SliceStats } from "@/components/game/book-slice";
import type { RankTabId } from "@/components/game/rank-tabs";
import { CLOSET_AVATARS, SHIRT_AVATARS, avatarById, isShirtAvatar, isUnlocked, remainingToUnlock } from "@/lib/game/avatars";
import type { PublicBook } from "@/lib/game/stats";

export function PlayerBook({ book, board: start }: { book: PublicBook; board: RankTabId }) {
  const avatar = avatarById(book.avatarId);

  return (
    <section className="mt-6 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Face src={avatar.src} alt={avatar.name} className="size-20 rounded-lg object-cover shadow-[var(--shadow-border)] sm:size-24" />
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Book</p>
            <h1 className="mt-1 truncate font-display text-3xl font-semibold uppercase tracking-wide text-fg">
              {book.name}
            </h1>
            <p className="mt-1 text-sm text-muted">{avatar.name}</p>
            <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold tabular-nums text-fg">
              <span>${book.coins ?? 0}</span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 text-accent" fill="currentColor" />
                {book.dailyStars ?? 0}
              </span>
            </p>
          </div>
        </div>
        <Link
          to="/"
          search={{ tab: "rankings", board: start }}
          className="inline-flex h-11 min-h-11 shrink-0 items-center rounded-md bg-fg px-3 text-sm font-medium text-bg hover:bg-fg/90 sm:px-4"
        >
          Back to Rankings
        </Link>
      </div>
      <div className="mt-4">
        <SliceStats slice={book.total} empty="No matches on the book yet." />
      </div>
      <UnlockedCloset owned={book.owned ?? ["poor"]} wearing={book.avatarId} />
      <Link
        to="/"
        search={{ tab: "rankings", board: start }}
        className="mt-5 inline-flex h-11 min-h-11 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:bg-fg/90"
      >
        Back to Rankings
      </Link>
    </section>
  );
}

function Face({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="shrink-0"
        aria-label="View avatar"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} className={className} />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Avatar"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[min(80vh,28rem)] w-full max-w-sm rounded-xl object-cover shadow-[var(--shadow-border)]"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

function UnlockedCloset({ owned, wearing }: { owned: string[]; wearing: string }) {
  const unlocked = CLOSET_AVATARS.filter((avatar) => isUnlocked(avatar.id, owned));
  const left = remainingToUnlock(owned);
  if (unlocked.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Characters</p>
      <p className="mt-2 font-display text-xl font-semibold tabular-nums text-fg">
        {left === 0 ? "All unlocked" : `${left} left to unlock`}
      </p>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {unlocked.map((avatar) => {
          const shirt = avatar.id === "holy";
          const shown = shirt
            ? SHIRT_AVATARS.find((option) => option.id === wearing) ??
              SHIRT_AVATARS.find((option) => owned.includes(option.id)) ??
              avatar
            : avatar;
          const on = shirt ? isShirtAvatar(wearing) : avatar.id === wearing;
          return (
            <li key={avatar.id} className="overflow-hidden rounded-lg bg-bg shadow-[var(--shadow-border)]">
              <div className="relative aspect-square overflow-hidden bg-surface-2">
                <img src={shown.src} alt="" className="size-full object-cover" />
                {on ? <span className="absolute inset-0 ring-2 ring-inset ring-accent" /> : null}
              </div>
              <p className="truncate px-2 py-1.5 text-center font-display text-xs font-semibold uppercase tracking-wide text-fg">
                {shirt ? "Shirt" : avatar.name}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
