import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/play-strips")({
  server: {
    handlers: {
      GET: async () => {
        const { readOrBuildPlayStrips } = await import("@/lib/game/play-public.server");
        const strips = await readOrBuildPlayStrips();
        return Response.json(strips, {
          headers: {
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
