export const RANK_TABS = [
  { id: "total", label: "Total", hint: "", empty: "No matches on the book yet." },
  { id: "score", label: "Score", hint: "", empty: "No high scores yet." },
  { id: "stars", label: "Stars", hint: "", empty: "No daily wins yet." },
  { id: "daily", label: "Daily", hint: "", empty: "No one has finished today’s daily yet." },
  { id: "weekly", label: "Weekly", hint: "", empty: "No one has locked a lineup this week yet." },
  { id: "auction", label: "Auction", hint: "", empty: "No auction matches yet." },
  { id: "elimination", label: "Elim", hint: "", empty: "No elimination matches yet." },
] as const;

export type RankTabId = (typeof RANK_TABS)[number]["id"];

export type LeaderboardTabId = "total" | "daily" | "weekly" | "stars";

export const LEADERBOARD_TABS = [
  { id: "daily", label: "Daily", hint: "", empty: "No one has finished today’s daily yet." },
  { id: "weekly", label: "Weekly", hint: "", empty: "No one has locked a lineup this week yet." },
  { id: "stars", label: "Stars", hint: "", empty: "No daily wins yet." },
  { id: "total", label: "Total", hint: "", empty: "No matches on the book yet." },
] as const satisfies readonly { id: LeaderboardTabId; label: string; hint: string; empty: string }[];

export type BookTabId = "total" | "auction" | "elimination";

export const BOOK_TABS = RANK_TABS.filter((row): row is (typeof RANK_TABS)[number] & { id: BookTabId } => {
  return row.id === "total" || row.id === "auction" || row.id === "elimination";
});

const DAILY_BOARD_KEY = "darkness-open-daily";
const WEEKLY_BOARD_KEY = "darkness-open-weekly";
const PLAY_HOME_KEY = "darkness-open-play";

export function markDailyRankings() {
  try {
    sessionStorage.setItem(DAILY_BOARD_KEY, "1");
    sessionStorage.removeItem(WEEKLY_BOARD_KEY);
    sessionStorage.removeItem(PLAY_HOME_KEY);
  } catch {
    /* ignore */
  }
}

export function wantsDailyRankings() {
  try {
    return sessionStorage.getItem(DAILY_BOARD_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearDailyRankings() {
  try {
    sessionStorage.removeItem(DAILY_BOARD_KEY);
  } catch {
    /* ignore */
  }
}

export function markWeeklyRankings() {
  try {
    sessionStorage.setItem(WEEKLY_BOARD_KEY, "1");
    sessionStorage.removeItem(DAILY_BOARD_KEY);
    sessionStorage.removeItem(PLAY_HOME_KEY);
  } catch {
    /* ignore */
  }
}

export function wantsWeeklyRankings() {
  try {
    return sessionStorage.getItem(WEEKLY_BOARD_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearWeeklyRankings() {
  try {
    sessionStorage.removeItem(WEEKLY_BOARD_KEY);
  } catch {
    /* ignore */
  }
}

export function markPlayHome() {
  try {
    sessionStorage.setItem(PLAY_HOME_KEY, "1");
    sessionStorage.removeItem(DAILY_BOARD_KEY);
    sessionStorage.removeItem(WEEKLY_BOARD_KEY);
  } catch {
    /* ignore */
  }
}

export function wantsPlayHome() {
  try {
    return sessionStorage.getItem(PLAY_HOME_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPlayHome() {
  try {
    sessionStorage.removeItem(PLAY_HOME_KEY);
  } catch {
    /* ignore */
  }
}

export function parseRankTab(raw: unknown): RankTabId | undefined {
  const value = String(raw ?? "");
  return value === "total" ||
    value === "daily" ||
    value === "weekly" ||
    value === "auction" ||
    value === "elimination" ||
    value === "score" ||
    value === "stars"
    ? value
    : undefined;
}

export function isLeaderboardTab(id: RankTabId): id is LeaderboardTabId {
  return LEADERBOARD_TABS.some((row) => row.id === id);
}

export function rankTabIndex(id: RankTabId, tabs: readonly { id: RankTabId }[] = RANK_TABS): number {
  return Math.max(0, tabs.findIndex((row) => row.id === id));
}

export function isBookTab(id: RankTabId): boolean {
  return BOOK_TABS.some((row) => row.id === id);
}
