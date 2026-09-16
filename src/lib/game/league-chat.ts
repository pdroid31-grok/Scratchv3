import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { LeagueChatLine, LeagueChatUnread } from "./league-chat-types";

export type { LeagueChatLine, LeagueChatUnread } from "./league-chat-types";
export { STEVO_CHAT_ID, CEO_BOARD_ID, isStevoChatUser, isCeoBoardUser } from "./league-chat-types";

export const listLeagueChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data?: { seen?: boolean }) => ({ seen: Boolean(data?.seen) }))
  .handler(async ({ context, data }): Promise<LeagueChatLine[]> => {
    const { listLeagueChatHandler } = await import("./league-chat.server");
    return listLeagueChatHandler({ context, data });
  });

export const unreadLeagueChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<LeagueChatUnread> => {
    const { unreadLeagueChatHandler } = await import("./league-chat.server");
    return unreadLeagueChatHandler({ context });
  });

export const postLeagueChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { text?: string }) => ({
    text: String(data.text ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ context, data }): Promise<LeagueChatLine[]> => {
    const { postLeagueChatHandler } = await import("./league-chat.server");
    return postLeagueChatHandler({ context, data });
  });

export const deleteLeagueChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: number }) => ({
    id: Math.floor(Number(data.id) || 0),
  }))
  .handler(async ({ context, data }): Promise<LeagueChatLine[]> => {
    const { deleteLeagueChatHandler } = await import("./league-chat.server");
    return deleteLeagueChatHandler({ context, data });
  });

