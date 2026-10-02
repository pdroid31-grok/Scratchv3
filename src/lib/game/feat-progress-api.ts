import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { FeatProgressLines } from "./feat-progress";

export type { FeatProgressLines };

/** Read-only counters for the Achievements sheet. Does not grant. */
export const getFeatProgress = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FeatProgressLines> => {
    const { loadFeatProgress } = await import("./feat-progress.server");
    const sql = await getSql();
    return loadFeatProgress(sql, context.userId);
  });
