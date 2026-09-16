import { createFileRoute } from "@tanstack/react-router";
import { loadPayouts } from "@/lib/game/payouts";
import { getSql } from "@/lib/db";
import { isDailyDay } from "@/lib/game/daily";

export const Route = createFileRoute("/api/payouts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const dayRaw = String(url.searchParams.get("day") ?? "");
        const userId = String(url.searchParams.get("user") ?? "").slice(0, 80) || undefined;
        const day = isDailyDay(dayRaw) ? dayRaw : undefined;
        const sql = await getSql();
        const rows = await loadPayouts(sql, { userId, day, limit: 200 });
        return Response.json(
          { rows },
          {
            headers: {
              "cache-control": "no-store",
              "access-control-allow-origin": "*",
            },
          },
        );
      },
    },
  },
});
