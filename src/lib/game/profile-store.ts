import { create } from "zustand";
import { ownsAvatar, isAvatarId, type AvatarId } from "./avatars";
import { getMyStats, openMysteryBox, buyGoldenPepe, setMyAvatar, setMyName, type BoxResult, type CareerBook, type ShopResult, type ClaimableBook, type ClaimBookResult } from "./stats";
import { type ScratchClaimOk } from "./scratch";

type ProfileStore = {
  loaded: boolean;
  book: CareerBook | null;
  avatarId: AvatarId;
  displayName: string;
  claimEligible: boolean;
  claimBooks: ClaimableBook[];
  load: () => Promise<void>;
  pick: (id: AvatarId) => Promise<void>;
  rename: (name: string) => Promise<void>;
  claimBook: (name: string) => Promise<ClaimBookResult>;
  rollBox: () => Promise<BoxResult | null>;
  buyGolden: () => Promise<ShopResult | null>;
  applyScratch: (result: ScratchClaimOk) => void;
  clear: () => void;
};

export const useProfile = create<ProfileStore>((set, get) => ({
  loaded: false,
  book: null,
  avatarId: "poor",
  displayName: "",
  claimEligible: false,
  claimBooks: [],
  load: async () => {
    try {
      const book = await getMyStats();
      set({ loaded: true, book, avatarId: book.avatarId, displayName: book.displayName, claimEligible: false, claimBooks: [] });
    } catch {
      set({ loaded: true, book: null, avatarId: "poor", displayName: "", claimEligible: false, claimBooks: [] });
    }
  },
  pick: async (id) => {
    const owned = get().book?.owned ?? ["poor"];
    if (!ownsAvatar(id, owned)) return;
    set({ avatarId: id });
    try {
      const next = await setMyAvatar({ data: { avatarId: id } });
      set({ avatarId: next.avatarId });
    } catch {
      /* keep optimistic pick */
    }
  },
  rename: async (name) => {
    const next = name.trim().slice(0, 16);
    if (!next) return;
    set({ displayName: next });
    try {
      const saved = await setMyName({ data: { name: next } });
      set({ displayName: saved.displayName || next });
    } catch {
      /* keep optimistic name */
    }
  },
  claimBook: async (_name: string): Promise<ClaimBookResult> => ({ ok: false, reason: "ineligible" }),
  rollBox: async () => {
    try {
      const result = await openMysteryBox({ data: {} });
      const book = get().book;
      if (result.ok) {
        set({
          loaded: true,
          book: book
            ? { ...book, coins: result.coins, owned: result.owned }
            : book,
        });
      } else if (book) {
        set({ book: { ...book, coins: result.coins, owned: result.owned } });
      }
      return result;
    } catch (err) {
      console.error("openMysteryBox", err);
      return null;
    }
  },
  buyGolden: async () => {
    try {
      const result = await buyGoldenPepe({ data: {} });
      const book = get().book;
      if (result.ok) {
        set({
          loaded: true,
          avatarId: result.avatarId,
          book: book
            ? { ...book, coins: result.coins, owned: result.owned, avatarId: result.avatarId }
            : book,
        });
      } else if (book) {
        set({ book: { ...book, coins: result.coins, owned: result.owned } });
      }
      return result;
    } catch (err) {
      console.error("buyGoldenPepe", err);
      return null;
    }
  },
  applyScratch: (result) => {
    const book = get().book;
    if (!book) return;
    const equipped = isAvatarId(result.avatarId) ? result.avatarId : get().avatarId;
    set({
      avatarId: equipped,
      book: {
        ...book,
        coins: result.coins,
        owned: result.owned as CareerBook["owned"],
        dailyStars: result.dailyStars,
        scratchBank: result.bank,
        scratchReady: result.ready,
        avatarId: equipped,
      },
    });
  },
  clear: () => set({ loaded: false, book: null, avatarId: "poor", displayName: "", claimEligible: false, claimBooks: [] }),
}));
