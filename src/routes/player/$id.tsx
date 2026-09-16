import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthBar } from "@/components/game/auth-bar";
import { PlayerBook } from "@/components/game/player-book";
import { parseRankTab, type RankTabId } from "@/lib/game/rank-tabs";
import { getPublicProfile } from "@/lib/game/stats";

export const Route = createFileRoute("/player/$id")({
  validateSearch: (raw: Record<string, unknown>): { board?: RankTabId } => {
    const board = parseRankTab(raw.board);
    return board ? { board } : {};
  },
  loader: async ({ params }) => {
    try {
      return await getPublicProfile({ data: { userId: params.id } });
    } catch {
      return null;
    }
  },
  component: PlayerPage,
});

function PlayerPage() {
  const book = Route.useLoaderData();
  const { board } = Route.useSearch();
  const backBoard = board ?? "total";
  const back = { tab: "rankings" as const, board: backBoard };

  if (!book) {
    return (
      <main className="mx-auto flex min-h-full flex-1 w-full max-w-lg flex-col px-5 py-6">
        <Header board={backBoard} />
        <section className="mt-8 rounded-xl bg-surface/90 p-5 shadow-[var(--shadow-border)]">
          <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-fg">No book</h1>
          <p className="mt-2 text-sm text-muted">That GM isn’t on the board.</p>
          <Link to="/" search={back} className="mt-4 inline-flex h-11 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:bg-fg/90">
            Back to Rankings
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full flex-1 w-full max-w-lg flex-col px-5 py-6 sm:py-8">
      <Header board={backBoard} />
      <PlayerBook book={book} board={backBoard} />
    </main>
  );
}

function Header({ board }: { board: RankTabId }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <Link
          to="/"
          search={{ tab: "rankings", board }}
          className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf hover:text-fg"
        >
          Rankings
        </Link>
        <p className="mt-2 font-display text-2xl font-semibold uppercase tracking-tight text-fg">Player</p>
      </div>
      <AuthBar className="shrink-0" />
    </header>
  );
}
