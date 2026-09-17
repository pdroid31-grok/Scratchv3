"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { avatarById } from "@/lib/game/avatars";
import { formatNewsTime, type NewsFace, type NewsItem } from "@/lib/game/news";
import { listNews } from "@/lib/game/news-api";

export function NewsStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      type="button"
      size="lg"
      className="w-full font-display uppercase tracking-wider"
      onClick={onOpen}
    >
      <Newspaper className="size-4" />
      News
    </Button>
  );
}

export function NewsFeed({ onPlay }: { onPlay: () => void }) {
  const [rows, setRows] = useState<NewsItem[] | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void listNews()
      .then((next) => {
        if (live) setRows(next);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, []);

  function onTouchStart(event: React.TouchEvent) {
    startX.current = event.changedTouches[0]?.clientX ?? null;
    startY.current = event.changedTouches[0]?.clientY ?? null;
  }
  function onTouchEnd(event: React.TouchEvent) {
    const fromX = startX.current;
    const fromY = startY.current;
    startX.current = null;
    startY.current = null;
    const toX = event.changedTouches[0]?.clientX;
    const toY = event.changedTouches[0]?.clientY;
    if (fromX == null || fromY == null || toX == null || toY == null) return;
    const dx = toX - fromX;
    const dy = Math.abs(toY - fromY);
    if (dx > 60 && dx > dy) onPlay();
  }

  return (
    <section
      className="news-slide-in mt-6 w-full min-w-0 overflow-x-hidden rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Button type="button" size="lg" className="w-full font-display uppercase tracking-wider" onClick={onPlay}>
        <Gamepad2 className="size-4" />
        Play
      </Button>
      {rows == null ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-bg" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing yet. Live finishes show up here.</p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg bg-bg px-3 py-2.5 shadow-[var(--shadow-border)]">
              <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted">
                {formatNewsTime(row.at)}
              </p>
              <NewsLine item={row} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Face({ face }: { face: NewsFace }) {
  const av = avatarById(face.avatarId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <img src={av.src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
      <span className="truncate font-medium text-fg">{face.name}</span>
    </span>
  );
}

function PrizeMark({ id, label }: { id?: string; label?: string }) {
  if (id) {
    const av = avatarById(id);
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <img src={av.src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
        <span className="truncate text-fg">{label || av.name}</span>
      </span>
    );
  }
  return <span className="text-fg">{label || "Nothing"}</span>;
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function NewsLine({ item }: { item: NewsItem }) {
  const a = item.faces[0];
  const b = item.faces[1];
  if (item.kind === "match" && a && b) {
    const tied = item.score?.includes("–") && item.score.split("–")[0] === item.score.split("–")[1];
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} />
        <span className="text-muted">{tied ? "tied" : "beat"}</span>
        <Face face={b} />
        {item.score ? <span className="font-display tabular-nums text-fg">{item.score}</span> : null}
      </p>
    );
  }
  if (item.kind === "box" && a) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} />
        <span className="text-muted">opened</span>
        <PrizeMark id={item.prizeId} label={item.prizeLabel} />
      </p>
    );
  }
  if (item.kind === "scratch" && a) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} />
        <span className="text-muted">scratched</span>
        <PrizeMark id={item.prizeId} label={item.prizeLabel} />
      </p>
    );
  }
  if (item.kind === "daily_win" && a) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} />
        <span className="text-muted">won</span>
        <span>{item.day ? formatDay(item.day) : "Daily"}</span>
        {item.score ? <span className="font-display tabular-nums">{item.score}</span> : null}
      </p>
    );
  }
  if (item.kind === "weekly_win" && a) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} />
        <span className="text-muted">won</span>
        <span>{item.week ?? "Weekly"}</span>
        {item.score ? <span className="font-display tabular-nums">{item.score}</span> : null}
      </p>
    );
  }
  return null;
}
