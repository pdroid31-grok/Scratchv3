"use client";

import { useEffect, useMemo, useState } from "react";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthBar, useGmPrefill } from "@/components/game/auth-bar";
import { otherSeat, rosterTotal } from "@/lib/game/auction";
import { nightKey } from "@/lib/game/stats-shared";
import { recordNight } from "@/lib/game/stats";
import { useProfile } from "@/lib/game/profile-store";
import { useGame } from "@/lib/game/store";
import { GmName } from "@/components/game/gm-name";
import { ElimMatchupScreen } from "@/components/game/elim-matchup";
import { AuctionResultsBoard } from "@/components/game/auction-results";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { elimSeriesWinner, elimTotals, elimBestWeeks, elimWorstWeeks } from "@/lib/game/elim";
import type { Seat } from "@/lib/game/types";

export function ResultsScreen() {
  const names = useGame((s) => s.names);
  const rosters = useGame((s) => s.rosters);
  const cash = useGame((s) => s.cash);
  const sales = useGame((s) => s.sales);
  const bonus = useGame((s) => s.bonus);
  const series = useGame((s) => s.series);
  const nights = useGame((s) => s.nights);
  const kind = useGame((s) => s.kind);
  const elim = useGame((s) => s.elim);
  const reset = useGame((s) => s.reset);
  const cancelRematch = useGame((s) => s.cancelRematch);
  const rematchReady = useGame((s) => s.rematchReady);
  const mode = useGame((s) => s.mode);
  const mySeat = useGame((s) => s.mySeat);
  const roomCode = useGame((s) => s.roomCode);
  const token = useGame((s) => s.token);
  const acting = useGame((s) => s.acting);
  const busy = useGame((s) => s.busy);
  const { user, isPending } = useCurrentUserState();
  const gm = useGmPrefill();
  const [saved, setSaved] = useState<"idle" | "ok" | "skip">("idle");
  const isElim = kind === "elimination" && Boolean(elim);

  const totals: [number, number] = useMemo(() => {
    if (isElim && elim) return elimTotals(elim);
    return [rosterTotal(rosters[0], bonus[0]), rosterTotal(rosters[1], bonus[1])];
  }, [isElim, elim, rosters, bonus]);

  const winner: Seat | null = useMemo(() => {
    if (isElim && elim) return elimSeriesWinner(elim);
    if (totals[0] > totals[1]) return 0;
    if (totals[1] > totals[0]) return 1;
    if (cash[0] > cash[1]) return 0;
    if (cash[1] > cash[0]) return 1;
    return null;
  }, [isElim, elim, totals, cash]);

  const seat: Seat = useMemo(() => {
    if (mode === "online" && mySeat != null) return mySeat;
    if (gm && names[1].trim().toLowerCase() === gm.toLowerCase() && names[0].trim().toLowerCase() !== gm.toLowerCase()) {
      return 1;
    }
    return 0;
  }, [mode, mySeat, gm, names]);

  useEffect(() => {
    if (isPending || !user || saved !== "idle") return;
    if (mode !== "online" || !roomCode || !token) {
      setSaved("skip");
      return;
    }
    const other: Seat = seat === 0 ? 1 : 0;
    const key = nightKey({
      names,
      nights,
      scores: totals,
      series: [series?.[0] ?? 0, series?.[1] ?? 0],
      kind: isElim ? "elimination" : "auction",
      saleIds:
        isElim && elim
          ? [...elim.picks[0], ...elim.picks[1]].map((pick) => pick.player.id)
          : sales.map((s) => s.lot.player.id),
    });
    const won = winner == null ? null : winner === seat;
    const highs = isElim && elim ? elimBestWeeks(elim) : totals;
    const lows = isElim && elim ? elimWorstWeeks(elim) : totals;
    const payload = {
      nightKey: `${key}|s${seat}`,
      opponentName: names[other],
      gmName: names[seat],
      won,
      score: highs[seat],
      opponentScore: highs[other],
      lowScore: lows[seat],
      kind: isElim ? ("elimination" as const) : ("auction" as const),
      roomCode,
      token,
      seat,
      nights,
    };
    let attempts = 0;
    const send = () => {
      void recordNight({ data: payload })
        .then((result) => {
          if (result.ok) {
            setSaved("ok");
            void useProfile.getState().load();
            return;
          }
          attempts += 1;
          if (attempts < 10) {
            window.setTimeout(send, 300 * attempts);
            return;
          }
          setSaved("skip");
          void useProfile.getState().load();
        })
        .catch(() => {
          attempts += 1;
          if (attempts < 10) {
            window.setTimeout(send, 300 * attempts);
            return;
          }
          setSaved("skip");
          void useProfile.getState().load();
        });
    };
    send();
  }, [isPending, user, saved, seat, names, nights, totals, series, sales, winner, isElim, elim, mode, roomCode, token]);

  const ready: [boolean, boolean] = rematchReady ?? [false, false];
  const myReady = mode === "online" && mySeat !== null && ready[mySeat];
  const theirSeat: Seat | null = mode === "online" && mySeat !== null ? otherSeat(mySeat) : null;
  const theyReady = theirSeat !== null && ready[theirSeat];

  if (myReady && !theyReady && theirSeat !== null) {
    return (
      <RematchWait
        other={theirSeat}
        pending={acting || busy}
        onCancel={cancelRematch}
        onLeave={reset}
      />
    );
  }

  if (isElim && elim) {
    return <ElimMatchupScreen />;
  }

  return <AuctionResultsBoard />;
}

function RematchWait({
  other,
  pending,
  onCancel,
  onLeave,
}: {
  other: Seat;
  pending: boolean;
  onCancel: () => void;
  onLeave: () => void;
}) {
  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <div className="mb-4 flex justify-end">
        <AuthBar />
      </div>
      <section className="mt-8 rounded-xl bg-surface/90 px-5 py-8 text-center shadow-[var(--shadow-border)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-surface-2 text-accent">
          <Hourglass className="size-5" strokeWidth={1.75} />
        </span>
        <p className="mt-4 font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
          Rematch lobby
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold uppercase tracking-tight text-fg">Waiting</h1>
        <p className="mt-3 text-sm text-muted">
          You’re in. Waiting on{" "}
          <GmName seat={other} className="align-middle" nameClassName="font-medium text-fg" /> to press rematch.
        </p>
        <div className="mt-6 grid gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="w-full font-display uppercase tracking-wider"
            disabled={pending}
            onClick={onCancel}
          >
            Never mind
          </Button>
          <button
            type="button"
            className="text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
            onClick={onLeave}
          >
            Leave night
          </button>
        </div>
      </section>
    </main>
  );
}
