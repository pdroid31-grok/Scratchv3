import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(want);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron/play-strips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!cronAuthorized(request)) return new Response(null, { status: 401 });
        const { refreshPlayStripsIfDue } = await import("@/lib/game/play-public.server");
        const result = await refreshPlayStripsIfDue();
        try {
          const { getSql } = await import("@/lib/db");
          const { dailyDayStamp } = await import("@/lib/game/daily");
          const { importLegacyThenSettle } = await import("@/lib/game/daily-api.server");
          await importLegacyThenSettle(await getSql(), dailyDayStamp());
        } catch (err) {
          console.error("[darkness] daily settle failed", err);
        }
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
