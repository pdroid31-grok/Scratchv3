import type { AvatarId } from "./avatars";

export type CareerOpponent = {
  name: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
};

export type BookSlice = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  highest: number | null;
  lowest: number | null;
};

export type CareerBook = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  highest: number | null;
  lowest: number | null;
  opponents: CareerOpponent[];
  total: BookSlice;
  auction: BookSlice;
  elimination: BookSlice;
  opponentsBy: {
    total: CareerOpponent[];
    auction: CareerOpponent[];
    elimination: CareerOpponent[];
  };
  avatarId: AvatarId;
  displayName: string;
  coins: number;
  owned: AvatarId[];
  dailyStars: number;
  scratchBank: number;
  scratchReady: number;
};

export type BoxResult =
  | { ok: true; prize: AvatarId; coins: number; owned: AvatarId[]; avatarId: AvatarId }
  | { ok: false; reason: "broke" | "complete"; coins: number; owned: AvatarId[] };

export type ShopResult =
  | { ok: true; coins: number; owned: AvatarId[]; avatarId: AvatarId }
  | { ok: false; reason: "broke" | "owned"; coins: number; owned: AvatarId[] };

export type BoardRow = {
  id: string;
  name: string;
  avatarId: AvatarId;
  games: number;
  wins: number;
  highest: number | null;
  stars: number;
};

export type PublicBook = {
  id: string;
  name: string;
  avatarId: AvatarId;
  owned: AvatarId[];
  coins: number;
  dailyStars: number;
  total: BookSlice;
  auction: BookSlice;
  elimination: BookSlice;
};

export type Leaderboard = {
  total: BoardRow[];
  auction: BoardRow[];
  elimination: BoardRow[];
  score: BoardRow[];
  stars: BoardRow[];
};

export type RecordNightInput = {
  nightKey: string;
  opponentName: string;
  gmName?: string;
  won: boolean | null;
  score: number;
  opponentScore: number;
  lowScore?: number;
  kind?: "auction" | "elimination";
  roomCode?: string;
  token?: string;
  seat?: 0 | 1;
  nights?: number;
};
