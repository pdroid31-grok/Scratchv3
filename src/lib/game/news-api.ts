import { createServerFn } from "@tanstack/react-start";
import type { NewsItem } from "./news";

export type { NewsItem, NewsKind, NewsFace } from "./news";
export { formatNewsTime } from "./news";

export const listNews = createServerFn({ method: "GET" }).handler(async (): Promise<NewsItem[]> => {
  const { listNewsHandler } = await import("./news.server");
  return listNewsHandler();
});
