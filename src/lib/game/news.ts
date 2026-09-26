import { DAILY_TZ, dailyDayStamp, dailyYesterday } from "./daily";
import { clampAvatar, type AvatarId } from "./avatars";

export type NewsKind = "match" | "box" | "scratch" | "daily_win" | "weekly_win" | "star_unlock" | "feat_unlock";

export type NewsFace = {
  name: string;
  avatarId: AvatarId;
  userId?: string;
};

export type NewsItem = {
  id: number;
  at: number;
  event_at: number;
  kind: NewsKind;
  faces: NewsFace[];
  score?: string;
  prizeId?: AvatarId;
  prizeLabel?: string;
  stars?: number;
  scratchPoints?: number;
  day?: string;
  week?: string;
};

function etParts(ms: number): { day: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const g = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${g("year")}-${g("month")}-${g("day")}`,
    hour: Number(g("hour")),
    minute: Number(g("minute")),
  };
}

/** Instant when the ET clock is `hour`:`minute` on `day` (YYYY-MM-DD). */
export function etOnDay(day: string, hour: number, minute = 0): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Date.now();
  let ms = Date.parse(`${day}T16:00:00.000Z`);
  for (let i = 0; i < 8; i += 1) {
    const seen = etParts(ms);
    const dayDelta = day === seen.day ? 0 : day > seen.day ? 1 : -1;
    const deltaMin = dayDelta * 24 * 60 + (hour - seen.hour) * 60 + (minute - seen.minute);
    if (deltaMin === 0 && seen.day === day) return ms;
    ms += deltaMin * 60_000;
  }
  return ms;
}

function nextCalendarDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** daily_win event_at: midnight ET when that contest day closes. Same stamp for every daily_win. */
export function dailyWinEventAt(day: string): number {
  return etOnDay(nextCalendarDay(day), 0, 0);
}

export function weeklyWinEventAt(endAt?: number, lockAt?: number, createdAt?: number): number {
  if (endAt && Number.isFinite(endAt)) return endAt;
  if (lockAt && Number.isFinite(lockAt)) return lockAt;
  if (createdAt && Number.isFinite(createdAt)) return createdAt;
  return Date.now();
}

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

export function newsFace(name: string, avatarId?: string | null, userId?: string | null): NewsFace {
  const face: NewsFace = { name: name.trim() || "GM", avatarId: clampAvatar(avatarId ?? "poor") };
  const id = String(userId ?? "").trim();
  if (id) face.userId = id;
  return face;
}

/** Start of the feed window: midnight ET, 7 ET calendar days including today. */
export const NEWS_LOOKBACK_DAYS = 7;

export function newsLookbackDay(now = Date.now()): string {
  let day = dailyDayStamp(now);
  for (let i = 1; i < NEWS_LOOKBACK_DAYS; i += 1) day = dailyYesterday(day);
  return day;
}

export function newsYesterday(now = Date.now()): string {
  return dailyYesterday(dailyDayStamp(now));
}
