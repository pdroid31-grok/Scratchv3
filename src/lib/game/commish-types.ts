import type { AvatarId } from "./avatars";

export const COMMISH_SETTINGS_ID = "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh";
export const COMMISH_PASSWORD_NAME = "Heisenberg";

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

export function isCommishSettingsUser(id?: string | null): boolean {
  return Boolean(id && id === COMMISH_SETTINGS_ID);
}
