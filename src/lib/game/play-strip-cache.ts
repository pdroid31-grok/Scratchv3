/** sessionStorage cache for Play home Daily/Weekly strips. Client only. */

export function readKeyedCache<T extends { key: string }>(storageKey: string, key: string): T | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!parsed || parsed.key !== key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeKeyedCache(storageKey: string, value: { key: string }): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export const DAILY_STRIP_CACHE = "darkness-play-daily";
export const WEEKLY_STRIP_CACHE = "darkness-play-weekly";
export const WEEKLY_STRIP_CUR = "darkness-play-weekly-cur";

export function weeklyStripKey(season: number, week: number): string {
  return `${season}-W${week}`;
}

export function readWeeklyCur(): { key: string; day: string } | null {
  try {
    const raw = sessionStorage.getItem(WEEKLY_STRIP_CUR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; day?: string };
    if (!parsed.key || !parsed.day) return null;
    return { key: parsed.key, day: parsed.day };
  } catch {
    return null;
  }
}

export function writeWeeklyCur(key: string, day: string): void {
  try {
    sessionStorage.setItem(WEEKLY_STRIP_CUR, JSON.stringify({ key, day }));
  } catch {
    /* ignore quota */
  }
}
