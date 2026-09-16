import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/game/app";
import { parseRankTab, type RankTabId } from "@/lib/game/rank-tabs";
import { getLeaderboard } from "@/lib/game/stats";

export const Route = createFileRoute("/")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { room?: string; tab?: "play" | "rankings" | "profile" | "store" | "season"; board?: RankTabId } => {
    const value = typeof raw.room === "string" ? raw.room : "";
    const room = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    const tabRaw = String(raw.tab ?? "");
    const tab =
      tabRaw === "rankings" || tabRaw === "profile" || tabRaw === "play" || tabRaw === "store" || tabRaw === "season"
        ? tabRaw
        : undefined;
    const board = parseRankTab(raw.board);
    return {
      ...(room ? { room } : {}),
      ...(tab ? { tab } : {}),
      ...(board ? { board } : {}),
    };
  },
  loader: async () => {
    try {
      return await getLeaderboard();
    } catch {
      return { total: [], auction: [], elimination: [], score: [], stars: [] };
    }
  },
  component: Home,
});

function Home() {
  const { room, tab, board } = Route.useSearch();
  const boards = Route.useLoaderData();
  return <GameApp prefillRoom={room} prefillTab={tab} prefillBoard={board} boards={boards} />;
}
