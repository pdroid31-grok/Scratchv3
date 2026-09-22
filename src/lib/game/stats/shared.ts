/** Shared types/helpers for server stats modules. */
import type { BookSlice, CareerBook } from "../stats-types";

export type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export type TotalsRow = {
  games: number | string;
  wins: number | string;
  losses: number | string;
  ties: number | string;
  highest: number | string | null;
  lowest: number | string | null;
};

export type OppRow = {
  name: string;
  games: number | string;
  wins: number | string;
  losses: number | string;
  ties: number | string;
};

export function asInt(value: number | string | null | undefined): number {
  return Math.floor(Number(value) || 0);
}

export type ProfileRow = {
  avatar_id: string | null;
  display_name: string | null;
  coins: number | string | null;
  coin_wins: number | string | null;
  owned: string | null;
  credit: number | string | null;
  closet_reset: number | string | null;
  daily_stars?: number | string | null;
  box_forgive?: number | string | null;
  seed_lock?: number | string | null;
  career_book?: unknown;
  box_opens?: number | string | null;
};

export const emptyOpponents = (): CareerBook["opponentsBy"] => ({
  total: [],
  auction: [],
  elimination: [],
});

export const emptySlice = (): BookSlice => ({
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  highest: null,
  lowest: null,
});

export const emptyBook = (): CareerBook => ({
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  highest: null,
  lowest: null,
  opponents: [],
  total: emptySlice(),
  auction: emptySlice(),
  elimination: emptySlice(),
  opponentsBy: emptyOpponents(),
  avatarId: "poor",
  displayName: "",
  coins: 0,
  owned: ["poor"],
  dailyStars: 0,
  scratchBank: 0,
  scratchReady: 0,
});
