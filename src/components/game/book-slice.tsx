"use client";

import { useState } from "react";
import type { BookSlice, CareerOpponent } from "@/lib/game/stats";
import { ACHIEVEMENT_IDS, ACHIEVEMENT_UNLOCKS } from "@/lib/game/avatars";

export function bookHasScores(book: {
  games: number;
  highest?: number | null;
  lowest?: number | null;
  total?: { highest: number | null; lowest: number | null } | null;
}): boolean {
  if (book.games > 0) return true;
  if (book.highest != null || book.lowest != null) return true;
  return book.total?.highest != null || book.total?.lowest != null;
}

function mark(n: number | null | undefined): string {
  return n == null ? "—" : String(n);
}

function highLow(high: number | null | undefined, low: number | null | undefined): string {
  return `${mark(high)} / ${mark(low)}`;
}

function achievementCount(owned: readonly string[] | undefined): string {
  const have = new Set(owned ?? []);
  let n = 0;
  for (const id of have) if (ACHIEVEMENT_IDS.has(id)) n += 1;
  return `${n} / ${ACHIEVEMENT_UNLOCKS.length}`;
}

export function BookFormats({
  slices,
  opponents,
  owned,
}: {
  slices: { total: BookSlice; auction?: BookSlice; elimination?: BookSlice };
  opponents?: { total?: CareerOpponent[] };
  owned?: readonly string[];
}) {
  return (
    <div className="mt-4">
      <SliceStats
        slice={slices.total}
        empty="No matches on the book yet."
        opponents={opponents?.total}
        owned={owned}
      />
    </div>
  );
}

export function SliceStats({
  slice,
  empty,
  opponents,
  owned,
  featCard,
}: {
  slice: BookSlice;
  empty: string;
  opponents?: CareerOpponent[];
  owned?: readonly string[];
  featCard?: boolean;
}) {
  const hasMark = slice.highest != null || slice.lowest != null;
  const feats = achievementCount(owned);
  const blank = !hasMark && slice.games === 0 && slice.wins === 0 && slice.losses === 0 && !opponents?.length;
  if (blank) void empty;
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <Stat
          label="Record"
          value={blank ? "0–0" : `${slice.wins}–${slice.losses}`}
          hint={blank ? "0 nights" : slice.ties ? `${slice.ties} draw${slice.ties === 1 ? "" : "s"}` : `${slice.games} nights`}
        />
        <Stat label="Nights" value={blank ? "0" : String(slice.games)} />
        <Stat label="High / Low" value={blank ? "— / —" : highLow(slice.highest, slice.lowest)} />
        {featCard ? (
          <div className="rounded-md bg-[#d4e8ff] px-3 py-3 text-bg shadow-[var(--shadow-border)]">
            <dt className="text-[11px] uppercase tracking-[0.16em]">Achievements</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums leading-none">{feats}</dd>
          </div>
        ) : (
          <Stat label="Achievements" value={feats} />
        )}
      </dl>
      {opponents && opponents.length > 0 ? <MostPlayed opponents={opponents} /> : null}
    </>
  );
}

function MostPlayed({ opponents }: { opponents: CareerOpponent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-subtle">Most played</p>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Hide most played" : "Show most played"}
          onClick={() => setOpen((on) => !on)}
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-base leading-none text-fg"
        >
          {open ? "−" : "+"}
        </button>
      </div>
      {open ? (
        <ul className="mt-2 grid gap-1.5">
          {opponents.map((opp) => (
            <li key={opp.name} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-fg">{opp.name}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {opp.wins}–{opp.losses}
                <span className="text-subtle"> · {opp.games}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-bg px-3 py-3">
      <dt className="text-[11px] uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tabular-nums leading-none text-fg">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}