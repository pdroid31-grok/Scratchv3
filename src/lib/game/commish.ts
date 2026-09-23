import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { CommishList, CommishOk, CommishPasswordStatus } from "./commish-types";

export type { CommishBook, CommishList, CommishOk, CommishPasswordStatus } from "./commish-types";
export { COMMISH_SETTINGS_ID, COMMISH_PASSWORD_NAME, GROKBOT_PASSWORD_NAME, isCommishSettingsUser } from "./commish-types";

function clipId(value: unknown): string {
  return String(value ?? "").trim().slice(0, 80);
}

export const listCommishBooks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishList> => {
    const { listCommishBooksHandler } = await import("./commish.server");
    return listCommishBooksHandler({ context });
  });

export const remapCommishBook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { emptyId?: string; bookId?: string }) => ({
    emptyId: clipId(data.emptyId),
    bookId: clipId(data.bookId),
  }))
  .handler(async ({ context, data }): Promise<CommishOk> => {
    const { remapCommishBookHandler } = await import("./commish.server");
    return remapCommishBookHandler({ context, data });
  });

export const clearCommishClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name?: string; confirm?: boolean }) => ({
    name: String(data.name ?? "").trim().slice(0, 32),
    confirm: Boolean(data.confirm),
  }))
  .handler(async ({ context, data }): Promise<CommishOk> => {
    const { clearCommishClaimHandler } = await import("./commish.server");
    return clearCommishClaimHandler({ context, data });
  });

export const heisenbergPasswordStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishPasswordStatus> => {
    const { heisenbergPasswordStatusHandler } = await import("./commish.server");
    return heisenbergPasswordStatusHandler({ context });
  });

export const setHeisenbergPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { password?: string; confirm?: string; userId?: string }) => ({
    password: String(data.password ?? ""),
    confirm: String(data.confirm ?? ""),
    userId: clipId(data.userId),
  }))
  .handler(async ({ context, data }): Promise<CommishOk> => {
    const { setHeisenbergPasswordHandler } = await import("./commish.server");
    return setHeisenbergPasswordHandler({ context, data });
  });

export const grokbotPasswordStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishPasswordStatus> => {
    const { grokbotPasswordStatusHandler } = await import("./commish.server");
    return grokbotPasswordStatusHandler({ context });
  });

export const setGrokbotPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { password?: string; confirm?: string; userId?: string }) => ({
    password: String(data.password ?? ""),
    confirm: String(data.confirm ?? ""),
    userId: clipId(data.userId),
  }))
  .handler(async ({ context, data }): Promise<CommishOk> => {
    const { setGrokbotPasswordHandler } = await import("./commish.server");
    return setGrokbotPasswordHandler({ context, data });
  });

export const resetInspector1Daily = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishOk> => {
    const { resetInspector1DailyHandler } = await import("./commish.server");
    return resetInspector1DailyHandler({ context });
  });

export const resetInspector1Weekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishOk> => {
    const { resetInspector1WeeklyHandler } = await import("./commish.server");
    return resetInspector1WeeklyHandler({ context });
  });

export const replayInspector1Toasts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishOk> => {
    const { replayInspector1ToastsHandler } = await import("./commish.server");
    return replayInspector1ToastsHandler({ context });
  });

export const giveInspector1Scratch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommishOk> => {
    const { giveInspector1ScratchHandler } = await import("./commish.server");
    return giveInspector1ScratchHandler({ context });
  });
