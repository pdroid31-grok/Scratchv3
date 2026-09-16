"use client";

import { useEffect, useState } from "react";
import { Calendar, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvitePopup } from "@/components/game/invite-popup";
import { LiveMatchCard, SeatCell } from "@/components/game/live-match-card";
import type { GameKind } from "@/lib/game/engine";
import { listMatchHistory, type MatchHistoryRow } from "@/lib/game/rooms";
import { useGame } from "@/lib/game/store";

export function MatchLobby({
  name,
  onName,
  onClose,
}: {
  name: string;
  onName: (value: string) => void;
  onClose: () => void;
}) {
  const hostOnline = useGame((s) => s.hostOnline);
  const joinOnline = useGame((s) => s.joinOnline);
  const watchOnline = useGame((s) => s.watchOnline);
  const reset = useGame((s) => s.reset);
  const busy = useGame((s) => s.busy);
  const netError = useGame((s) => s.netError);
  const myCode = useGame((s) => s.roomCode);
  const mySeat = useGame((s) => s.mySeat);
  const phase = useGame((s) => s.phase);
  const [joining, setJoining] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [history, setHistory] = useState<MatchHistoryRow[] | null>(null);
  const hosting = phase === "lobby" && mySeat === 0 && Boolean(myCode);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void listMatchHistory({ data: {} })
        .then((next) => {
          if (live) setHistory(next);
        })
        .catch(() => {
          if (live) setHistory([]);
        });
    };
    pull();
    const id = window.setInterval(pull, 3000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [myCode]);

  function host(kind: GameKind) {
    void hostOnline(name, kind, true);
  }

  function join(code: string) {
    setJoining(code);
    void joinOnline(code, name).finally(() => setJoining(null));
  }

  return (
    <section className="mt-6 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide text-fg">
            <Users className="size-5" />
            Public Lobby
          </p>
        </div>
        {hosting ? null : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-full border-2 border-white text-white hover:bg-white/10"
            aria-label="Close lobby"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {netError ? (
        <p className="mt-3 rounded-md bg-danger/20 px-3 py-2 text-sm text-fg">{netError}</p>
      ) : null}

      <div className="mt-4 grid gap-2">
        <Label htmlFor="lobby-name">Your name</Label>
        <Input
          id="lobby-name"
          name="lobby-name"
          autoComplete="nickname"
          maxLength={16}
          value={name}
          onChange={(e) => onName(e.target.value)}
          disabled={hosting}
        />
      </div>

      <div className="mt-4">
        <Button
          type="button"
          size="lg"
          className="w-full font-display uppercase tracking-wider"
          disabled={busy || hosting}
          onClick={() => host("elimination")}
        >
          <Calendar className="size-4" />
          Host Match
        </Button>
        {hosting ? (
          <div className="mt-3 flex justify-center">
            <Button type="button" onClick={() => setInvite(true)}>
              Code
            </Button>
          </div>
        ) : null}
        {hosting ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="mt-3 w-full font-display uppercase tracking-wider"
            onClick={reset}
          >
            Cancel match
          </Button>
        ) : null}
      </div>

      <div className="mt-5">
        <LiveMatchCard
          hostingCode={hosting ? myCode : null}
          busy={busy}
          joining={joining}
          onHost={() => host("elimination")}
          onJoin={join}
          onWatch={(code) => void watchOnline(code)}
        />
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Last 10 Matches</p>
        <div className="mt-3 overflow-hidden rounded-lg bg-surface-2/60 shadow-[var(--shadow-border)]">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-3 py-2 font-display text-xs font-semibold uppercase tracking-wider text-subtle">
              <span>Winner</span>
              <span>Loser</span>
              <span className="text-center">Score</span>
            </div>
            {history === null ? (
              <p className="px-3 py-6 text-sm text-muted">Loading results…</p>
            ) : history.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">No finished matches yet.</p>
            ) : (
              <ul>
                {history.slice(0, 10).map((row) => {
                  const winSeat: 0 | 1 =
                    row.winner === 0 || row.winner === 1
                      ? row.winner
                      : row.series[0] >= row.series[1]
                        ? 0
                        : 1;
                  const loseSeat: 0 | 1 = winSeat === 0 ? 1 : 0;
                  const tied = row.winner == null && row.series[0] === row.series[1];
                  return (
                    <li key={`${row.code}-${row.nights}`} className="border-t border-border px-3 py-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                        <SeatCell
                          name={row.names[winSeat]}
                          avatarId={row.avatars[winSeat]}
                          tone={tied ? "plain" : "win"}
                        />
                        <SeatCell
                          name={row.names[loseSeat]}
                          avatarId={row.avatars[loseSeat]}
                          tone={tied ? "plain" : "loss"}
                        />
                        <span className="min-w-[4.75rem] text-center font-display text-sm font-semibold tabular-nums tracking-wide text-fg">
                          {row.series[winSeat]}–{row.series[loseSeat]}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      </div>
      {invite ? <InvitePopup onClose={() => setInvite(false)} /> : null}
    </section>
  );
}