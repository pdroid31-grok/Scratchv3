export type Position = "QB" | "RB" | "WR" | "TE";
export type Slot = "QB" | "RB1" | "RB2" | "WR1" | "WR2" | "TE";
export type Seat = 0 | 1;
export type LotChoice = 0 | 1;

export type TeamId =
  | "ARI"
  | "ATL"
  | "BAL"
  | "BUF"
  | "CAR"
  | "CHI"
  | "CIN"
  | "CLE"
  | "DAL"
  | "DEN"
  | "DET"
  | "GB"
  | "HOU"
  | "IND"
  | "JAX"
  | "KC"
  | "LAC"
  | "LAR"
  | "LV"
  | "MIA"
  | "MIN"
  | "NE"
  | "NO"
  | "NYG"
  | "NYJ"
  | "PHI"
  | "PIT"
  | "SEA"
  | "SF"
  | "TB"
  | "TEN"
  | "WAS";

export interface Team {
  id: TeamId;
  city: string;
  nick: string;
  primary: string;
  secondary: string;
  fg: string;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  team: TeamId;
  teamName: string;
  years: string;
  rating: number;
  note: string;
  /** Franchises with the most snaps, signature first. */
  teams: TeamId[];
  /** Calendar year of the player's best PPR season. Hidden until results. */
  peakYear?: number;
}

export interface AuctionLot {
  player: Player;
  other: Player;
  slot: Position;
}

export type Roster = Record<Slot, AuctionLot | null>;

export interface BidEvent {
  seat: Seat;
  kind: "open" | "raise" | "pass" | "claim" | "reroll" | "shuffle";
  amount: number;
}

export interface Sale {
  lot: AuctionLot;
  seat: Seat;
  price: number;
  unopposed: boolean;
}

export interface Discard {
  player: Player;
  kept: Player;
  seat: Seat;
  slot: Position;
}

export type Phase = "setup" | "lobby" | "bidding" | "unopposed" | "sold" | "halftime" | "draft" | "matchup" | "reveal" | "results";

export const SLOTS: Slot[] = ["QB", "RB1", "RB2", "WR1", "WR2", "TE"];
export const SLOT_SHORT: Record<Slot, string> = {
  QB: "QB",
  RB1: "RB",
  RB2: "RB",
  WR1: "WR",
  WR2: "WR",
  TE: "TE",
};
export const BUDGET = 25;
export const MIN_BID = 1;
export const REROLL_COST = 2;
export const BUST_RATING = 70;
export const BUST_CHANCE = 0.1;
export const TOTAL_LOTS = 12;
export const PAIR_COUNTS: Record<Position, number> = {
  QB: 2,
  RB: 4,
  WR: 4,
  TE: 2,
};

export function emptyRoster(): Roster {
  return { QB: null, RB1: null, RB2: null, WR1: null, WR2: null, TE: null };
}
