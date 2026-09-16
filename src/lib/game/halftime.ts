import { fisherYates } from "./auction";
import type { Seat } from "./types";

export type PrizeKind = "cash" | "nothing" | "reroll" | "points" | "sealed";

export interface Prize {
  kind: PrizeKind;
  amount: number;
}

export interface HalftimeState {
  boxes: [Prize[], Prize[]];
  picks: [number | null, number | null];
  applied: boolean;
  ready: [boolean, boolean];
}

export const HALFTIME_AFTER = 6;
export const BOXES_EACH = 4;
export const LOAN_PENALTY = 10;

/** Weighted bag. Nothing is listed five times so empty boxes are common. */
export const HALFTIME_BAG: Prize[] = [
  { kind: "cash", amount: 1 },
  { kind: "cash", amount: 2 },
  { kind: "cash", amount: 3 },
  { kind: "cash", amount: 5 },
  { kind: "cash", amount: -1 },
  { kind: "cash", amount: -2 },
  { kind: "cash", amount: -3 },
  { kind: "nothing", amount: 0 },
  { kind: "nothing", amount: 0 },
  { kind: "nothing", amount: 0 },
  { kind: "nothing", amount: 0 },
  { kind: "nothing", amount: 0 },
  { kind: "reroll", amount: 1 },
  { kind: "points", amount: 3 },
  { kind: "points", amount: 5 },
  { kind: "points", amount: -1 },
  { kind: "points", amount: -3 },
];

export function prizeKey(prize: Prize): string {
  return `${prize.kind}:${prize.amount}`;
}

export function bagLegend(): { prize: Prize; count: number }[] {
  const seen: { prize: Prize; count: number }[] = [];
  for (const prize of HALFTIME_BAG) {
    const last = seen[seen.length - 1];
    if (last && prizeKey(last.prize) === prizeKey(prize)) {
      last.count += 1;
      continue;
    }
    seen.push({ prize, count: 1 });
  }
  return seen;
}

export function sealedPrize(): Prize {
  return { kind: "sealed", amount: 0 };
}

export function isSealed(prize: Prize | null | undefined): boolean {
  return !prize || prize.kind === "sealed";
}

export function sealedHalftime(): HalftimeState {
  const row = (): Prize[] => [sealedPrize(), sealedPrize(), sealedPrize(), sealedPrize()];
  return { boxes: [row(), row()], picks: [null, null], applied: false, ready: [false, false] };
}

export function hasHalftimeBoxes(ht: HalftimeState | null | undefined): ht is HalftimeState {
  return Boolean(
    ht &&
      Array.isArray(ht.boxes) &&
      Array.isArray(ht.boxes[0]) &&
      ht.boxes[0].length === BOXES_EACH &&
      Array.isArray(ht.boxes[1]) &&
      ht.boxes[1].length === BOXES_EACH,
  );
}

/** Hide every slip until both GMs have picked so nobody peeks early. */
export function redactHalftime<T extends { halftime: HalftimeState | null }>(state: T): T {
  const ht = state.halftime;
  if (!ht || ht.applied || !hasHalftimeBoxes(ht)) return state;
  const hide = (row: Prize[]): Prize[] => row.map(() => sealedPrize());
  return {
    ...state,
    halftime: {
      ...ht,
      boxes: [hide(ht.boxes[0]), hide(ht.boxes[1])],
    },
  };
}

export function dealHalftime(): HalftimeState {
  const dealt = fisherYates(HALFTIME_BAG).slice(0, BOXES_EACH * 2);
  return {
    boxes: [dealt.slice(0, BOXES_EACH), dealt.slice(BOXES_EACH, BOXES_EACH * 2)],
    picks: [null, null],
    applied: false,
    ready: [false, false],
  };
}

export function prizeLabel(prize: Prize): string {
  if (prize.kind === "sealed") return "Sealed";
  if (prize.kind === "nothing") return "Empty";
  if (prize.kind === "reroll") return "Free reroll";
  if (prize.kind === "cash") {
    return prize.amount > 0 ? `+$${prize.amount}` : `-$${Math.abs(prize.amount)}`;
  }
  return prize.amount > 0 ? `+${prize.amount} overall` : `${prize.amount} overall`;
}

export function prizeShort(prize: Prize): string {
  if (prize.kind === "sealed") return "?";
  if (prize.kind === "nothing") return "Empty";
  if (prize.kind === "reroll") return "Reroll";
  if (prize.kind === "cash") {
    return prize.amount > 0 ? `+$${prize.amount}` : `-$${Math.abs(prize.amount)}`;
  }
  return prize.amount > 0 ? `+${prize.amount} pts` : `${prize.amount} pts`;
}

export function prizeTone(prize: Prize): "good" | "bad" | "muted" | "accent" {
  if (prize.kind === "reroll") return "accent";
  if (prize.kind === "nothing" || prize.kind === "sealed") return "muted";
  if (prize.amount > 0) return "good";
  if (prize.amount < 0) return "bad";
  return "muted";
}

export function applyPrize(
  cash: number,
  bonus: number,
  freeRerolls: number,
  prize: Prize,
): { cash: number; bonus: number; freeRerolls: number } {
  if (prize.kind === "cash") {
    return { cash: Math.max(0, cash + prize.amount), bonus, freeRerolls };
  }
  if (prize.kind === "points") {
    return { cash, bonus: bonus + prize.amount, freeRerolls };
  }
  if (prize.kind === "reroll") {
    return { cash, bonus, freeRerolls: freeRerolls + 1 };
  }
  return { cash, bonus, freeRerolls };
}

export function pickedPrize(halftime: HalftimeState, seat: Seat): Prize | null {
  const pick = halftime.picks[seat];
  if (pick === null) return null;
  const prize = halftime.boxes[seat]?.[pick];
  if (!prize || prize.kind === "sealed") return null;
  return prize;
}
