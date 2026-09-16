import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { clipDisplayName } from "./stats-shared";
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
    const { setMyNameHandler } = await import("./stats.server");
    return setMyNameHandler({ context, data });
  });

export const openMysteryBox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<BoxResult> => {
    const { openMysteryBoxHandler } = await import("./stats.server");
    return openMysteryBoxHandler({ context });
  });

export const buyGoldenPepe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<ShopResult> => {
    const { buyGoldenPepeHandler } = await import("./stats.server");
    return buyGoldenPepeHandler({ context });
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
