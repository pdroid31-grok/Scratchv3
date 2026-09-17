import type { AvatarId } from "./avatars";

export type DailyStatus = "signed_out" | "open" | "playing" | "done" | "forfeit";

export type DailyPickPayload = { slot: string; id: string };

export type DailyMeta = {
  day: string;
  year: number;
  week: number | null;
  status: DailyStatus;
  score: number | null;
  paid: boolean;
  launch: string;
  picks: DailyPickPayload[];
};

export type DailyBoardRow = {
  id: string;
  name: string;
  avatarId: AvatarId;
  score: number;
  paid: boolean;
  winner: boolean;
  stars: number;
  hasPicks: boolean;
};

export type DailyBoard = {
  day: string;
  year: number;
  week: number | null;
  awarded: boolean;
  winnerId: string | null;
  rows: DailyBoardRow[];
};

export type DailyLineupPick = {
  slot: string;
  name: string;
  team: string;
  cost: number;
  score: number;
};

export type DailyLineup = {
  day: string;
  name: string;
  year: number;
  week: number;
  score: number;
  picks: DailyLineupPick[];
};
