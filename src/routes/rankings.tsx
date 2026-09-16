import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthBar } from "@/components/game/auth-bar";
import { Leaderboard } from "@/components/game/leaderboard";
import { parseRankTab, type RankTabId } from "@/lib/game/rank-tabs";
import { getLeaderboard } from "@/lib/game/stats";

export const Route = createFileRoute("/rankings")({
  validateSearch: (raw: Record<string, unknown>): { board?: RankTabId } => {
    const board = parseRankTab(raw.board);
    return board ? { board } : {};
  },
  loader: async () => {
    try {
      return await getLeaderboard();
    } catch {
      return { total: [], auction: [], elimination: [], score: [], stars: [] };
    }
  },
  component: RankingsPage,
});

function RankingsPage() {
  const boards = Route.useLoaderData();
  const { board } = Route.useSearch();
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/"
            className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf hover:text-fg"
          >
            Darkness
          </Link>
          <h1 className="mt-2 font-display text-4xl font-semibold uppercase tracking-tight text-fg">Rankings</h1>
        </div>
        <AuthBar className="shrink-0" />
      </header>
      <Leaderboard board={board ?? "daily"} initial={boards} />
    </main>
  );
}
