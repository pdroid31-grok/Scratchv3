import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { ScratchCardView, ScratchClaimResult, ScratchState } from "./scratch";

export type { ScratchCardView, ScratchClaimResult, ScratchState };

export const getScratch = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ScratchState> => {
    const { getSql } = await import("@/lib/db");
    const { syncScratchBank } = await import("./scratch.server");
    const sql = await getSql();
    return syncScratchBank(sql, context.userId);
  });

export const openScratch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<ScratchCardView | null> => {
    const { getSql } = await import("@/lib/db");
    const { peekScratchCard } = await import("./scratch.server");
    const sql = await getSql();
    return peekScratchCard(sql, context.userId);
  });

export const claimScratch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { cardId: number }) => ({
    cardId: Math.max(0, Math.floor(Number(data.cardId) || 0)),
  }))
  .handler(async ({ context, data }): Promise<ScratchClaimResult> => {
    const { getSql } = await import("@/lib/db");
    const { claimScratchCard } = await import("./scratch.server");
    const sql = await getSql();
    return claimScratchCard(sql, context.userId, data.cardId);
  });
