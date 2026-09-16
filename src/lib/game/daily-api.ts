import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, optionalAuthMiddleware } from "@/lib/auth/middleware";
import { dailyDayStamp, isDailyDay } from "./daily";
import type { DailyBoard, DailyLineup, DailyMeta, DailyPickPayload } from "./daily-api-types";

export type {
  DailyBoard,
  DailyBoardRow,
  DailyLineup,
  DailyLineupPick,
  DailyMeta,
  DailyStatus,
} from "./daily-api-types";

function clipPicks(picks: unknown): DailyPickPayload[] {
  return Array.isArray(picks)
    ? picks.slice(0, 8).map((row) => ({
        slot: String((row as { slot?: string })?.slot ?? "").slice(0, 4),
        id: String((row as { id?: string })?.id ?? "").slice(0, 80),
      }))
    : [];
}

export const getDaily = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<DailyMeta> => {
    const { getDailyHandler } = await import("./daily-api.server");
    return getDailyHandler({ context });
  });

export const claimDaily = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<DailyMeta> => {
    const { claimDailyHandler } = await import("./daily-api.server");
    return claimDailyHandler({ context });
  });

export const forfeitDaily = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<DailyMeta> => {
    const { forfeitDailyHandler } = await import("./daily-api.server");
    return forfeitDailyHandler({ context });
  });

export const saveDailyDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { picks: DailyPickPayload[] }) => ({ picks: clipPicks(data.picks) }))
  .handler(async ({ context, data }): Promise<DailyMeta> => {
    const { saveDailyDraftHandler } = await import("./daily-api.server");
    return saveDailyDraftHandler({ context, data });
  });

export const lockDaily = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { picks: DailyPickPayload[] }) => ({ picks: clipPicks(data.picks) }))
  .handler(async ({ context, data }): Promise<DailyMeta & { week: number; score: number }> => {
    const { lockDailyHandler } = await import("./daily-api.server");
    return lockDailyHandler({ context, data });
  });

export const listDailyBoard = createServerFn({ method: "POST" })
  .validator((data: { day?: string }) => ({
    day: isDailyDay(String(data.day ?? "")) ? String(data.day) : dailyDayStamp(),
  }))
  .handler(async ({ data }): Promise<DailyBoard> => {
    const { listDailyBoardHandler } = await import("./daily-api.server");
    return listDailyBoardHandler({ data });
  });

export const getDailyLineup = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { day?: string; userId?: string }) => ({
    day: isDailyDay(String(data.day ?? "")) ? String(data.day) : dailyDayStamp(),
    userId: String(data.userId ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }): Promise<DailyLineup | null> => {
    const { getDailyLineupHandler } = await import("./daily-api.server");
    return getDailyLineupHandler({ context, data });
  });
