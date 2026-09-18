import { create } from "zustand";
import { applyAction, initialGame, shouldEnterHalftime, startAuction, type GameAction, type GameKind, type GameState } from "./engine";
import { elimBriefing } from "./elim";
import { dailyPickPayload, resumeDailyGame, startDailyGame } from "./daily";
import { claimDaily, getDaily, lockDaily, saveDailyDraft } from "./daily-api";
import { applyWeeklyLive, resumeWeeklyGame, startWeeklyGame, unpackWeeklyBoard, weeklyCenterGame, weeklyLockPayload } from "./weekly";
import { claimWeekly, lockWeekly, resumeWeekly, saveWeeklyDraft, weeklyBoardPack } from "./weekly-api";
import { hasHalftimeBoxes, sealedHalftime } from "./halftime";
import { actNight, hostNight, joinNight, leaveNight, syncNight, watchNight, type RoomView, type WatchView } from "./rooms";
import { maxBid, isEligible, canAffordReroll, canPickLot, replacementFor, shufflePair } from "./auction";
import { isAvatarId, type AvatarId } from "./avatars";
import { useProfile } from "./profile-store";
import type { LotChoice, Seat } from "./types";

const LOCAL_KEY = "darkness-v9";
const NET_KEY = "darkness-net-v1";
const JOIN_LOCK = "darkness-join-lock";

export type PlayMode = "local" | "online" | "daily" | "weekly" | "watch";

export interface ClientState extends GameState {
  hydrated: boolean;
  mode: PlayMode;
  roomCode: string | null;
  token: string | null;
  mySeat: Seat | null;
  version: number;
  netError: string | null;
  busy: boolean;
  acting: boolean;
  lobbyStay: boolean;
  roomFilled: boolean;
}
