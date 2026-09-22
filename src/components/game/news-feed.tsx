"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { ACHIEVEMENT_UNLOCKS, avatarById, starNeed } from "@/lib/game/avatars";
import { formatNewsTime, type NewsFace, type NewsItem } from "@/lib/game/news";
import { listNews, markNewsSeen, peekNewsUnseen } from "@/lib/game/news-api";

type LookPeek = { src: string; name: string };

const newsLinkClass =
  "mt-4 inline-flex w-full flex-nowrap items-center justify-center gap-2 whitespace-nowrap font-display text-xl font-semibold uppercase leading-none tracking-wide text-muted hover:text-fg sm:text-2xl";

const newsArrowClass = "size-7 shrink-0 sm:size-8";

export function NewsStrip({ onOpen }: { onOpen: () => void }) {
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    let live = true;
    async function pull() {
      try {
        const n = await peekNewsUnseen();
        if (live) setExtra(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
      } catch {
        if (live) setExtra(0);
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <button
      type="button"
      className={newsLinkClass}
      onClick={() => {
        void markNewsSeen();
        onOpen();
      }}
    >
      {extra > 0 ? <span className="shrink-0 leading-none">+{extra}</span> : null}
      <span className="leading-none">News Feed</span>
      <ArrowRight className={newsArrowClass} strokeWidth={2.5} aria-hidden />
    </button>
  );
}

export function NewsFeed({ onPlay }: { onPlay: () => void }) {
  const [rows, setRows] = useState<NewsItem[] | null>(null);
  const [peek, setPeek] = useState<LookPeek | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!peek) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPeek(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peek]);

  useEffect(() => {
    let live = true;
    void listNews()
      .then((next) => {
        if (live) {
          setRows(next);
          void markNewsSeen();
        }
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
    <>
    <div
      className="news-slide-in w-full min-w-0"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button type="button" className={newsLinkClass} onClick={onPlay}>
        <ArrowLeft className={newsArrowClass} strokeWidth={2.5} aria-hidden />
        <span className="leading-none">Play Matches</span>
      </button>
      <section className="mt-3 overflow-x-hidden rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]">
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
              <NewsLine item={row} onPeek={setPeek} />
            </li>
          ))}
        </ol>
      )}
      </section>
    </div>
    {peek ? <NewsLookPeek look={peek} onClose={() => setPeek(null)} /> : null}
    </>
  );
}

function NewsLookPeek({ look, onClose }: { look: LookPeek; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={look.name}
      onClick={onClose}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)]"
        aria-label="Close"
        onClick={onClose}
      >
        <X className="size-5" strokeWidth={2} />
      </button>
      <div className="flex w-full max-w-sm flex-col items-center" onClick={(event) => event.stopPropagation()}>
        <img
          src={look.src}
          alt=""
          className="max-h-[min(80vh,28rem)] w-full rounded-xl object-cover shadow-[var(--shadow-border)]"
        />
        <p className="mt-3 text-center font-display text-lg font-semibold uppercase tracking-wide text-fg">
          {look.name}
        </p>
      </div>
    </div>
  );
}

function Face({ face, onPeek }: { face: NewsFace; onPeek: (look: LookPeek) => void }) {
  const av = avatarById(face.avatarId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        className="shrink-0"
        aria-label={`View ${face.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPeek({ src: av.src, name: face.name });
        }}
      >
        <img src={av.src} alt="" className="size-7 rounded-md object-cover" />
      </button>
      <span className="truncate font-medium text-fg">{face.name}</span>
    </span>
  );
}

function PrizeMark({
  id,
  label,
  onPeek,
}: {
  id?: string;
  label?: string;
  onPeek: (look: LookPeek) => void;
}) {
  if (id) {
    const av = avatarById(id);
    const name = label || av.name;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          className="shrink-0"
          aria-label={`View ${name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPeek({ src: av.src, name });
          }}
        >
          <img src={av.src} alt="" className="size-7 rounded-md object-cover" />
        </button>
        <span className="truncate text-fg">{name}</span>
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

function NewsLine({ item, onPeek }: { item: NewsItem; onPeek: (look: LookPeek) => void }) {
  const a = item.faces[0];
  if (item.kind === "box" && a) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} onPeek={onPeek} />
        <span className="text-muted">opened</span>
        <PrizeMark id={item.prizeId} label={item.prizeLabel} onPeek={onPeek} />
        <span className="text-muted">from the mystery box</span>
      </p>
    );
  }
  if ((item.kind === "star_unlock" || item.kind === "feat_unlock") && a && item.prizeId) {
    const need = starNeed(item.prizeId);
    const how = ACHIEVEMENT_UNLOCKS.find((row) => row.id === item.prizeId)?.how ?? "";
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} onPeek={onPeek} />
        <span className="text-muted">unlocked</span>
        <PrizeMark id={item.prizeId} label={item.prizeLabel} onPeek={onPeek} />
        <span className="text-muted">
          {item.kind === "star_unlock"
            ? `from ${need} Daily stars`
            : how
              ? `from Achievement: ${how}`
              : "from Achievements"}
        </span>
      </p>
    );
  }
  if (item.kind === "scratch" && a) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} onPeek={onPeek} />
        <span className="text-muted">scratched</span>
        <PrizeMark id={item.prizeId} label={item.prizeLabel} onPeek={onPeek} />
      </p>
    );
  }
  if (item.kind === "daily_win" && a && item.day && item.score) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} onPeek={onPeek} />
        <span className="text-muted">won the</span>
        <span>{formatDay(item.day)} Daily</span>
        <span className="font-display tabular-nums">({item.score})</span>
      </p>
    );
  }
  if (item.kind === "weekly_win" && a && item.week && item.score) {
    const week = item.week.startsWith("Week") ? item.week : `Week ${item.week}`;
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg">
        <Face face={a} onPeek={onPeek} />
        <span className="text-muted">won</span>
        <span>{week}</span>
        <span className="font-display tabular-nums">({item.score})</span>
      </p>
    );
  }
  return null;
}
