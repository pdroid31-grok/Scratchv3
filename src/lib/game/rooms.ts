import { createServerFn } from "@tanstack/react-start";
import { optionalAuthMiddleware } from "@/lib/auth/middleware";
import { isElimEra } from "./elim-data";
import { isAvatarId, type AvatarId } from "./avatars";
import type { GameAction } from "./engine";
import type { LobbyListing } from "./lobby-list";
import type { MatchHistoryRow, RoomResult, RoomView, WatchResult } from "./rooms-types";

export type { MatchHistoryRow, RoomFail, RoomResult, RoomView, WatchResult, WatchView } from "./rooms-types";

const ACTION_TYPES = new Set<GameAction["type"]>([
  "placeBid",
  "pass",
  "claim",
  "reroll",
  "advance",
  "rematch",
  "cancelRematch",
  "selectChoice",
  "shuffleLot",
  "pickBox",
  "pickElim",
  "flushElimDraft",
  "timeoutElim",
  "startReveal",
  "finishElim",
  "chat",
  "setElimEra",
  "readyElim",
]);

function clipName(name: string): string {
  const trimmed = name.trim().slice(0, 16);
  return trimmed || "GM";
}

function clipAvatar(id: unknown): AvatarId {
  const value = String(id ?? "");
  return isAvatarId(value) ? value : "poor";
}

function clipCode(code: unknown): string {
  return String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function parseAction(raw: unknown): GameAction {
  if (!raw || typeof raw !== "object") return { type: "advance" };
  const action = raw as { type?: unknown; amount?: unknown; index?: unknown; id?: unknown; text?: unknown; era?: unknown };
  const type = ACTION_TYPES.has(action.type as GameAction["type"])
    ? (action.type as GameAction["type"])
    : "advance";
  if (type === "placeBid") {
    return { type: "placeBid", amount: Math.floor(Number(action.amount) || 0) };
  }
  if (type === "selectChoice") {
    return { type: "selectChoice", index: Number(action.index) === 1 ? 1 : 0 };
  }
  if (type === "pickBox") {
    const index = Math.max(0, Math.min(3, Math.floor(Number(action.index) || 0)));
    return { type: "pickBox", index };
  }
  if (type === "pickElim") {
    return { type: "pickElim", id: String(action.id ?? "").slice(0, 80) };
  }
  if (type === "chat") {
    return { type: "chat", text: String(action.text ?? "").slice(0, 120) };
  }
  if (type === "setElimEra") {
    const era = String(action.era ?? "");
    return { type: "setElimEra", era: isElimEra(era) ? era : "modern" };
  }
  return { type };
}

export const hostNight = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { name: string; avatarId?: string; kind?: string; publicJoin?: boolean }) => ({
    name: clipName(data.name),
    avatarId: clipAvatar(data.avatarId),
    kind: data.kind === "elimination" ? "elimination" as const : "auction" as const,
    publicJoin: Boolean(data.publicJoin),
  }))
  .handler(async ({ data, context }): Promise<RoomView> => {
    const { hostNightHandler } = await import("./rooms.server");
    return hostNightHandler({ data, context });
  });

export const joinNight = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { code: string; name: string; avatarId?: string }) => ({
    code: clipCode(data.code),
    name: clipName(data.name),
    avatarId: clipAvatar(data.avatarId),
  }))
  .handler(async ({ data, context }): Promise<RoomResult> => {
    const { joinNightHandler } = await import("./rooms.server");
    return joinNightHandler({ data, context });
  });

export const syncNight = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { code: string; token: string }) => ({
    code: clipCode(data.code),
    token: String(data.token ?? ""),
  }))
  .handler(async ({ data, context }): Promise<RoomResult> => {
    const { syncNightHandler } = await import("./rooms.server");
    return syncNightHandler({ data, context });
  });

export const watchNight = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { code: string; claim?: boolean }) => ({
    code: clipCode(data.code),
    claim: Boolean(data.claim),
  }))
  .handler(async ({ data, context }): Promise<WatchResult> => {
    const { watchNightHandler } = await import("./rooms.server");
    return watchNightHandler({ data, context });
  });

export const actNight = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { code: string; token: string; version: number; action: GameAction }) => ({
    code: clipCode(data.code),
    token: String(data.token ?? ""),
    version: Number(data.version) || 0,
    action: parseAction(data.action),
  }))
  .handler(async ({ data, context }): Promise<RoomResult> => {
    const { actNightHandler } = await import("./rooms.server");
    return actNightHandler({ data, context });
  });

export const leaveNight = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator((data: { code: string; token: string }) => ({
    code: clipCode(data.code),
    token: String(data.token ?? ""),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { leaveNightHandler } = await import("./rooms.server");
    return leaveNightHandler({ data, context });
  });

export const listLobbies = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<LobbyListing[]> => {
    const { listLobbiesHandler } = await import("./rooms.server");
    return listLobbiesHandler();
  });

export const listMatchHistory = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async (): Promise<MatchHistoryRow[]> => {
    const { listMatchHistoryHandler } = await import("./rooms.server");
    return listMatchHistoryHandler();
  });
