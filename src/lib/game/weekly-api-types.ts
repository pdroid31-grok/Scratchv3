import type { AvatarId } from "./avatars";
import type { WeeklyPackedBoard, WeeklyPickSnap } from "./weekly";

export type WeeklyStatus = "signed_out" | "open" | "playing" | "done" | "forfeit" | "locked" | "gated";

export type WeeklyMeta = {
  season: number;
  week: number;
  status: WeeklyStatus;
  lockAt: number;
  endAt: number;
  opensAt: number;
  gated: boolean;
  live: boolean;
  awarded: boolean;
  score: number | null;
  paid: boolean;
  winner: boolean;
  picks: WeeklyPickPayload[];
};

export type WeeklyBoardRow = {
  id: string;
  name: string;
  avatarId: AvatarId;
  score: number | null;
  paid: boolean;
  winner: boolean;
  stars: number;
  hasPicks: boolean;
  floor?: boolean;
};

export type WeeklyBoard = {
  season: number;
  week: number;
  currentSeason: number;
  currentWeek: number;
  awarded: boolean;
  live: boolean;
  lockAt: number;
  rows: WeeklyBoardRow[];
};

export type WeeklyLineup = {
  season: number;
  week: number;
  name: string;
  score: number | null;
  live: boolean;
  awarded: boolean;
  picks: WeeklyPickSnap[];
};

export type WeeklyResume = {
  season: number;
  week: number;
  live: boolean;
  awarded: boolean;
  score: number;
  paid: boolean;
  winner: boolean;
  picks: WeeklyPickSnap[];
};

export type WeeklyBoardPack = {
  season: number;
  week: number;
  board: WeeklyPackedBoard;
};

export type WeeklyPickPayload = { slot: string; id: string };

export type SeasonBoardRow = {
  id: string;
  name: string;
  avatarId: AvatarId;
  score: number;
  weeks: number;
  move?: "up" | "down" | "same";
  spots?: number;
};

export type SeasonBoard = {
  season: number;
  currentSeason: number;
  currentWeek: number;
  live?: boolean;
  rows: SeasonBoardRow[];
};
