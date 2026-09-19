import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, optionalAuthMiddleware } from "@/lib/auth/middleware";
import type { ToastItem } from "./toasts";

export type { ToastItem, ToastKind, ToastPayload, ToastPick } from "./toasts";
export { formatToastDay, sortToasts } from "./toasts";

export const listToasts = createServerFn({ method: "GET" })
  .middleware([optionalAuthMiddleware])
  .handler(async ({ context }): Promise<ToastItem[]> => {
    if (!context.userId) return [];
    const { listUnseenToasts } = await import("./toasts.server");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    return listUnseenToasts(sql, context.userId);
  });

export const seenToast = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { sourceKey?: string }) => ({
    sourceKey: String(data.sourceKey ?? "").slice(0, 240),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { markToastSeen } = await import("./toasts.server");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await markToastSeen(sql, context.userId, data.sourceKey);
    return { ok: true };
  });
