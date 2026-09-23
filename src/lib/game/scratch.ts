export const SCRATCH_NEED = 1000;
export const SCRATCH_WIPE = 0.6;
/** Daily `day` stamps (America/New_York) on or after this count toward the bank. */
export const SCRATCH_BANK_START = "2026-09-15";
/** New Daily 1st only. Points, not a card. */
export const DAILY_WIN_SCRATCH = 100;
/** New Weekly 1st only. Points, not a card. */
export const WEEKLY_WIN_SCRATCH = 200;

export function dailyWinScratchKey(day: string, userId: string): string {
  return `win-scratch:daily:${day}:${userId}`;
}

export function weeklyWinScratchKey(season: number, week: number, userId: string): string {
  return `win-scratch:weekly:${season}-W${week}:${userId}`;
}

export type ScratchPrizeKey = "nothing" | "coins1" | "coins2" | "coins3" | "star" | "combo" | "joker";

export type ScratchPrize = {
  key: ScratchPrizeKey;
  coins: number;
  stars: number;
  avatar: "crypepe" | "joker" | null;
  label: string;
};

const PRIZES: ScratchPrize[] = [
  { key: "nothing", coins: 0, stars: 0, avatar: "crypepe", label: "Nothing" },
  { key: "coins1", coins: 1, stars: 0, avatar: null, label: "+$1" },
  { key: "coins2", coins: 2, stars: 0, avatar: null, label: "+$2" },
  { key: "star", coins: 0, stars: 1, avatar: null, label: "+1 star" },
  { key: "coins3", coins: 3, stars: 0, avatar: null, label: "+$3" },
  { key: "combo", coins: 1, stars: 1, avatar: null, label: "+$1 and +1 star" },
  { key: "joker", coins: 0, stars: 0, avatar: "joker", label: "Mythical Joker Pepe" },
];

/** crypto.randomInt 1–100 buckets. 10+30+25+20+10+4+1 = 100. */
export function prizeFromRoll(roll: number): ScratchPrize {
  const n = Math.floor(Number(roll) || 0);
  if (n >= 1 && n <= 10) return PRIZES[0]!;
  if (n >= 11 && n <= 40) return PRIZES[1]!;
  if (n >= 41 && n <= 65) return PRIZES[2]!;
  if (n >= 66 && n <= 85) return PRIZES[3]!;
  if (n >= 86 && n <= 95) return PRIZES[4]!;
  if (n >= 96 && n <= 99) return PRIZES[5]!;
  if (n === 100) return PRIZES[6]!;
  return PRIZES[0]!;
}

export function prizeByKey(key: string): ScratchPrize {
  return PRIZES.find((row) => row.key === key) ?? PRIZES[0]!;
}

export function scratchFromTotal(total: number): { cards: number; bank: number } {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  return { cards: Math.floor(n / SCRATCH_NEED), bank: n % SCRATCH_NEED };
}

export function scratchPercent(bank: number): string {
  const b = Math.max(0, Math.floor(Number(bank) || 0));
  const pct = (Math.min(b, SCRATCH_NEED) / SCRATCH_NEED) * 100;
  return `${pct.toFixed(1)}%`;
}

export function floorDailyScore(score: number): number {
  const n = Number(score);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function scratchCountsDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= SCRATCH_BANK_START;
}

export function scratchTotalFromRuns(rows: readonly { day: string; score: number }[]): number {
  let total = 0;
  for (const row of rows) {
    if (!scratchCountsDay(row.day)) continue;
    total += floorDailyScore(row.score);
  }
  return total;
}

export function scratchKey(cardId: number | string): string {
  return `scratch:${cardId}`;
}

export type ScratchState = {
  bank: number;
  need: number;
  percent: string;
  ready: number;
};

export type ScratchCardView = {
  id: number;
  prize: ScratchPrize;
};

export type ScratchClaimOk = {
  ok: true;
  prize: ScratchPrize;
  grantedAvatar: "crypepe" | "joker" | null;
  avatarId: string;
  coins: number;
  dailyStars: number;
  owned: string[];
  bank: number;
  need: number;
  percent: string;
  ready: number;
};

export type ScratchClaimResult = ScratchClaimOk | { ok: false; reason: "missing" | "gone" };

