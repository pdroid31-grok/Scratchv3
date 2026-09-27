import type { AvatarId } from "./avatars";

export const COMMISH_SETTINGS_ID = "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh";
export const COMMISH_PASSWORD_NAME = "Heisenberg";
export const GROKBOT_PASSWORD_NAME = "GrokBot1";

export type CommishBook = {
  id: string;
  name: string;
  coins: number;
  avatarId: AvatarId;
  claimedBy: string | null;
  empty: boolean;
};

export type CommishList = {
  books: CommishBook[];
};

export type CommishOk = { ok: true } | { ok: false; reason: string };

export type CommishPasswordStatus =
  | { kind: "credential"; userId: string }
  | { kind: "google"; userId: string }
  | { kind: "missing" }
  | { kind: "ambiguous" };

/** CEO Avatars tab only. Read-only progress. Not a grant list. */
export const COMMISH_AVATAR_PROGRESS = [
  { id: "earlybird", label: "Early Bird", hint: "Days this player was first / 10" },
  { id: "nightowl", label: "Night Owl", hint: "Days this player was last / 10" },
  { id: "coldstreak", label: "Cold Streak", hint: "Current no-win Daily streak / 15" },
  { id: "lost", label: "Lost", hint: "ET days since last done Daily (need 10)" },
  { id: "heavyhitter", label: "Heavy Hitter", hint: "Best single Weekly pick PPR (need 50; skip 2026-W1)" },
  { id: "bluestreak", label: "Blue Streak", hint: "Blue cells on last done Daily / 4" },
  { id: "thrifty", label: "Thrifty", hint: "$ spent on last done Daily (need ≤ 5)" },
  { id: "penny", label: "Penny", hint: "$1 slots on last done Daily" },
  { id: "silvermedal", label: "Silver Medal", hint: "Daily 2nd-place days / 5" },
  { id: "boxaddict", label: "Box Addict", hint: "Owned box-pool looks / 25" },
  { id: "vegas", label: "Vegas", hint: "0 or 1 (has claimed a scratch)" },
  { id: "boxlunch", label: "Box Lunch", hint: "0 or 1 (box + scratch same ET day)" },
] as const satisfies readonly { id: AvatarId; label: string; hint: string }[];

export type CommishAvatarProgressId = (typeof COMMISH_AVATAR_PROGRESS)[number]["id"];

export type CommishAvatarProgress = {
  label: string;
  hint: string;
  rows: { id: string; name: string; progress: string }[];
};

export function isCommishAvatarProgressId(id: string): id is CommishAvatarProgressId {
  return COMMISH_AVATAR_PROGRESS.some((row) => row.id === id);
}

export function isCommishSettingsUser(id?: string | null): boolean {
  return Boolean(id && id === COMMISH_SETTINGS_ID);
}
