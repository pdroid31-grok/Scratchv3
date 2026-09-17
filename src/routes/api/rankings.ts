import { createFileRoute } from "@tanstack/react-router";
import { loadLeaderboard } from "@/lib/game/stats.server";

export const Route = createFileRoute("/api/rankings")({
  server: {
    handlers: {
      GET: async () => {
        const boards = await loadLeaderboard();
        return Response.json(boards, {
          headers: {
            "cache-control": "public, max-age=30",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
