import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { clipDisplayName, isHiddenBoardName } from "./stats-shared";
import type { AvatarId } from "./avatars";
import type {
  BoxResult,
  CareerBook,
  Leaderboard,
  PublicBook,
  RecordNightInput,
  ShopResult,
} from "./stats-types";

import type { ClaimableBookName, ClaimableBooksResult, ClaimBookResult } from "./claim-types";
import { CLAIMABLE_BOOK_NAMES } from "./claim-types";

export type {
  BoardRow,
  BookSlice,
  BoxResult,
  CareerBook,
  CareerOpponent,
  Leaderboard,
  PublicBook,
  ShopResult,
} from "./stats-types";
export type { ClaimableBook, ClaimableBookName, ClaimableBooksResult, ClaimBookResult } from "./claim-types";
export { CLAIMABLE_BOOK_NAMES } from "./claim-types";

export const recordNight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: RecordNightInput) => data)
  .handler(async ({ context, data }) => {
    const { normalizeRecordNight, recordNightHandler } = await import("./stats.server");
    return recordNightHandler({ context, data: normalizeRecordNight(data) });
  });

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CareerBook> => {
    const { getMyStatsHandler } = await import("./stats.server");
    return getMyStatsHandler({ context });
  });

export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { avatarId: string }) => ({
    avatarId: String(data.avatarId ?? ""),
  }))
  .handler(async ({ context, data }): Promise<{ avatarId: AvatarId }> => {
    const { setMyAvatarHandler } = await import("./stats.server");
    return setMyAvatarHandler({ context, data });
  });

export const setMyName = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name: string }) => ({
    name: clipDisplayName(String(data.name ?? "")),
  }))
  .handler(async ({ context, data }): Promise<{ displayName: string }> => {
    if (isHiddenBoardName(data.name)) return { displayName: "" };
    const { markNamePicked, nameTakenByOther } = await import("./name-pick.server");
    if (await nameTakenByOther(context.userId, data.name)) return { displayName: "" };
    const { setMyNameHandler } = await import("./stats.server");
    const saved = await setMyNameHandler({ context, data });
    if (saved.displayName) await markNamePicked(context.userId);
    return saved;
  });

export const openMysteryBox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<BoxResult> => {
    const { openMysteryBoxHandler } = await import("./stats.server");
    return openMysteryBoxHandler({ context });
  });

export const getShowcase = createServerFn({ method: "GET" }).handler(async (): Promise<{ sold: boolean; revealed: boolean }> => {
  const { getShowcaseHandler } = await import("./stats.server");
  return getShowcaseHandler();
});

export const buyGoldenPepe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<ShopResult> => {
    const { buyGoldenPepeHandler } = await import("./stats.server");
    return buyGoldenPepeHandler({ context });
  });

export type NplKind = "team" | "player";

export type NplMineSlot = {
  id: number;
  kind: NplKind;
  status: "form" | "pending" | "denied" | "approved";
  name: string;
  logo: string;
  colors: string;
  firstName: string;
  lastName: string;
  denyReason: string;
  note: string;
};

export type NplStock = {
  teamLeft: number;
  playerLeft: number;
  teamCost: number;
  playerCost: number;
};

export type NplMine = NplStock & { slots: NplMineSlot[] };

export type NplCeoSlot = {
  id: number;
  n: number;
  buyer: string;
  status: NplMineSlot["status"];
  name: string;
  logo: string;
  colors: string;
  firstName: string;
  lastName: string;
  denyReason: string;
};

export type NplBoard =
  | { ok: true; teams: (NplCeoSlot | null)[]; players: (NplCeoSlot | null)[] }
  | { ok: false; reason: "locked" };

function clipNplLine(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export const getNplStock = createServerFn({ method: "GET" }).handler(async (): Promise<NplStock> => {
  const { getNplStockHandler } = await import("./stats.server");
  return getNplStockHandler();
});

export const getNplMine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<NplMine> => {
    const { getNplMineHandler } = await import("./stats.server");
    return getNplMineHandler({ context });
  });

export const buyNpl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { kind?: string }) => ({
    kind: data.kind === "player" ? "player" : data.kind === "team" ? "team" : "",
  }))
  .handler(async ({ context, data }) => {
    const { buyNplHandler } = await import("./stats.server");
    return buyNplHandler({ context, data });
  });

export const submitNpl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: number; name?: string; logo?: string; colors?: string; firstName?: string; lastName?: string }) => ({
    id: Math.floor(Number(data.id) || 0),
    name: clipNplLine(data.name, 80),
    logo: clipNplLine(data.logo, 80),
    colors: clipNplLine(data.colors, 80),
    firstName: clipNplLine(data.firstName, 80),
    lastName: clipNplLine(data.lastName, 80),
  }))
  .handler(async ({ context, data }) => {
    const { submitNplHandler } = await import("./stats.server");
    return submitNplHandler({ context, data });
  });

export const listNpl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<NplBoard> => {
    const { listNplHandler } = await import("./stats.server");
    return listNplHandler({ context });
  });

export const approveNpl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: number }) => ({ id: Math.floor(Number(data.id) || 0) }))
  .handler(async ({ context, data }) => {
    const { approveNplHandler } = await import("./stats.server");
    return approveNplHandler({ context, data });
  });

export const denyNpl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id?: number; reason?: string }) => ({
    id: Math.floor(Number(data.id) || 0),
    reason: clipNplLine(data.reason, 200),
  }))
  .handler(async ({ context, data }) => {
    const { denyNplHandler } = await import("./stats.server");
    return denyNplHandler({ context, data });
  });

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async (): Promise<Leaderboard> => {
  const { getLeaderboardHandler } = await import("./stats.server");
  return getLeaderboardHandler();
});

export const listClaimableBooks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ClaimableBooksResult> => {
    const { listClaimableBooksHandler } = await import("./claim.server");
    return listClaimableBooksHandler({ context });
  });

export const claimExistingBook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name: string }) => {
    const name = String(data.name ?? "").trim();
    if (!(CLAIMABLE_BOOK_NAMES as readonly string[]).includes(name)) {
      return { name: "" };
    }
    return { name: name as ClaimableBookName };
  })
  .handler(async ({ context, data }): Promise<ClaimBookResult> => {
    if (!data.name) return { ok: false, reason: "invalid" };
    const { claimExistingBookHandler } = await import("./claim.server");
    return claimExistingBookHandler({ context, data });
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .validator((data: { userId: string }) => ({ userId: String(data.userId ?? "").trim().slice(0, 80) }))
  .handler(async ({ data }): Promise<PublicBook | null> => {
    const { getPublicProfileHandler } = await import("./stats.server");
    return getPublicProfileHandler({ data });
  });

export const listAchievementOwners = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => ({ id: String(data.id ?? "").trim() }))
  .handler(async ({ data }): Promise<{ userId: string; src: string }[]> => {
    const { listAchievementOwnersHandler } = await import("./stats.server");
    return listAchievementOwnersHandler({ data });
  });

export const dateFeatReveal = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ halloween: boolean; turkeyday: boolean; newyears: boolean }> => {
    const { dateFeatRevealHandler } = await import("./stats.server");
    return dateFeatRevealHandler();
  },
);
