import { BUSTS, PLAYERS } from "./players";
import {
  BUST_CHANCE,
  MIN_BID,
  PAIR_COUNTS,
  REROLL_COST,
  SLOTS,
  type AuctionLot,
  type LotChoice,
  type Player,
  type Position,
  type Roster,
  type Seat,
  type Slot,
} from "./types";

export function fisherYates<T>(items: readonly T[]): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
  }
  return next;
}

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function playerAt(lot: AuctionLot, choice: LotChoice): Player {
  return choice === 1 ? lot.other : lot.player;
}

export function lotIds(lots: AuctionLot[]): string[] {
  const ids: string[] = [];
  for (const lot of lots) ids.push(lot.player.id, lot.other.id);
  return ids;
}

export function emptyCount(roster: Roster): number {
  return SLOTS.reduce((n, slot) => n + (roster[slot] ? 0 : 1), 0);
}

function openSlotCount(roster: Roster, pos: Position): number {
  if (pos === "QB") return roster.QB ? 0 : 1;
  if (pos === "TE") return roster.TE ? 0 : 1;
  if (pos === "RB") return (roster.RB1 ? 0 : 1) + (roster.RB2 ? 0 : 1);
  return (roster.WR1 ? 0 : 1) + (roster.WR2 ? 0 : 1);
}

function slotFor(roster: Roster, pos: Position): Slot | null {
  if (pos === "QB") return roster.QB ? null : "QB";
  if (pos === "TE") return roster.TE ? null : "TE";
  if (pos === "RB") {
    if (!roster.RB1) return "RB1";
    if (!roster.RB2) return "RB2";
    return null;
  }
  if (!roster.WR1) return "WR1";
  if (!roster.WR2) return "WR2";
  return null;
}

export function fillRoster(roster: Roster, lot: AuctionLot): Roster {
  const slot = slotFor(roster, lot.slot);
  if (!slot) return roster;
  return { ...roster, [slot]: lot };
}

export function maxBid(cash: number, roster: Roster, slot: Position): number {
  if (openSlotCount(roster, slot) === 0) return 0;
  const empty = emptyCount(roster);
  return Math.max(0, cash - (empty - 1));
}

export function isEligible(cash: number, roster: Roster, slot: Position): boolean {
  return maxBid(cash, roster, slot) >= MIN_BID;
}

export function canAffordReroll(cash: number, roster: Roster, free = false): boolean {
  return cash >= emptyCount(roster) + (free ? 0 : REROLL_COST);
}

export function canPickLot(state: { phase: string; currentBid: number }): boolean {
  if (state.phase === "unopposed") return true;
  return state.phase === "bidding" && state.currentBid === 0;
}

function usedIds(lots: AuctionLot[]): Set<string> {
  const used = new Set<string>();
  for (const lot of lots) {
    used.add(lot.player.id);
    used.add(lot.other.id);
  }
  return used;
}

export function replacementFor(lots: AuctionLot[], index: number): Player | null {
  const lot = lots[index];
  if (!lot) return null;
  const used = usedIds(lots);
  const pool = PLAYERS.filter((p) => p.position === lot.slot && !used.has(p.id));
  const busts = BUSTS.filter((p) => p.position === lot.slot && !used.has(p.id));
  if (pool.length === 0 && busts.length === 0) return null;
  if (busts.length > 0 && Math.random() < BUST_CHANCE) {
    return busts[Math.floor(Math.random() * busts.length)]!;
  }
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!;
  return busts[Math.floor(Math.random() * busts.length)] ?? null;
}

/** Two fresh names at the same position, excluding the current pair. */
export function shufflePair(lots: AuctionLot[], index: number): [Player, Player] | null {
  const lot = lots[index];
  if (!lot) return null;
  const used = usedIds(lots);
  const pool = PLAYERS.filter((p) => p.position === lot.slot && !used.has(p.id));
  if (pool.length < 2) return null;
  const picked = fisherYates(pool);
  const a = picked[0];
  const b = picked[1];
  if (!a || !b) return null;
  return [a, b];
}

export function applyReroll(
  lots: AuctionLot[],
  index: number,
  player: Player,
  choice: LotChoice = 0,
): AuctionLot[] {
  return lots.map((lot, i) => {
    if (i !== index) return lot;
    if (choice === 1) return { ...lot, other: player };
    return { ...lot, player };
  });
}

/** One name from each rating band so every listed player can actually land on the board. */
export function pickSpread(pool: Player[], n: number): Player[] {
  if (n <= 0) return [];
  const sorted = [...pool].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  if (sorted.length <= n) return fisherYates(sorted);
  const chosen: Player[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * sorted.length) / n);
    const end = Math.max(start + 1, Math.floor(((i + 1) * sorted.length) / n));
    const band = sorted.slice(start, end).filter((player) => !taken.has(player.id));
    const pick =
      band.length > 0
        ? band[Math.floor(Math.random() * band.length)]
        : sorted.find((player) => !taken.has(player.id));
    if (!pick) break;
    taken.add(pick.id);
    chosen.push(pick);
  }
  return fisherYates(chosen);
}

export function buildLots(avoid: Iterable<string> = []): AuctionLot[] {
  const blocked = new Set(avoid);
  const lots: AuctionLot[] = [];
  const used = new Set<string>();
  const positions: Position[] = ["QB", "RB", "WR", "TE"];
  for (const pos of positions) {
    const pairCount = PAIR_COUNTS[pos];
    const pool = PLAYERS.filter((p) => p.position === pos);
    let open = pool.filter((p) => !used.has(p.id) && !blocked.has(p.id));
    if (open.length < pairCount * 2) {
      open = pool.filter((p) => !used.has(p.id));
    }
    const picked = pickSpread(open, pairCount * 2);
    for (const player of picked) used.add(player.id);
    const shuffled = fisherYates(picked);
    for (let i = 0; i < pairCount; i++) {
      const a = shuffled[i * 2];
      const b = shuffled[i * 2 + 1];
      if (!a || !b) continue;
      const flip = Math.random() < 0.5;
      lots.push({
        player: flip ? b : a,
        other: flip ? a : b,
        slot: pos,
      });
    }
  }
  return fisherYates(lots);
}

export function rosterTotal(roster: Roster, bonus = 0): number {
  return SLOTS.reduce((sum, slot) => sum + (roster[slot]?.player.rating ?? 0), 0) + bonus;
}

export const AUCTION_REVEAL_MS = 1500;
export const AUCTION_REVEAL_STEPS = SLOTS.length * 2;

export function hasOverallBonus(bonus: [number, number]): boolean {
  return bonus[0] !== 0 || bonus[1] !== 0;
}

/** After the last rating: bonus lands, then the winner is named. */
export function auctionExtraSteps(bonus: [number, number]): number {
  return hasOverallBonus(bonus) ? 2 : 0;
}

export function auctionShown(startedAt: number, now = Date.now(), extra = 0): number {
  if (!startedAt) return 0;
  return Math.min(AUCTION_REVEAL_STEPS + extra, Math.floor((now - startedAt) / AUCTION_REVEAL_MS) + 1);
}

export function auctionBonusOpen(shown: number, bonus: [number, number]): boolean {
  return hasOverallBonus(bonus) && shown > AUCTION_REVEAL_STEPS;
}

export function auctionRevealDone(shown: number, bonus: [number, number]): boolean {
  return shown >= AUCTION_REVEAL_STEPS + auctionExtraSteps(bonus);
}

export function auctionCellOpen(shown: number, posIndex: number, seat: Seat): boolean {
  return shown > posIndex * 2 + seat;
}

export function auctionRunning(rosters: [Roster, Roster], shown: number): [number, number] {
  const sum = (seat: Seat) =>
    SLOTS.reduce((n, slot, i) => {
      if (!auctionCellOpen(shown, i, seat)) return n;
      return n + (rosters[seat][slot]?.player.rating ?? 0);
    }, 0);
  return [sum(0), sum(1)];
}

export function nightWinner(
  rosters: [Roster, Roster],
  bonus: [number, number],
  cash: [number, number],
): Seat | null {
  const t0 = rosterTotal(rosters[0], bonus[0]);
  const t1 = rosterTotal(rosters[1], bonus[1]);
  if (t0 > t1) return 0;
  if (t1 > t0) return 1;
  if (cash[0] > cash[1]) return 0;
  if (cash[1] > cash[0]) return 1;
  return null;
}

export function stealScore(lot: AuctionLot, price: number): number {
  return lot.player.rating / Math.max(1, price);
}

export function gradeForTotal(total: number): { letter: string; label: string } {
  if (total >= 552) return { letter: "S", label: "Dynasty" };
  if (total >= 540) return { letter: "A+", label: "Contender" };
  if (total >= 528) return { letter: "A", label: "Playoff lock" };
  if (total >= 516) return { letter: "B+", label: "Dangerous" };
  if (total >= 504) return { letter: "B", label: "Solid" };
  if (total >= 492) return { letter: "C+", label: "Bubble" };
  if (total >= 480) return { letter: "C", label: "Floor" };
  return { letter: "D", label: "Short" };
}

/** Upgrade if the replacement grades higher. Ratings stay dark in the UI. */
export type RerollCinematicKind = "upgrade" | "bust";

export function rerollCinematicKind(before: number, after: number): RerollCinematicKind | null {
  if (after > before) return "upgrade";
  if (after < before) return "bust";
  return null;
}

const LIVE_PHASES = new Set(["bidding", "unopposed", "sold"]);
/** Fresh-enough window when hydrating or waking a backgrounded phone. */
export const FX_TTL_MS = 15_000;

export type RerollFxSlice = {
  seq: number;
  before: number;
  after: number;
  at?: number;
} | null | undefined;

type FxSlice = {
  phase: string;
  rerollFx: RerollFxSlice;
  discards?: Array<{ player: { rating: number }; kept: { rating: number } }>;
};

/**
 * Consume a seq bump on this client. Live sessions play any new seq so a
 * missed poll still fires; hydrate/wake-from-hidden pass requireFresh.
 */
export function consumeRerollFx(
  playedSeq: number,
  fx: RerollFxSlice,
  now = Date.now(),
  requireFresh = false,
): { kind: RerollCinematicKind | null; seq: number } {
  if (!fx) return { kind: null, seq: playedSeq };
  const seq = Number(fx.seq) || 0;
  if (seq <= playedSeq) return { kind: null, seq: playedSeq };
  const kind = rerollCinematicKind(Number(fx.before), Number(fx.after));
  if (!kind) return { kind: null, seq };
  if (requireFresh) {
    if (typeof fx.at !== "number" || now - fx.at > FX_TTL_MS) return { kind: null, seq };
  }
  return { kind, seq };
}

/**
 * Decide whether a state transition should play reroll FX.
 * Used on every client (host optimistic apply AND joiner poll) so both phones fire.
 */
export function cinematicFromTransition(
  prev: FxSlice,
  next: FxSlice,
  now = Date.now(),
): RerollCinematicKind | null {
  const wasLive = LIVE_PHASES.has(prev.phase);
  const prevSeq = prev.rerollFx?.seq ?? 0;
  const fx = next.rerollFx;
  if (fx && fx.seq > prevSeq) {
    const decided = consumeRerollFx(prevSeq, fx, now, !wasLive);
    if (decided.kind) return decided.kind;
  }
  const prevLen = prev.discards?.length ?? 0;
  const nextLen = next.discards?.length ?? 0;
  if (wasLive && nextLen > prevLen) {
    const discard = next.discards?.[nextLen - 1];
    if (discard) return rerollCinematicKind(discard.player.rating, discard.kept.rating);
  }
  return null;
}
