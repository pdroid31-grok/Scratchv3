import type { GameState } from "./engine";
import type { Seat } from "./types";

export type RoomView = {
  ok: true;
  code: string;
  seat: Seat;
  token: string;
  version: number;
  state: GameState;
  filled: boolean;
};

export type RoomFail = { ok: false; error: string };
export type RoomResult = RoomView | RoomFail;

export type WatchView = {
  ok: true;
  code: string;
  version: number;
  state: GameState;
  filled: boolean;
};
export type WatchResult = WatchView | RoomFail;

export type MatchHistoryRow = {
  code: string;
  nights: number;
  kind: "auction" | "elimination";
  winner: 0 | 1 | null;
  names: [string, string];
  avatars: [string, string];
  series: [number, number];
};
