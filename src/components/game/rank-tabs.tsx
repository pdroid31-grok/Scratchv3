"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { RANK_TABS, rankTabIndex, type RankTabId } from "@/lib/game/rank-tabs";
import { cn } from "@/lib/utils";

export { RANK_TABS, BOOK_TABS, LEADERBOARD_TABS, parseRankTab, type RankTabId } from "@/lib/game/rank-tabs";

export function RankSwipe({
  initial = "total",
  tabs = RANK_TABS,
  onTab,
  children,
}: {
  initial?: RankTabId;
  tabs?: readonly { id: RankTabId; label: string; hint: string; empty: string }[];
  onTab?: (tab: RankTabId) => void;
  children: (tab: RankTabId) => ReactNode;
}) {
  const startTab = tabs.some((row) => row.id === initial) ? initial : tabs[0]?.id ?? "total";
  const [tab, setTab] = useState<RankTabId>(startTab);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);

  const go = (id: RankTabId) => {
    setTab(id);
    onTab?.(id);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    if (!origin || axis.current) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    axis.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
    if (axis.current === "x") e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    const locked = axis.current;
    start.current = null;
    axis.current = null;
    if (!origin || locked !== "x") return;
    const dx = e.clientX - origin.x;
    if (Math.abs(dx) < 48) return;
    const i = rankTabIndex(tab, tabs);
    const next = dx < 0 ? tabs[i + 1] : tabs[i - 1];
    if (next) go(next.id);
  };

  const cols = tabs.length >= 5 ? "grid-cols-5" : tabs.length === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <>
      <div className={cn("mt-3 grid gap-1 rounded-lg bg-bg p-1", cols)}>
        {tabs.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => go(row.id)}
            className={cn(
              "h-11 rounded-md px-0.5 font-display font-semibold uppercase tracking-wide",
              tabs.length >= 5 ? "text-[9px] sm:text-[11px]" : "text-[10px] sm:text-xs tracking-wider",
              tab === row.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      <div
        className="mt-3 touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          axis.current = null;
        }}
      >
        {children(tab)}
      </div>
    </>
  );
}