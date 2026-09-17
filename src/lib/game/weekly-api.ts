import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, optionalAuthMiddleware } from "@/lib/auth/middleware";
import type {
  WeeklyBoard,
  WeeklyBoardPack,
  WeeklyLineup,
  WeeklyMeta,
  WeeklyPickPayload,
  WeeklyResume,
  SeasonBoard,
} from "./weekly-api-types";

export type {
  WeeklyBoard,
  WeeklyBoardPack,
  WeeklyBoardRow,
  WeeklyLineup,
  WeeklyMeta,
  WeeklyResume,
  WeeklyStatus,
  SeasonBoard,
  SeasonBoardRow,
} from "./weekly-api-types";

function clipPicks(picks: unknown): WeeklyPickPayload[] {
  return Array.isArray(picks)
    ? picks.slice(0, 8).map((row) => ({
        slot: String((row as { slot?: string })?.slot ?? "").slice(0, 4),
        id: String((row as { id?: string })?.id ?? "").slice(0, 80),
      }))
    : [];
}

export const getWeekly = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<WeeklyMeta> => {
    const { getWeeklyHandler } = await import("./weekly-api.server");
    return getWeeklyHandler({ context });
  });

export const claimWeekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<WeeklyMeta> => {
    const { claimWeeklyHandler } = await import("./weekly-api.server");
    return claimWeeklyHandler({ context });
  });

export const forfeitWeekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<WeeklyMeta> => {
    const { forfeitWeeklyHandler } = await import("./weekly-api.server");
    return forfeitWeeklyHandler({ context });
  });

export const saveWeeklyDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { picks: WeeklyPickPayload[] }) => ({ picks: clipPicks(data.picks) }))
  .handler(async ({ context, data }): Promise<WeeklyMeta> => {
    const { saveWeeklyDraftHandler } = await import("./weekly-api.server");
    return saveWeeklyDraftHandler({ context, data });
  });

export const lockWeekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { picks: WeeklyPickPayload[] }) => ({ picks: clipPicks(data.picks) }))
  .handler(async ({ context, data }): Promise<WeeklyMeta> => {
    const { lockWeeklyHandler } = await import("./weekly-api.server");
    return lockWeeklyHandler({ context, data });
  });

export const weeklyBoardPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<WeeklyBoardPack | null> => {
    const { weeklyBoardPackHandler } = await import("./weekly-api.server");
    return weeklyBoardPackHandler({ context });
  });

export const listWeeklyBoard = createServerFn({ method: "POST" })
  .validator((data: { season?: number; week?: number; peek?: boolean }) => ({
    season: Number(data.season) || 0,
    week: Number(data.week) || 0,
    peek: Boolean(data.peek),
  }))
  .handler(async ({ data }): Promise<WeeklyBoard> => {
    const { listWeeklyBoardHandler } = await import("./weekly-api.server");
    return listWeeklyBoardHandler({ data });
  });

export const listSeasonBoard = createServerFn({ method: "POST" })
  .validator((data: { season?: number }) => ({
    season: Number(data.season) || 0,
  }))
  .handler(async ({ data }): Promise<SeasonBoard> => {
    const { listSeasonBoardHandler } = await import("./weekly-api.server");
    return listSeasonBoardHandler({ data });
  });

export const getWeeklyLineup = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { season?: number; week?: number; userId?: string }) => ({
    season: Number(data.season) || 0,
    week: Number(data.week) || 0,
    userId: String(data.userId ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }): Promise<WeeklyLineup | null> => {
    const { getWeeklyLineupHandler } = await import("./weekly-api.server");
    return getWeeklyLineupHandler({ context, data });
  });

export const resumeWeekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<WeeklyResume | null> => {
    const { resumeWeeklyHandler } = await import("./weekly-api.server");
    return resumeWeeklyHandler({ context });
  });
