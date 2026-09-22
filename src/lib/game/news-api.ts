import { createServerFn } from "@tanstack/react-start";
import { optionalAuthMiddleware } from "@/lib/auth/middleware";
import type { NewsItem } from "./news";

export type { NewsItem, NewsKind, NewsFace } from "./news";
export { formatNewsTime } from "./news";

export const listNews = createServerFn({ method: "GET" }).handler(async (): Promise<NewsItem[]> => {
  const { listNewsHandler } = await import("./news.server");
  return listNewsHandler();
});

export const peekNewsUnseen = createServerFn({ method: "GET" })
  .middleware([optionalAuthMiddleware])
  .handler(async ({ context }): Promise<number> => {
    const { peekNewsUnseenHandler } = await import("./news.server");
    return peekNewsUnseenHandler(context.userId);
  });

export const markNewsSeen = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { markNewsSeenHandler } = await import("./news.server");
    await markNewsSeenHandler(context.userId);
    return { ok: true };
  });
