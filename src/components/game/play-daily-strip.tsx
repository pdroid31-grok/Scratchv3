"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { avatarById } from "@/lib/game/avatars";
import { dailyDayStamp } from "@/lib/game/daily";
import { getDaily, type DailyMeta } from "@/lib/game/daily-api";
import { DAILY_STRIP_CACHE, readKeyedCache, writeKeyedCache } from "@/lib/game/play-strip-cache";
import { fetchPlayStrips, type PlayFace, type PlayStrips } from "@/lib/game/play-public";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type DailyStripCache = {
  key: string;
  meta: DailyMeta | null;
  yesterdayWinner: PlayFace | null;
  todayLeader: PlayFace | null;
};

function readTodayDailyCache(): DailyStripCache | null {
  return readKeyedCache<DailyStripCache>(DAILY_STRIP_CACHE, dailyDayStamp());
}

const STRIP_POLL_MS = 60_000;

type StripListener = (strips: PlayStrips | null) => void;

const stripListeners = new Set<StripListener>();
let stripTimer = 0;
let stripPull: Promise<void> | null = null;

function tabVisible(): boolean {
  return document.visibilityState === "visible";
}

function pullPlayStrips(): Promise<void> {
  if (stripPull) return stripPull;
  stripPull = fetchPlayStrips()
    .then((strips) => {
      for (const listener of stripListeners) listener(strips);
    })
    .finally(() => {
      stripPull = null;
    });
  return stripPull;
}

function stopStripPoll() {
  if (!stripTimer) return;
  window.clearInterval(stripTimer);
  stripTimer = 0;
}

function startStripPoll() {
  if (stripTimer || stripListeners.size === 0 || !tabVisible()) return;
  stripTimer = window.setInterval(() => {
    if (!tabVisible()) return;
    void pullPlayStrips();
  }, STRIP_POLL_MS);
}

function onStripVisibility() {
  if (!tabVisible()) {
    stopStripPoll();
    return;
  }
  void pullPlayStrips();
  startStripPoll();
}

export function subscribePlayStrips(listener: StripListener): () => void {
  stripListeners.add(listener);
  if (stripListeners.size === 1) document.addEventListener("visibilitychange", onStripVisibility);
  if (tabVisible()) {
    void pullPlayStrips();
    startStripPoll();
  }
  return () => {
    stripListeners.delete(listener);
    if (stripListeners.size > 0) return;
    stopStripPoll();
    document.removeEventListener("visibilitychange", onStripVisibility);
  };
}

export function PlayDailyStrip({ onOpen }: { onOpen?: () => void }) {
  const { user } = useCurrentUserState();
  const load = useProfile((s) => s.load);
  const avatarId = useProfile((s) => s.avatarId);
  const displayName = useProfile((s) => s.displayName);
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  const [yesterdayWinner, setYesterdayWinner] = useState<PlayFace | null>(null);
  const [todayLeader, setTodayLeader] = useState<PlayFace | null>(null);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  useLayoutEffect(() => {
    const hit = readTodayDailyCache();
    if (!hit) return;
    setMeta(hit.meta);
    setYesterdayWinner(hit.yesterdayWinner ?? null);
    setTodayLeader(hit.todayLeader ?? null);
  }, []);

  useEffect(() => {
    let live = true;
    const apply = (strips: PlayStrips | null) => {
      const day = dailyDayStamp();
      void (async () => {
        if (!live) return;
        if (strips && strips.etDay === day) {
          setYesterdayWinner(strips.yesterdayWinner);
          setTodayLeader(strips.todayLeader);
        }
        try {
          const nextMeta = await getDaily({ data: {} });
          if (!live) return;
          setMeta(nextMeta);
          const kept = strips && strips.etDay === day ? strips : null;
          const prev = readTodayDailyCache();
          writeKeyedCache(DAILY_STRIP_CACHE, {
            key: day,
            meta: nextMeta,
            yesterdayWinner: kept ? kept.yesterdayWinner : (prev?.yesterdayWinner ?? null),
            todayLeader: kept ? kept.todayLeader : (prev?.todayLeader ?? null),
          });
        } catch {
          /* keep same-key cache; do not wipe today's faces */
        }
      })();
    };
    const stop = subscribePlayStrips((strips) => {
      if (live) apply(strips);
    });
    return () => {
      live = false;
      stop();
    };
  }, [user?.id]);

  const mineDone = meta?.status === "done" && meta.score != null;
  const name = displayName.trim() || user?.displayName?.trim() || "GM";
  const mine = avatarById(avatarId);
  const leader = todayLeader;
  const yest = yesterdayWinner;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid h-12 min-h-12 w-full grid-cols-3 items-center gap-1 rounded-md bg-surface-2 px-2 text-left shadow-[var(--shadow-border)]"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {user ? (
          <>
            <img src={mine.src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
            <span className="min-w-0">
              <span className="block truncate font-display text-[10px] font-semibold uppercase tracking-wide text-fg">
                {name}
              </span>
              <span className="block text-[10px] tabular-nums text-muted">
                {mineDone ? meta.score!.toFixed(1) : "New Day"}
              </span>
            </span>
          </>
        ) : null}
      </div>
      <PersonZone label="Yesterday’s Winner" row={yest} empty="—" />
      <PersonZone label="Today’s Leader" row={leader} empty="None" align="right" />
    </button>
  );
}

function PersonZone({
  label,
  row,
  empty,
  align = "center",
}: {
  label: string;
  row: PlayFace | null;
  empty: string;
  align?: "center" | "right";
}) {
  return (
    <div
      className={
        align === "right"
          ? "flex min-w-0 items-center justify-end gap-1.5"
          : "flex min-w-0 items-center justify-center gap-1.5"
      }
    >
      {row ? (
        <>
          {align === "right" ? null : (
            <img src={avatarById(row.avatarId).src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
          )}
          <span className={align === "right" ? "min-w-0 text-right" : "min-w-0"}>
            <span className="block truncate font-display text-[9px] font-semibold uppercase tracking-wide text-muted">
              {label}
            </span>
            <span className="block truncate text-[10px] text-fg">
              {row.name} <span className="tabular-nums text-muted">{row.score.toFixed(1)}</span>
            </span>
          </span>
          {align === "right" ? (
            <img src={avatarById(row.avatarId).src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
          ) : null}
        </>
      ) : (
        <span className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-center"}>
          <span className="block font-display text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</span>
          <span className="block text-[10px] text-muted">{empty}</span>
        </span>
      )}
    </div>
  );
}
