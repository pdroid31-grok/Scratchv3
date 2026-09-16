import { applyReroll, buildLots, canAffordReroll, canPickLot, emptyCount, fillRoster, isEligible, lotIds, maxBid, nightWinner, otherSeat, playerAt, replacementFor, shufflePair } from "./auction";
import { applyPrize, dealHalftime, HALFTIME_AFTER, LOAN_PENALTY, type HalftimeState } from "./halftime";
import { clampAvatar, type AvatarId } from "./avatars";
import {
  finishElimination,
  flushElimDraft,
  pickElim,
  readyElim,
  rematchElimination,
  setElimEra,
  startElimReveal,
  startElimination,
  timeoutElim,
  type ElimState,
  type GameKind,
} from "./elim";
import {
  BUDGET,
  MIN_BID,
  REROLL_COST,
  emptyRoster,
  type AuctionLot,
  type BidEvent,
  type Discard,
  type LotChoice,
  type Phase,
  type Roster,
  type Sale,
  type Seat,
} from "./types";
import type { ElimEra } from "./elim-data";

export interface RerollFx {
  seq: number;
  before: number;
  after: number;
  at: number;
}

export interface LoanNotice {
  seat: Seat;
  taken: number;
}

export interface GameState {
  phase: Phase;
  kind?: GameKind;
  elim?: ElimState | null;
  names: [string, string];
  cash: [number, number];
  rosters: [Roster, Roster];
  lots: AuctionLot[];
  lotIndex: number;
  nominator: Seat;
  currentBidder: Seat;
  currentBid: number;
  bidHolder: Seat | null;
  history: BidEvent[];
  sales: Sale[];
  lastSale: Sale | null;
  lotRerolled: boolean;
  discards: Discard[];
  rerollFx: RerollFx | null;
  choice: LotChoice | null;
  bonus: [number, number];
  freeRerolls: [number, number];
  halftime: HalftimeState | null;
  loans: LoanNotice[];
  avatars: [AvatarId, AvatarId];
  userIds: [string | null, string | null];
  rematchReady: [boolean, boolean];
  shuffleUsed: [boolean, boolean];
  rerollUsed: [boolean, boolean];
  series: [number, number];
  nights: number;
  chat?: ChatLine[];
  publicJoin?: boolean;
  elimEra?: ElimEra;
  elimReady?: [boolean, boolean];
  daily?: { day: string; hideWeek: boolean } | null;
  weekly?: { season: number; week: number; live: boolean; locked?: boolean; awarded?: boolean; paid?: boolean; winner?: boolean; score?: number } | null;
}

export type ChatLine = {
  seat: Seat;
  text: string;
  at: number;
};

export type GameAction =
  | { type: "placeBid"; amount: number }
  | { type: "pass" }
  | { type: "claim" }
  | { type: "reroll" }
  | { type: "advance" }
  | { type: "rematch" }
  | { type: "cancelRematch" }
  | { type: "selectChoice"; index: LotChoice }
  | { type: "shuffleLot" }
  | { type: "pickBox"; index: number }
  | { type: "pickElim"; id: string }
  | { type: "startReveal" }
  | { type: "finishElim" }
  | { type: "flushElimDraft" }
  | { type: "timeoutElim" }
  | { type: "chat"; text: string }
  | { type: "setElimEra"; era: ElimEra }
  | { type: "readyElim" };

export const initialGame = (): GameState => ({
  phase: "setup",
  kind: "auction",
  elim: null,
  names: ["", ""],
  cash: [BUDGET, BUDGET],
  rosters: [emptyRoster(), emptyRoster()],
  lots: [],
  lotIndex: 0,
  nominator: 0,
  currentBidder: 0,
  currentBid: 0,
  bidHolder: null,
  history: [],
  sales: [],
  lastSale: null,
  lotRerolled: false,
  discards: [],
  rerollFx: null,
  choice: null,
  bonus: [0, 0],
  freeRerolls: [0, 0],
  halftime: null,
  loans: [],
  avatars: ["poor", "poor"],
  userIds: [null, null],
  rematchReady: [false, false],
  shuffleUsed: [false, false],
  rerollUsed: [false, false],
  series: [0, 0],
  nights: 0,
  chat: [],
  publicJoin: false,
  elimEra: "modern",
  elimReady: [false, false],
  daily: null,
  weekly: null,
});

export function lobbyState(
  hostName: string,
  hostAvatar: AvatarId = "poor",
  hostUserId: string | null = null,
  kind: GameKind = "auction",
  publicJoin = false,
): GameState {
  return {
    ...initialGame(),
    phase: "lobby",
    kind,
    names: [hostName.trim() || "Home", ""],
    avatars: [clampAvatar(hostAvatar), "poor"],
    userIds: [hostUserId, null],
    publicJoin,
  };
}

function currentLot(state: GameState): AuctionLot {
  const lot = state.lots[state.lotIndex];
  if (!lot) throw new Error("No active lot");
  return lot;
}

function saleLot(state: GameState): AuctionLot {
  const lot = currentLot(state);
  if (state.choice === null) return lot;
  return { ...lot, player: playerAt(lot, state.choice) };
}

function applySale(state: GameState, sale: Sale): GameState {
  const seat = sale.seat;
  const nextRosters: [Roster, Roster] = [
    seat === 0 ? fillRoster(state.rosters[0], sale.lot) : state.rosters[0],
    seat === 1 ? fillRoster(state.rosters[1], sale.lot) : state.rosters[1],
  ];
  const nextCash: [number, number] = [
    seat === 0 ? state.cash[0] - sale.price : state.cash[0],
    seat === 1 ? state.cash[1] - sale.price : state.cash[1],
  ];
  return {
    ...state,
    cash: nextCash,
    rosters: nextRosters,
    sales: [...state.sales, sale],
    lastSale: sale,
    phase: "sold",
    history: [],
    currentBid: 0,
    bidHolder: null,
    lotRerolled: false,
    rerollFx: null,
    choice: null,
  };
}

function openedLot(
  state: GameState,
  index: number,
  nominator: Seat,
  extra: Partial<GameState>,
): GameState {
  return {
    ...state,
    lotIndex: index,
    nominator,
    currentBid: 0,
    bidHolder: null,
    history: [],
    lotRerolled: false,
    rerollFx: null,
    choice: null,
    ...extra,
  };
}

export function openLot(state: GameState, index: number, nominator: Seat): GameState {
  if (index >= state.lots.length) {
    return finishNight({ ...state, lotIndex: index });
  }
  const lot = state.lots[index];
  if (!lot) {
    return finishNight({ ...state, lotIndex: index });
  }
  const e0 = isEligible(state.cash[0], state.rosters[0], lot.slot);
  const e1 = isEligible(state.cash[1], state.rosters[1], lot.slot);
  if (e0 && !e1) {
    return openedLot(state, index, nominator, { phase: "unopposed", currentBidder: 0 });
  }
  if (e1 && !e0) {
    return openedLot(state, index, nominator, { phase: "unopposed", currentBidder: 1 });
  }
  const opener = isEligible(state.cash[nominator], state.rosters[nominator], lot.slot)
    ? nominator
    : otherSeat(nominator);
  return openedLot(state, index, nominator, { phase: "bidding", currentBidder: opener });
}

export type AuctionCarry = {
  series?: [number, number];
  nights?: number;
  avoid?: Iterable<string>;
  avatars?: [AvatarId, AvatarId];
  userIds?: [string | null, string | null];
  elimEra?: ElimEra;
  chat?: ChatLine[];
  publicJoin?: boolean;
};

export function startAuction(name0: string, name1: string, carry?: AuctionCarry): GameState {
  const lots = buildLots(carry?.avoid);
  const nominator: Seat = Math.random() < 0.5 ? 0 : 1;
  return openLot(
    {
      ...initialGame(),
      kind: "auction",
      elim: null,
      names: [name0.trim() || "Home", name1.trim() || "Away"],
      lots,
      cash: [BUDGET, BUDGET],
      rosters: [emptyRoster(), emptyRoster()],
      discards: [],
      rerollFx: null,
      choice: null,
      bonus: [0, 0],
      freeRerolls: [0, 0],
      halftime: null,
      loans: [],
      avatars: carry?.avatars ?? ["poor", "poor"],
      userIds: carry?.userIds ?? [null, null],
      rematchReady: [false, false],
      shuffleUsed: [false, false],
      rerollUsed: [false, false],
      series: carry?.series ?? [0, 0],
      nights: carry?.nights ?? 0,
    },
    0,
    nominator,
  );
}

function selectChoice(state: GameState, index: number): GameState {
  if (!canPickLot(state)) return state;
  const choice: LotChoice = index === 1 ? 1 : 0;
  if (state.choice === choice) return state;
  return { ...state, choice };
}

function placeBid(state: GameState, amount: number): GameState {
  if (state.phase !== "bidding") return state;
  if (state.currentBid === 0 && state.choice === null) return state;
  const lot = currentLot(state);
  const seat = state.currentBidder;
  const cap = maxBid(state.cash[seat], state.rosters[seat], lot.slot);
  const minNext = state.currentBid === 0 ? MIN_BID : state.currentBid + MIN_BID;
  const bid = Math.min(cap, Math.max(minNext, Math.floor(amount)));
  if (bid < minNext || bid > cap) return state;
  const kind: BidEvent["kind"] = state.currentBid === 0 ? "open" : "raise";
  return {
    ...state,
    currentBid: bid,
    bidHolder: seat,
    currentBidder: otherSeat(seat),
    history: [...state.history, { seat, kind, amount: bid }],
  };
}

function pass(state: GameState): GameState {
  if (state.phase !== "bidding") return state;
  if (state.bidHolder === null || state.currentBid < MIN_BID || state.choice === null) return state;
  return applySale(state, {
    lot: saleLot(state),
    seat: state.bidHolder,
    price: state.currentBid,
    unopposed: false,
  });
}

function claim(state: GameState): GameState {
  if (state.phase !== "unopposed") return state;
  if (state.choice === null) return state;
  return applySale(state, {
    lot: saleLot(state),
    seat: state.currentBidder,
    price: MIN_BID,
    unopposed: true,
  });
}

function reroll(state: GameState): GameState {
  if (state.phase !== "unopposed" || state.lotRerolled) return state;
  if (state.choice === null) return state;
  const seat = state.currentBidder;
  const usingFree = (state.freeRerolls[seat] ?? 0) > 0;
  const used = state.rerollUsed ?? [false, false];
  if (!usingFree && used[seat]) return state;
  if (!canAffordReroll(state.cash[seat], state.rosters[seat], usingFree)) return state;
  const lot = currentLot(state);
  const current = playerAt(lot, state.choice);
  const player = replacementFor(state.lots, state.lotIndex);
  if (!player) return state;
  const nextCash: [number, number] = usingFree
    ? state.cash
    : [
        seat === 0 ? state.cash[0] - REROLL_COST : state.cash[0],
        seat === 1 ? state.cash[1] - REROLL_COST : state.cash[1],
      ];
  const nextFree: [number, number] = usingFree
    ? [
        seat === 0 ? state.freeRerolls[0] - 1 : state.freeRerolls[0],
        seat === 1 ? state.freeRerolls[1] - 1 : state.freeRerolls[1],
      ]
    : state.freeRerolls;
  return {
    ...state,
    lots: applyReroll(state.lots, state.lotIndex, player, state.choice),
    cash: nextCash,
    freeRerolls: nextFree,
    lotRerolled: true,
    rerollUsed: usingFree
      ? used
      : ([seat === 0 ? true : used[0], seat === 1 ? true : used[1]] as [boolean, boolean]),
    discards: [...state.discards, { player: current, kept: player, seat, slot: lot.slot }],
    history: [...state.history, { seat, kind: "reroll", amount: usingFree ? 0 : REROLL_COST }],
    rerollFx: {
      seq: (state.rerollFx?.seq ?? 0) + 1,
      before: current.rating,
      after: player.rating,
      at: Date.now(),
    },
  };
}

function shuffleLot(state: GameState): GameState {
  if (!canPickLot(state) || state.currentBid > 0) return state;
  const seat = state.currentBidder;
  const used = state.shuffleUsed ?? [false, false];
  if (used[seat]) return state;
  if (!canAffordReroll(state.cash[seat], state.rosters[seat], false)) return state;
  const nextPair = shufflePair(state.lots, state.lotIndex);
  if (!nextPair) return state;
  const nextLots = state.lots.map((item, i) =>
    i === state.lotIndex ? { ...item, player: nextPair[0], other: nextPair[1] } : item,
  );
  const nextCash: [number, number] = [
    seat === 0 ? state.cash[0] - REROLL_COST : state.cash[0],
    seat === 1 ? state.cash[1] - REROLL_COST : state.cash[1],
  ];
  const nextUsed: [boolean, boolean] = [used[0], used[1]];
  nextUsed[seat] = true;
  return {
    ...state,
    lots: nextLots,
    cash: nextCash,
    choice: null,
    shuffleUsed: nextUsed,
    history: [...state.history, { seat, kind: "shuffle", amount: REROLL_COST }],
  };
}

function rematch(state: GameState, actor?: Seat): GameState {
  if (state.phase !== "results") return state;
  if (state.kind === "elimination") return rematchElimination(state, actor);
  const ready: [boolean, boolean] = [
    state.rematchReady?.[0] ?? false,
    state.rematchReady?.[1] ?? false,
  ];
  if (actor === 0 || actor === 1) {
    ready[actor] = true;
  } else {
    ready[0] = true;
    ready[1] = true;
  }
  if (!ready[0] || !ready[1]) {
    return { ...state, rematchReady: ready };
  }
  return {
    ...startAuction(state.names[0], state.names[1], {
      series: state.series ?? [0, 0],
      nights: state.nights ?? 0,
      avoid: lotIds(state.lots),
      avatars: state.avatars ?? ["poor", "poor"],
      userIds: state.userIds ?? [null, null],
    }),
    chat: state.chat ?? [],
  };
}

function cancelRematch(state: GameState, actor?: Seat): GameState {
  if (state.phase !== "results") return state;
  const ready: [boolean, boolean] = [
    state.rematchReady?.[0] ?? false,
    state.rematchReady?.[1] ?? false,
  ];
  if (actor === 0 || actor === 1) {
    if (!ready[actor]) return state;
    ready[actor] = false;
    return { ...state, rematchReady: ready };
  }
  if (!ready[0] && !ready[1]) return state;
  return { ...state, rematchReady: [false, false] };
}

function finishNight(state: GameState): GameState {
  if (state.phase === "results") return state;
  const winner = nightWinner(state.rosters, state.bonus ?? [0, 0], state.cash);
  const series: [number, number] = [state.series?.[0] ?? 0, state.series?.[1] ?? 0];
  if (winner === 0) series[0] += 1;
  else if (winner === 1) series[1] += 1;
  return {
    ...state,
    phase: "results",
    lastSale: state.lastSale,
    choice: null,
    series,
    nights: (state.nights ?? 0) + 1,
  };
}

function applyHalftimePrizes(state: GameState): GameState {
  const ht = state.halftime;
  if (!ht || ht.applied) return state;
  if (ht.picks[0] === null || ht.picks[1] === null) return state;
  const cash: [number, number] = [state.cash[0], state.cash[1]];
  const bonus: [number, number] = [state.bonus[0], state.bonus[1]];
  const freeRerolls: [number, number] = [state.freeRerolls[0], state.freeRerolls[1]];
  const loans: LoanNotice[] = [];
  for (const seat of [0, 1] as const) {
    const pick = ht.picks[seat];
    if (pick === null) continue;
    const prize = ht.boxes[seat][pick];
    if (!prize) continue;
    const before = cash[seat];
    const roster = state.rosters?.[seat];
    const need = roster ? emptyCount(roster) : 0;
    const next = applyPrize(cash[seat], bonus[seat], freeRerolls[seat], prize);
    cash[seat] = next.cash;
    bonus[seat] = next.bonus;
    freeRerolls[seat] = next.freeRerolls;
    if (prize.kind === "cash" && prize.amount < 0 && before >= need && cash[seat] < need) {
      const taken = before - cash[seat];
      cash[seat] = before;
      bonus[seat] -= LOAN_PENALTY;
      loans.push({ seat, taken });
    }
  }
  return {
    ...state,
    cash,
    bonus,
    freeRerolls,
    loans,
    halftime: { ...ht, applied: true, ready: [false, false] },
  };
}

function pickBox(state: GameState, index: number, actor?: Seat): GameState {
  const ht = state.halftime;
  if (state.phase !== "halftime" || !ht || ht.applied) return state;
  const seat: Seat | null =
    actor !== undefined ? actor : ht.picks[0] === null ? 0 : ht.picks[1] === null ? 1 : null;
  if (seat === null) return state;
  if (ht.picks[seat] !== null) return state;
  const slot = Math.floor(index);
  if (slot < 0 || slot > 3 || !ht.boxes[seat]?.[slot]) return state;
  const picks: [number | null, number | null] = [ht.picks[0], ht.picks[1]];
  picks[seat] = slot;
  const next: GameState = {
    ...state,
    halftime: { ...ht, picks },
    currentBidder: picks[0] === null ? 0 : picks[1] === null ? 1 : state.currentBidder,
  };
  if (picks[0] !== null && picks[1] !== null) return applyHalftimePrizes(next);
  return next;
}

export function shouldEnterHalftime(state: GameState): boolean {
  return state.phase === "sold" && state.lotIndex + 1 === HALFTIME_AFTER && state.halftime === null;
}

function advance(state: GameState, actor?: Seat): GameState {
  if (state.phase === "halftime") {
    const ht = state.halftime;
    if (!ht?.applied) return state;
    const ready: [boolean, boolean] = [ht.ready?.[0] ?? false, ht.ready?.[1] ?? false];
    if (actor === 0 || actor === 1) {
      ready[actor] = true;
      if (!ready[0] || !ready[1]) {
        return { ...state, halftime: { ...ht, ready } };
      }
    }
    const winner2 = state.lastSale?.seat;
    const nextNominator2: Seat =
      winner2 === 0 || winner2 === 1 ? otherSeat(winner2) : otherSeat(state.nominator);
    return openLot(state, HALFTIME_AFTER, nextNominator2);
  }
  if (state.phase !== "sold") return state;
  const nextIndex = state.lotIndex + 1;
  if (nextIndex === HALFTIME_AFTER && state.halftime === null) {
    return {
      ...state,
      phase: "halftime",
      halftime: dealHalftime(),
      currentBidder: 0,
    };
  }
  const winner = state.lastSale?.seat;
  const nextNominator: Seat =
    winner === 0 || winner === 1 ? otherSeat(winner) : otherSeat(state.nominator);
  return openLot(state, nextIndex, nextNominator);
}

export function applyAction(state: GameState, action: GameAction, actor?: Seat): GameState {
  switch (action.type) {
    case "placeBid":
    case "pass":
    case "claim":
    case "reroll":
    case "shuffleLot":
    case "selectChoice": {
      if (state.kind === "elimination") return state;
      if (actor !== undefined && state.currentBidder !== actor) return state;
      if (action.type === "placeBid") return placeBid(state, action.amount);
      if (action.type === "pass") return pass(state);
      if (action.type === "claim") return claim(state);
      if (action.type === "selectChoice") return selectChoice(state, action.index);
      if (action.type === "shuffleLot") return shuffleLot(state);
      return reroll(state);
    }
    case "pickElim":
      return pickElim(state, action.id, actor);
    case "flushElimDraft":
      return flushElimDraft(state);
    case "timeoutElim":
      return timeoutElim(state, actor);
    case "startReveal":
      return startElimReveal(state, actor);
    case "finishElim":
      return finishElimination(state);
    case "pickBox":
      return pickBox(state, action.index, actor);
    case "advance":
      return advance(state, actor);
    case "rematch":
      return rematch(state, actor);
    case "cancelRematch":
      return cancelRematch(state, actor);
    case "chat":
      return postChat(state, action.text, actor);
    case "setElimEra":
      return setElimEra(state, action.era, actor);
    case "readyElim":
      return readyElim(state, actor);
    default:
      return state;
  }
}

const CHAT_MAX = 40;
const CHAT_CHARS = 120;

export function postChat(state: GameState, text: string, actor?: Seat): GameState {
  if (state.phase === "setup") return state;
  const seat: Seat = actor === 0 || actor === 1 ? actor : state.currentBidder;
  const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_CHARS);
  if (!clean) return state;
  const line: ChatLine = { seat, text: clean, at: Date.now() };
  const chat = [...(state.chat ?? []), line].slice(-CHAT_MAX);
  return { ...state, chat };
}

export { startElimination };
export type { GameKind, ElimState };
