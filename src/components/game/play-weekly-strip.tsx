"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { avatarById } from "@/lib/game/avatars";
import { dailyDayStamp } from "@/lib/game/daily";
import {
  getWeekly,
  listSeasonBoard,
  listWeeklyBoard,
  type SeasonBoardRow,
  type WeeklyBoard,
  type WeeklyBoardRow,
  type WeeklyMeta,
} from "@/lib/game/weekly-api";
import {
  WEEKLY_STRIP_CACHE,
  readKeyedCache,
  readWeeklyCur,
  weeklyStripKey,
  writeKeyedCache,
  writeWeeklyCur,
} from "@/lib/game/play-strip-cache";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type WeeklyStripCache = {
  key: string;
  meta: WeeklyMeta | null;
  board: WeeklyBoard | null;
  season: SeasonBoardRow | null;
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
  const [board, setBoard] = useState<WeeklyBoard | null>(null);
  const [season, setSeason] = useState<SeasonBoardRow | null>(null);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  useLayoutEffect(() => {
    const hit = readThisWeekCache();
    if (!hit) return;
    setMeta(hit.meta);
    setBoard(hit.board);
    setSeason(hit.season);
  }, []);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void Promise.all([
        getWeekly({ data: {} }),
        listWeeklyBoard({ data: { peek: true } }),
        listSeasonBoard({ data: {} }),
      ])
        .then(([nextMeta, nextBoard, nextSeason]) => {
          if (!live) return;
          const nextLeader = nextSeason.rows[0] ?? null;
          setMeta(nextMeta);
          setBoard(nextBoard);
          setSeason(nextLeader);
          const key = weeklyStripKey(nextMeta.season, nextMeta.week);
          const day = dailyDayStamp();
          writeKeyedCache(WEEKLY_STRIP_CACHE, {
            key,
            meta: nextMeta,
            board: nextBoard,
            season: nextLeader,
          });
          writeWeeklyCur(key, day);
        })
        .catch(() => {
          /* keep same-key cache; do not wipe this week's faces */
        });
    };
    pull();
    const id = window.setInterval(pull, 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [user?.id]);

  const live = Boolean(meta?.live || board?.live);
  const lockedIn = meta?.status === "done";
  const mineRow = user ? board?.rows.find((row) => row.id === user.id) : undefined;
  const mineScore = live ? (mineRow?.score ?? 0) : 0;
  const name = displayName.trim() || user?.displayName?.trim() || "GM";
  const mine = avatarById(avatarId);
  const lineups = board?.rows.filter((row) => row.hasPicks) ?? [];
  const weekLeader = live ? (lineups[0] ?? null) : null;

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
      <SeasonZone row={season} />
      <WeekLeaderZone live={live} row={weekLeader} />
    </button>
  );
}

function SeasonZone({ row }: { row: SeasonBoardRow | null }) {
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

function WeekLeaderZone({ live, row }: { live: boolean; row: WeeklyBoardRow | null }) {
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
