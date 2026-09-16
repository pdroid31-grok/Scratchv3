import { clampAvatar, type AvatarId } from "./avatars";
import { clipDisplayName } from "./stats-shared";
import type { GameState } from "./engine";

export type LobbyListing = {
  code: string;
  kind: "auction" | "elimination";
  host: string;
  hostAvatar: AvatarId;
  guest: string | null;
  guestAvatar: AvatarId | null;
  open: boolean;
  joinable: boolean;
  watchable: boolean;
  series: [number, number];
};

export function liveSeriesScore(series: [number, number]): string {
  const a = Math.max(0, series[0] ?? 0);
  const b = Math.max(0, series[1] ?? 0);
  return a >= b ? `${a}–${b}` : `${b}–${a}`;
}

export function listingFromRoom(
  code: string,
  state: GameState,
  guestToken: string | null,
): LobbyListing | null {
  if (!code || state.phase === "results") return null;
  const open = !guestToken && state.phase === "lobby";
  const series = state.series ?? [0, 0];
  return {
    code,
    kind: state.kind === "elimination" ? "elimination" : "auction",
    host: clipDisplayName(state.names[0]) || "GM",
    hostAvatar: clampAvatar(state.avatars?.[0] ?? "poor"),
    guest: open ? null : clipDisplayName(state.names[1]) || "GM",
    guestAvatar: open ? null : clampAvatar(state.avatars?.[1] ?? "poor"),
    open,
    joinable: open && Boolean(state.publicJoin),
    watchable: !open,
    series: [series[0] ?? 0, series[1] ?? 0],
  };
}