"use client";

import { useEffect } from "react";
import { AuctionScreen } from "@/components/game/auction-screen";
import { ElimDraftScreen } from "@/components/game/elim-draft";
import { ElimMatchupScreen } from "@/components/game/elim-matchup";
import { HalftimeScreen } from "@/components/game/halftime-screen";
import { ElimStartScreen } from "@/components/game/elim-start-screen";
import { LobbyScreen } from "@/components/game/lobby-screen";
import { ResultsScreen } from "@/components/game/results-screen";
import { SetupScreen } from "@/components/game/setup-screen";
import { RerollCinematic, useRerollCinematic } from "@/components/game/reroll-cinematic";
import { LoanPopup } from "@/components/game/loan-popup";
import { GameChat } from "@/components/game/game-chat";
import { WatchBar } from "@/components/game/watch-bar";
import { CelebrationToasts } from "@/components/game/celebration-toasts";
import { elimStartOpen } from "@/lib/game/elim";
import { useGame } from "@/lib/game/store";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Leaderboard as Boards } from "@/lib/game/stats";
import type { RankTabId } from "@/lib/game/rank-tabs";

export function GameApp({
  prefillRoom,
  prefillTab,
  prefillBoard,
  boards = null,
}: {
  prefillRoom?: string;
  prefillTab?: "play" | "rankings" | "profile" | "store" | "season";
  prefillBoard?: RankTabId;
  boards?: Boards | null;
}) {
  const hydrate = useGame((s) => s.hydrate);
  const hydrated = useGame((s) => s.hydrated);
  const phase = useGame((s) => s.phase);
  const kind = useGame((s) => s.kind);
  const mode = useGame((s) => s.mode);
  const lobbyStay = useGame((s) => s.lobbyStay);
  const names = useGame((s) => s.names);
  const roomFilled = useGame((s) => s.roomFilled);
  const pullRemote = useGame((s) => s.pullRemote);
  const fx = useRerollCinematic();
  const { user, isPending } = useCurrentUserState();
  const loadProfile = useProfile((s) => s.load);
  const clearProfile = useProfile((s) => s.clear);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isPending) return;
    if (user) void loadProfile();
    else clearProfile();
  }, [user, isPending, loadProfile, clearProfile]);

  useEffect(() => {
    if (mode !== "online" && mode !== "watch") return;
    const tick = () => {
      void pullRemote();
    };
    tick();
    const id = window.setInterval(tick, 200);
    const onVis = () => {
      if (document.visibilityState === "visible") void pullRemote();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, [mode, pullRemote]);

  if (!hydrated) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <SetupScreen prefillRoom={prefillRoom} prefillTab={prefillTab} prefillBoard={prefillBoard} boards={boards} />
        <CelebrationToasts />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div
        className={mode === "watch" ? "flex min-h-full flex-1 flex-col pb-20" : "flex min-h-full flex-1 flex-col"}
        data-watch={mode === "watch" ? "" : undefined}
      >
      <RerollCinematic kind={fx.kind} token={fx.token} />
      <LoanPopup />
      {mode === "watch" ? null : <GameChat />}
      {phase === "results" ? (
        <ResultsScreen />
      ) : elimStartOpen({ phase, kind, names }, roomFilled) ? (
        <ElimStartScreen />
      ) : phase === "lobby" && !lobbyStay ? (
        <LobbyScreen />
      ) : phase === "setup" || (phase === "lobby" && lobbyStay) ? (
        <SetupScreen
          prefillRoom={prefillRoom}
          prefillTab={prefillTab}
          prefillBoard={prefillBoard}
          boards={boards}
          forceLobby={phase === "lobby" && lobbyStay}
        />
      ) : kind === "elimination" && phase === "draft" ? (
        <ElimDraftScreen />
      ) : kind === "elimination" && (phase === "matchup" || phase === "reveal") ? (
        <ElimMatchupScreen />
      ) : phase === "halftime" ? (
        <HalftimeScreen />
      ) : (
        <AuctionScreen cardFx={fx.kind} />
      )}
      </div>
      {mode === "watch" ? <WatchBar /> : null}
      <CelebrationToasts />
    </div>
  );
}