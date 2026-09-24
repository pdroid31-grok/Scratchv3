"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { avatarById } from "@/lib/game/avatars";
import { dailyDayStamp } from "@/lib/game/daily";
import { getWeekly, type WeeklyMeta } from "@/lib/game/weekly-api";
import {
  WEEKLY_STRIP_CACHE,
  readKeyedCache,
  readWeeklyCur,
  weeklyStripKey,
  writeKeyedCache,
  writeWeeklyCur,
} from "@/lib/game/play-strip-cache";
import { fetchPlayStrips, type PlayFace } from "@/lib/game/play-public";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type WeeklyStripCache = {
  key: string;
  meta: WeeklyMeta | null;
  seasonLeader: PlayFace | null;
  weekLeader: PlayFace | null;
  weekLive: boolean;
};

function readThisWeekCache(): WeeklyStripCache | null {
  const cur = readWeeklyCur();
  if (!cur || cur.day !== dailyDayStamp()) return null;
  return readKeyedCache<WeeklyStripCache>(WEEKLY_STRIP_CACHE, cur.key);
}

export function PlayWeeklyStrip({ onOpen }: { onOpen?: () => void }) {
  const { user } = useCurrentUserState();
  const load = useProfile((s) => s.load);
  const avatarId = useProfile((s) => s.avatarId);
  const displayName = useProfile((s) => s.displayName);
  const [meta, setMeta] = useState<WeeklyMeta | null>(null);
  const [seasonLeader, setSeasonLeader] = useState<PlayFace | null>(null);
  const [weekLeader, setWeekLeader] = useState<PlayFace | null>(null);
  const [weekLive, setWeekLive] = useState(false);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  useLayoutEffect(() => {
    const hit = readThisWeekCache();
    if (!hit) return;
    setMeta(hit.meta);
    setSeasonLeader(hit.seasonLeader ?? null);
    setWeekLeader(hit.weekLive ? (hit.weekLeader ?? null) : null);
    setWeekLive(Boolean(hit.weekLive));
  }, []);

  useEffect(() => {
    let live = true;
    const pull = () => {
      const day = dailyDayStamp();
      void (async () => {
        const strips = await fetchPlayStrips();
        if (!live) return;
        const fresh = strips && strips.etDay === day ? strips : null;
        if (fresh) {
          setSeasonLeader(fresh.seasonLeader);
          setWeekLive(fresh.weekLive);
          setWeekLeader(fresh.weekLive ? fresh.weekLeader : null);
        }
        try {
          const nextMeta = await getWeekly({ data: {} });
          if (!live) return;
          setMeta(nextMeta);
          const key = weeklyStripKey(fresh?.season ?? nextMeta.season, fresh?.week ?? nextMeta.week);
          const prev = readThisWeekCache();
          writeKeyedCache(WEEKLY_STRIP_CACHE, {
            key,
            meta: nextMeta,
            seasonLeader: fresh ? fresh.seasonLeader : (prev?.seasonLeader ?? null),
            weekLeader: fresh ? (fresh.weekLive ? fresh.weekLeader : null) : (prev?.weekLeader ?? null),
            weekLive: fresh ? fresh.weekLive : Boolean(prev?.weekLive),
          });
          writeWeeklyCur(key, day);
        } catch {
          /* keep same-key cache; do not wipe this week's faces */
        }
      })();
    };
    pull();
    const id = window.setInterval(pull, 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [user?.id]);

  const live = weekLive;
  const lockedIn = meta?.status === "done";
  const mineScore = live ? (meta?.score ?? 0) : 0;
  const name = displayName.trim() || user?.displayName?.trim() || "GM";
  const mine = avatarById(avatarId);

  let mineLabel = "Submit lineup";
  if (lockedIn) mineLabel = mineScore.toFixed(1);

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
              <span className="block text-[10px] tabular-nums text-muted">{mineLabel}</span>
            </span>
          </>
        ) : null}
      </div>
      <SeasonZone row={seasonLeader} />
      <WeekLeaderZone live={live} row={weekLeader} />
    </button>
  );
}

function SeasonZone({ row }: { row: PlayFace | null }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5">
      {row ? (
        <>
          <img src={avatarById(row.avatarId).src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
          <span className="min-w-0">
            <span className="block truncate font-display text-[9px] font-semibold uppercase tracking-wide text-muted">
              Season Leader
            </span>
            <span className="block truncate text-[10px] text-fg">
              {row.name} <span className="tabular-nums text-muted">{row.score.toFixed(1)}</span>
            </span>
          </span>
        </>
      ) : (
        <span className="min-w-0 text-center">
          <span className="block font-display text-[9px] font-semibold uppercase tracking-wide text-muted">
            Season Leader
          </span>
          <span className="block text-[10px] text-muted">None</span>
        </span>
      )}
    </div>
  );
}

function WeekLeaderZone({ live, row }: { live: boolean; row: PlayFace | null }) {
  return (
    <div className="flex min-w-0 items-center justify-end gap-1.5">
      {live && row ? (
        <>
          <span className="min-w-0 text-right">
            <span className="block truncate font-display text-[9px] font-semibold uppercase tracking-wide text-muted">
              Week Leader
            </span>
            <span className="block truncate text-[10px] text-fg">
              {row.name} <span className="tabular-nums text-muted">{row.score.toFixed(1)}</span>
            </span>
          </span>
          <img src={avatarById(row.avatarId).src} alt="" className="size-7 shrink-0 rounded-md object-cover" />
        </>
      ) : (
        <span className="min-w-0 text-right">
          <span className="block font-display text-[9px] font-semibold uppercase tracking-wide text-muted">
            Week Leader
          </span>
          <span className="block text-[10px] text-muted">{live ? "None" : "Waiting for Kickoff"}</span>
        </span>
      )}
    </div>
  );
}
