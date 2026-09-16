"use client";

import type { BookSlice, CareerOpponent } from "@/lib/game/stats";

export function BookFormats({
  slices,
  opponents,
}: {
  slices: { total: BookSlice; auction?: BookSlice; elimination?: BookSlice };
  opponents?: { total?: CareerOpponent[] };
}) {
  return (
    <div className="mt-4">
      <SliceStats
        slice={slices.total}
        empty="No matches on the book yet."
        opponents={opponents?.total}
      />
    </div>
  );
}

export function SliceStats({
  slice,
  empty,
  opponents,
}: {
  slice: BookSlice;
  empty: string;
  opponents?: CareerOpponent[];
}) {
  if (slice.games === 0 && slice.wins === 0 && slice.losses === 0 && !opponents?.length) {
    void empty;
    return (
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Record" value="0–0" hint="0 nights" />
        <Stat label="Nights" value="0" />
        <Stat label="High" value="—" />
        <Stat label="Low" value="—" />
      </dl>
    );
  }
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <Stat
          label="Record"
          value={`${slice.wins}–${slice.losses}`}
          hint={slice.ties ? `${slice.ties} draw${slice.ties === 1 ? "" : "s"}` : `${slice.games} nights`}
        />
        <Stat label="Nights" value={String(slice.games)} />
        <Stat label="High" value={slice.highest == null ? "—" : String(slice.highest)} />
        <Stat label="Low" value={slice.lowest == null ? "—" : String(slice.lowest)} />
      </dl>
      {opponents && opponents.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-subtle">
            Most played
          </p>
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
        </div>
      ) : null}
    </>
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