import { DAILY_TZ, dailyDayStamp, dailyYesterday } from "./daily";
import { clampAvatar, type AvatarId } from "./avatars";

export type NewsKind = "match" | "box" | "scratch" | "daily_win" | "weekly_win" | "star_unlock" | "feat_unlock";

export type NewsFace = {
  name: string;
  avatarId: AvatarId;
};

export type NewsItem = {
  id: number;
  at: number;
  kind: NewsKind;
  faces: NewsFace[];
  score?: string;
  prizeId?: AvatarId;
  prizeLabel?: string;
  day?: string;
  week?: string;
};

export function formatNewsTime(at: number): string {
  const stamp = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
  return `${stamp} ET`;
}

export function formatNewsScore(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1);
}

export function newsFace(name: string, avatarId?: string | null): NewsFace {
  return { name: name.trim() || "GM", avatarId: clampAvatar(avatarId ?? "poor") };
}

/** Yesterday's ET calendar date. Feed backfill starts at that midnight ET. */
export function newsLookbackDay(now = Date.now()): string {
  return dailyYesterday(dailyDayStamp(now));
}
