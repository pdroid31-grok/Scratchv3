"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { avatarById } from "@/lib/game/avatars";
import { listDailyBoard, type DailyBoard } from "@/lib/game/daily-api";
import { dailyDayStamp, dailyYesterday, isDailyDay } from "@/lib/game/daily";
import { cn } from "@/lib/utils";

export function YesterdayWinner({ size = "md" }: { size?: "md" | "rank" | "lg" }) {
  const today = dailyDayStamp();
  const day = dailyYesterday(today);
  const scale = size === "lg" ? "lg" : size === "rank" ? "rank" : "md";
  const [row, setRow] = useState<{
    id: string;
    name: string;
    avatarId: DailyBoard["rows"][number]["avatarId"];
    score: number;
  } | null | undefined>(isDailyDay(day) ? undefined : null);

  useEffect(() => {
    if (!isDailyDay(day)) {
      setRow(null);
      return;
    }
    let live = true;
    void listDailyBoard({ data: { day } })
      .then((board) => {
        if (!live) return;
        const winner =
          board.rows.find((item) => item.winner || item.id === board.winnerId) ?? board.rows[0] ?? null;
        setRow(winner ? { id: winner.id, name: winner.name, avatarId: winner.avatarId, score: winner.score } : null);
      })
      .catch(() => {
        if (live) setRow(null);
      });
    return () => {
      live = false;
    };
  }, [day]);

  return (
    <div className="flex items-center justify-center py-1">
      <div className={cn("flex items-center", scale === "lg" ? "gap-4" : scale === "rank" ? "gap-4" : "gap-3")}>
        <h2
          className={cn(
            "shrink-0 text-left font-display font-semibold uppercase leading-tight tracking-wide text-fg",
            scale === "lg"
              ? "text-[1.6875rem] sm:text-[2.025rem]"
              : scale === "rank"
                ? "text-[1.6171875rem] sm:text-[1.796875rem]"
                : "text-lg sm:text-xl",
          )}
        >
          <span className="block">Yesterday’s</span>
          <span className="block">Winner</span>
        </h2>
        {row === undefined ? (
          <div
            className={cn(
              "shrink-0 animate-pulse rounded-md bg-bg",
              scale === "lg" ? "size-[6.075rem]" : scale === "rank" ? "size-[4.8515625rem]" : "size-[3.375rem]",
            )}
          />
        ) : row === null ? (
          <span
            className={cn(
              "shrink-0 font-display font-semibold text-muted",
              scale === "lg" ? "text-[1.6875rem]" : scale === "rank" ? "text-[1.6171875rem]" : "text-lg",
            )}
          >
            —
          </span>
        ) : (
          <Link
            to="/player/$id"
            params={{ id: row.id }}
            search={{ board: "daily" }}
            className={cn("flex min-w-0 items-center", scale === "lg" ? "gap-3" : "gap-2")}
          >
            <img
              src={avatarById(row.avatarId).src}
              alt=""
              className={cn(
                "shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]",
                scale === "lg" ? "size-[6.075rem]" : scale === "rank" ? "size-[4.8515625rem]" : "size-[3.375rem]",
              )}
            />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className={cn(
                    "block truncate font-display font-semibold uppercase tracking-wide text-fg",
                    scale === "lg"
                      ? "max-w-[10rem] text-[1.0125rem] sm:text-[1.125rem]"
                      : scale === "rank"
                        ? "max-w-[10.78125rem] text-[1.2578125rem]"
                        : "max-w-[7.5rem] text-sm",
                  )}
                >
                  {row.name}
                </span>
                <Star
                  className={cn(
                    "shrink-0 text-accent",
                    scale === "lg" ? "size-[1.575rem]" : scale === "rank" ? "size-[1.2578125rem]" : "size-3.5",
                  )}
                  fill="currentColor"
                  aria-label="Daily win"
                />
              </span>
              <span
                className={cn(
                  "mt-0.5 block tabular-nums text-muted",
                  scale === "lg" ? "text-[1.0125rem]" : scale === "rank" ? "text-[1.078125rem]" : "text-xs",
                )}
              >
                {row.score.toFixed(1)}
              </span>
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
