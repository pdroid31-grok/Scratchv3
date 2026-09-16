"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { avatarById } from "@/lib/game/avatars";
import { listLobbies } from "@/lib/game/rooms";
import { liveSeriesScore, type LobbyListing } from "@/lib/game/lobby-list";
import { cn } from "@/lib/utils";

export function LiveMatchCard({
  hostingCode,
  busy,
  joining,
  onHost,
  onJoin,
  onWatch,
}: {
  hostingCode?: string | null;
  busy?: boolean;
  joining?: string | null;
  onHost: () => void;
  onJoin: (code: string) => void;
  onWatch: (code: string) => void;
}) {
  const [rows, setRows] = useState<LobbyListing[] | null>(null);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void listLobbies({ data: {} })
        .then((next) => {
          if (live) setRows(next);
        })
        .catch(() => {
          if (live) setRows([]);
        });
    };
    pull();
    const id = window.setInterval(pull, 3000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [hostingCode]);

  const hosting = Boolean(hostingCode);

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg bg-surface-2/60 shadow-[var(--shadow-border)]">
      <button
        type="button"
        className="inline-flex w-11 shrink-0 items-center justify-center self-stretch border-r border-border text-fg hover:bg-surface-2 disabled:opacity-40"
        aria-label="Host a public elimination match"
        disabled={busy || hosting}
        onClick={onHost}
      >
        <Plus className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_2.75rem] gap-2 px-3 py-2 font-display text-xs font-semibold uppercase tracking-wider text-subtle">
          <span>Host</span>
          <span>Guest</span>
          <span className="min-w-[4.75rem] text-center">Score</span>
          <span className="sr-only">Watch</span>
        </div>
        {rows === null ? (
          <div className="h-14 animate-pulse bg-bg/40" />
        ) : rows.length === 0 ? null : (
          <ul>
            {rows.map((row) => {
              const mine = hosting && row.code === hostingCode;
              return (
                <li key={row.code} className="border-t border-border px-3 py-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_2.75rem] items-center gap-2">
                    <SeatCell name={row.host} avatarId={row.hostAvatar} />
                    {row.open ? (
                      mine ? (
                        <span className="text-sm text-muted">Waiting</span>
                      ) : row.joinable && row.kind !== "auction" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-11 w-full justify-center"
                          disabled={busy || hosting || joining === row.code}
                          onClick={() => onJoin(row.code)}
                          aria-label={`Join ${row.host}'s match`}
                        >
                          <Plus className="size-4" />
                          Join
                        </Button>
                      ) : (
                        <span className="text-sm text-muted">Private</span>
                      )
                    ) : (
                      <SeatCell name={row.guest ?? "GM"} avatarId={row.guestAvatar ?? "poor"} />
                    )}
                    <span className="min-w-[4.75rem] text-center font-display text-sm font-semibold tabular-nums tracking-wide text-fg">
                      {liveSeriesScore(row.series)}
                    </span>
                    {row.watchable && !mine ? (
                      <button
                        type="button"
                        className="inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-2"
                        disabled={busy || hosting || joining === row.code}
                        aria-label={`Watch ${row.host} vs ${row.guest ?? "GM"}`}
                        onClick={() => onWatch(row.code)}
                      >
                        <Search className="size-4" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SeatCell({
  name,
  avatarId,
  tone = "plain",
}: {
  name: string;
  avatarId: string;
  tone?: "win" | "loss" | "plain";
}) {
  const avatar = avatarById(avatarId);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img src={avatar.src} alt="" className="size-9 shrink-0 rounded-md object-cover" />
      <span
        className={cn(
          "truncate text-sm font-medium",
          tone === "win" ? "text-good" : tone === "loss" ? "text-danger" : "text-fg",
        )}
      >
        {name}
      </span>
    </div>
  );
}