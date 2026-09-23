import type { AvatarId } from "./avatars";

export type ToastKind = "daily_win" | "weekly_win" | "star_unlock" | "feat_unlock" | "scratch_ready";

export const TOAST_TEST_PREFIX = "toast-test:inspector1:";
export const TOAST_TEST_KEYS = {
  daily_win: `${TOAST_TEST_PREFIX}daily_win`,
  weekly_win: `${TOAST_TEST_PREFIX}weekly_win`,
  feat_unlock: `${TOAST_TEST_PREFIX}feat_unlock`,
} as const;

export type ToastPick = {
  slot: string;
  name: string;
  team: string;
  cost: number;
  score: number;
};

export type ToastPayload = {
  kind: ToastKind;
  name?: string;
  avatarId?: AvatarId;
  score?: number;
  day?: string;
  week?: number;
  season?: number;
  picks?: ToastPick[];
  coins?: number;
  stars?: number;
  prizeId?: AvatarId;
  prizeLabel?: string;
  starNeed?: number;
};

export type ToastItem = {
  sourceKey: string;
  kind: ToastKind;
  payload: ToastPayload;
  createdAt: number;
};

export const TOAST_KIND_RANK: Record<ToastKind, number> = {
  daily_win: 0,
  weekly_win: 1,
  star_unlock: 2,
  feat_unlock: 3,
  scratch_ready: 4,
};

export function isToastKind(value: string): value is ToastKind {
  return (
    value === "daily_win" ||
    value === "weekly_win" ||
    value === "star_unlock" ||
    value === "feat_unlock" ||
    value === "scratch_ready"
  );
}

export function sortToasts(rows: ToastItem[]): ToastItem[] {
  return [...rows].sort((a, b) => {
    const rank = TOAST_KIND_RANK[a.kind] - TOAST_KIND_RANK[b.kind];
    if (rank) return rank;
    return a.createdAt - b.createdAt;
  });
}

/** `{Mon D}` → Sep 15 */
export function formatToastDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function clipToastPicks(raw: unknown): ToastPick[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((row) => {
    const item = row as Partial<ToastPick>;
    return {
      slot: String(item.slot ?? "").slice(0, 4),
      name: String(item.name ?? "").slice(0, 80),
      team: String(item.team ?? "").slice(0, 4),
      cost: Math.max(0, Math.floor(Number(item.cost) || 0)),
      score: Math.round((Number(item.score) || 0) * 10) / 10,
    };
  });
}
