import { create } from "zustand";
import { applyAction, startAuction, type GameKind, type GameState } from "./engine";
import { elimBriefing } from "./elim";
import { maxBid, isEligible, canAffordReroll, canPickLot, replacementFor, shufflePair } from "./auction";
import type { Seat } from "./types";
import {
type ClientState,
type Store,
commitLocal,
hydrateStore,
initialState,
lockJoinPrefill,
persistLocal,
persistNet,
snapshot,
} from "./store/persist";
import { maybeLockDaily, startDaily as startDailyRun } from "./store/daily";
import {
maybeLockWeekly,
openWeeklyCenter as openWeeklyCenterRun,
refreshWeekly as refreshWeeklyRun,
startWeekly as startWeeklyRun,
} from "./store/weekly";
import {
cancelRematch as cancelRematchRun,
hostOnline as hostOnlineRun,
joinOnline as joinOnlineRun,
pullRemote as pullRemoteRun,
rematchNight as rematchNightRun,
resetGame,
sendAction,
sendChat as sendChatRun,
watchOnline as watchOnlineRun,
} from "./store/online";

export type { ClientState, PlayMode, Store } from "./store/persist";

export const useGame = create<Store>((set, get) => ({
...initialState,
hydrate: () => hydrateStore(get, set),
startGame: (name0, name1, kind: GameKind = "auction") => {
const dealt = kind === "elimination" ? elimBriefing(name0, name1) : startAuction(name0, name1);
const next: ClientState = { ...initialState, ...dealt, hydrated: true, mode: "local" };
persistLocal(next);
persistNet(next);
lockJoinPrefill();
set(next);
},
startDaily: () => startDailyRun(get, set),
startWeekly: () => startWeeklyRun(get, set),
openWeeklyCenter: () => openWeeklyCenterRun(get, set),
refreshWeekly: () => refreshWeeklyRun(get, set),
hostOnline: (name, kind = "auction", fromLobby = false) => void hostOnlineRun(get, set, name, kind, fromLobby),
joinOnline: (code, name) => void joinOnlineRun(get, set, code, name),
watchOnline: (code) => void watchOnlineRun(get, set, code),
placeBid: (amount) => get().mode === "online" ? void sendAction(get, set, { type: "placeBid", amount }) : commitLocal(get, set, { type: "placeBid", amount }),
selectChoice: (index) => get().mode === "online" ? void sendAction(get, set, { type: "selectChoice", index }) : commitLocal(get, set, { type: "selectChoice", index }),
pass: () => get().mode === "online" ? void sendAction(get, set, { type: "pass" }) : commitLocal(get, set, { type: "pass" }),
claimUnopposed: () => get().mode === "online" ? void sendAction(get, set, { type: "claim" }) : commitLocal(get, set, { type: "claim" }),
rerollUnopposed: () => get().mode === "online" ? void sendAction(get, set, { type: "reroll" }) : commitLocal(get, set, { type: "reroll" }),
advanceFromSold: () => get().mode === "online" ? void sendAction(get, set, { type: "advance" }) : commitLocal(get, set, { type: "advance" }),
rematchNight: () => rematchNightRun(get, set),
cancelRematch: () => cancelRematchRun(get, set),
shuffleLot: () => get().mode === "online" ? void sendAction(get, set, { type: "shuffleLot" }) : commitLocal(get, set, { type: "shuffleLot" }),
pickBox: (index, seat) => {
if (get().mode === "online") { void sendAction(get, set, { type: "pickBox", index }); return; }
const state = get();
const next: ClientState = { ...state, ...applyAction(snapshot(state), { type: "pickBox", index }, seat) };
persistLocal(next);
set(next);
},
pickElim: (id) => get().mode === "online" ? void sendAction(get, set, { type: "pickElim", id }) : commitLocal(get, set, { type: "pickElim", id }),
flushElimDraft: () => {
if (get().mode === "online") { void sendAction(get, set, { type: "flushElimDraft" }); return; }
commitLocal(get, set, { type: "flushElimDraft" });
void maybeLockDaily(get, set);
void maybeLockWeekly(get, set);
},
timeoutElim: () => {
if (get().mode === "online") { void sendAction(get, set, { type: "timeoutElim" }); return; }
commitLocal(get, set, { type: "timeoutElim" });
void maybeLockDaily(get, set);
void maybeLockWeekly(get, set);
},
startReveal: () => get().mode === "online" ? void sendAction(get, set, { type: "startReveal" }) : commitLocal(get, set, { type: "startReveal" }),
finishElim: () => get().mode === "online" ? void sendAction(get, set, { type: "finishElim" }) : commitLocal(get, set, { type: "finishElim" }),
sendChat: (text) => sendChatRun(get, set, text),
setElimEra: (era) => get().mode === "online" ? void sendAction(get, set, { type: "setElimEra", era }) : commitLocal(get, set, { type: "setElimEra", era }, 0),
readyElim: (seat) => get().mode === "online" ? void sendAction(get, set, { type: "readyElim" }) : commitLocal(get, set, { type: "readyElim" }, seat),
pullRemote: () => pullRemoteRun(get, set),
reset: () => resetGame(get, set),
}));

export function isOnClock(state: ClientState): boolean {
if (state.mode !== "online") return true;
if (state.phase === "sold" || state.phase === "results" || state.phase === "lobby") return true;
if (state.phase === "matchup" || state.phase === "reveal") return true;
if (state.phase === "halftime") {
if (state.mySeat === null || !state.halftime) return false;
if (state.halftime.applied) return true;
return state.halftime.picks[state.mySeat] === null;
}
return state.mySeat === state.currentBidder;
}
export function seatMaxBid(state: GameState, seat: Seat) {
const lot = state.lots[state.lotIndex];
return lot ? maxBid(state.cash[seat], state.rosters[seat], lot.slot) : 0;
}
export function seatEligible(state: GameState, seat: Seat) {
const lot = state.lots[state.lotIndex];
return lot ? isEligible(state.cash[seat], state.rosters[seat], lot.slot) : false;
}
export function seatCanShuffle(state: GameState, seat: Seat) {
if (!canPickLot(state) || state.currentBid > 0) return false;
if (state.currentBidder !== seat || state.shuffleUsed?.[seat]) return false;
if (!canAffordReroll(state.cash[seat], state.rosters[seat], false)) return false;
return shufflePair(state.lots, state.lotIndex) !== null;
}
export function seatCanReroll(state: GameState, seat: Seat) {
if (state.phase !== "unopposed" || state.lotRerolled || state.currentBidder !== seat) return false;
const free = (state.freeRerolls?.[seat] ?? 0) > 0;
if (!free && (state.rerollUsed?.[seat] ?? false)) return false;
if (!canAffordReroll(state.cash[seat], state.rosters[seat], free)) return false;
return replacementFor(state.lots, state.lotIndex) !== null;
}
