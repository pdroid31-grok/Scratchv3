import type { AvatarId } from "./avatars";

export const CLAIMABLE_BOOK_NAMES = [
  "Ty",
  "WWW",
  "Heisenberg",
  "JSwanny",
  "MSwan",
  "Marquis Scott",
  "Commish",
  "Stevo",
  "Marquise Bessell",
  "Jay Mack",
  "Max Faile",
] as const;

export type ClaimableBookName = (typeof CLAIMABLE_BOOK_NAMES)[number];

export type ClaimableBook = {
  name: ClaimableBookName;
  avatarId: AvatarId;
};

export type ClaimableBooksResult = {
  eligible: boolean;
  books: ClaimableBook[];
};

export type ClaimBookResult =
  | { ok: true }
  | { ok: false; reason: "ineligible" | "taken" | "ambiguous" | "invalid" };
