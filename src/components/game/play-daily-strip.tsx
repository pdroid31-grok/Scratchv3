"use client";

import { useEffect, useState } from "react";
import { avatarById } from "@/lib/game/avatars";
import { dailyDayStamp, dailyYesterday } from "@/lib/game/daily";
import { getDaily, listDailyBoard, type DailyBoard, type DailyBoardRow, type DailyMeta } from "@/lib/game/daily-api";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function PlayDailyStrip({ onOpen }: { onOpen?: () => void }) {
  const { user } = useCurrentUserState();
  const load = useProfile((s) => s.load);
  const avatarId = useProfile((s) => s.avatarId);
  const displayName = useProfile((s) => s.displayName);
  const [meta, setMeta] = useState<DailyMeta | null>(null);
  const [todayBoard, setTodayBoard] = useState<DailyBoard | null>(null);
  const [yestBoard, setYestBoard] = useState<DailyBoard | null>(null);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  useEffect(() => {
    let live = true;
    const day = dailyDayStamp();
    const yest = dailyYesterday(day);
    const pull = () => {
      void Promise.all([
        getDaily({ data: {} }),
        listDailyBoard({ data: { day } }),
        listDailyBoard({ data: { day: yest } }),
      ])
        .then(([nextMeta, nextToday, nextYest]) => {
          if (!live) return;
          setMeta(nextMeta);
          setTodayBoard(nextToday);
          setYestBoard(nextYest);
        })
        .catch(() => {
          if (!live) return;
          setMeta(null);
          setTodayBoard({ day, year: 0, week: null, awarded: false, winnerId: null, rows: [] });
          setYestBoard({ day: yest, year: 0, week: null, awarded: false, winnerId: null, rows: [] });
        });
    };
    pull();
    const id = window.setInterval(pull, 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [user?.id]);

  const mineDone = meta?.status === "done" && meta.score != null;
  const name = displayName.trim() || user?.displayName?.trim() || "GM";
  const mine = avatarById(avatarId);
  const leader = todayBoard?.rows[0] ?? null;
  const yest =
    yestBoard?.rows.find((row) => row.winner || row.id === yestBoard.winnerId) ?? yestBoard?.rows[0] ?? null;

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
  row: DailyBoardRow | null;
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