import { clampAvatar, type AvatarId } from "./avatars";
import {
  ELIM_BUDGET,
  ELIM_SLOTS,
  buildSeason,
  isElimSlot,
  randomWeek,
  randomYear,
  isElimEra,
  slotPos,
  unusedWeek,
  weekCount,
  playableWeeks,
  type ElimEra,
  type ElimPlayer,
  type ElimPos,
  type ElimSlot,
  type ElimYear,
} from "./elim-data";
import { emptyRoster, type Phase, type Seat } from "./types";
import type { AuctionCarry, GameState } from "./engine";

export type GameKind = "auction" | "elimination";

export const ELIM_WINS_NEEDED = 3;
export const ELIM_MAX_SETS = 5;

export type ElimPick = {
  slot: ElimSlot;
  pos: ElimPos;
  player: ElimPlayer;
  seat: Seat;
};

export type ElimSet = {
  week: number;
  scores: [number, number];
  winner: Seat | null;
};

export type ElimState = {
  year: number;
  week: number;
  round: number;
  taken: string[];
  picks: [ElimPick[], ElimPick[]];
  board: ElimPlayer[];
  revealAt: number | null;
  weekWins: [number, number];
  playedWeeks: number[];
  lastSet: ElimSet | null;
  sets: ElimSet[];
  firstPicker: Seat;
  order: ElimSlot[];
  weekReady: [boolean, boolean];
  lastPickId: string | null;
  pickHoldUntil: number | null;
  pickClockUntil: number | null;
  pending: { round: number; bidder: Seat } | null;
  solo?: boolean;
  seasonPool?: Record<ElimPos, ElimPlayer[]>;
};

export function elimSeason(elim: ElimState): Record<ElimPos, ElimPlayer[]> {
  if (elim.seasonPool) return elim.seasonPool;
  return buildSeason(elim.year as ElimYear);
}

export function emptyElimPicks(): [ElimPick[], ElimPick[]] {
  return [[], []];
}

export function pickerForRound(round: number, first: Seat = 0): Seat {
  const even = round % 2 === 0;
  if (even) return first;
  return first === 0 ? 1 : 0;
}

export function shuffleElimOrder(): ElimSlot[] {
  const order: ElimSlot[] = [...ELIM_SLOTS];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = order[i]!;
    order[i] = order[j]!;
    order[j] = a;
  }
  return order;
}

export function elimLineup(elim: Pick<ElimState, "order"> | ElimState): ElimSlot[] {
  const order = "order" in elim ? elim.order : undefined;
  if (
    Array.isArray(order) &&
    order.length === ELIM_SLOTS.length &&
    new Set(order).size === ELIM_SLOTS.length &&
    order.every((slot) => isElimSlot(slot))
  ) {
    return order;
  }
  return [...ELIM_SLOTS];
}

export function elimDisplay(): ElimSlot[] {
  return [...ELIM_SLOTS];
}

export function pickAt(picks: ElimPick[], slot: ElimSlot): ElimPick | undefined {
  return picks.find((row) => row.slot === slot);
}

export function elimWeekReady(elim: ElimState): [boolean, boolean] {
  return [Boolean(elim.weekReady?.[0]), Boolean(elim.weekReady?.[1])];
}

export function remainingAfter(round: number): number {
  return Math.max(0, ELIM_SLOTS.length - round - 1);
}

/** Only one name costs $1, so leave $2 per empty slot after this pick. */
export function remainingReserve(round: number): number {
  return 2 * remainingAfter(round);
}

/**
 * Cheapest leftover names this seat still has to buy after the current pick,
 * assuming the other GM takes the cheaper ones first (shared RB/WR boards).
 */
export function remainingMinCost(elim: ElimState, seat: Seat): number {
  if (elim.solo) return remainingAfter(elim.round);
  const lineup = elimLineup(elim);
  const other: Seat = seat === 0 ? 1 : 0;
  const myNeed: Partial<Record<ElimPos, number>> = {};
  const theirNeed: Partial<Record<ElimPos, number>> = {};
  for (let i = 0; i < lineup.length; i += 1) {
    const slot = lineup[i]!;
    const pos = slotPos(slot);
    if (i < elim.round) continue;
    if (i === elim.round) {
      if (!pickAt(elim.picks[other], slot)) theirNeed[pos] = (theirNeed[pos] ?? 0) + 1;
      continue;
    }
    if (!pickAt(elim.picks[seat], slot)) myNeed[pos] = (myNeed[pos] ?? 0) + 1;
    if (!pickAt(elim.picks[other], slot)) theirNeed[pos] = (theirNeed[pos] ?? 0) + 1;
  }
  const season = elimSeason(elim);
  let sum = 0;
  for (const pos of Object.keys(season) as ElimPos[]) {
    const n = myNeed[pos] ?? 0;
    if (!n) continue;
    const skip = theirNeed[pos] ?? 0;
    const pool = season[pos]
      .filter((row) => !elim.taken.includes(row.id))
      .sort((a, b) => a.cost - b.cost);
    if (!pool.length) continue;
    const start = Math.min(skip, Math.max(0, pool.length - n));
    sum += pool.slice(start, start + n).reduce((n, row) => n + row.cost, 0);
  }
  return sum;
}

export function maxElimCost(elim: ElimState, cash: number, seat: Seat): number {
  return Math.max(0, cash - remainingMinCost(elim, seat));
}

export function availableElim(elim: ElimState): ElimPlayer[] {
  return elim.board.filter((row) => !elim.taken.includes(row.id));
}

export function legalElimPicks(elim: ElimState, cash: number, seat: Seat): ElimPlayer[] {
  const cap = maxElimCost(elim, cash, seat);
  const avail = availableElim(elim).filter((row) => row.cost <= cash && !row.blocked);
  const under = avail.filter((row) => row.cost <= cap);
  if (under.length) return under;
  const leftover = [...availableElim(elim)].filter((row) => !row.blocked).sort((a, b) => a.cost - b.cost)[0];
  return leftover ? [leftover] : [];
}

export function isByeWeek(player: ElimPlayer, week: number): boolean {
  return Boolean(player.bye) && player.bye === week;
}

export function replacementWeek(year: number, week: number): number {
  const weeks = playableWeeks(year);
  const i = weeks.indexOf(week);
  if (i >= 0) return weeks[(i + 1) % weeks.length]!;
  const later = weeks.find((w) => w > week);
  return later ?? weeks[0]!;
}

export function scoredWeek(player: ElimPlayer, week: number, year: number): number {
  const index = isByeWeek(player, week) ? replacementWeek(year, week) - 1 : week - 1;
  return player.weeks[index] ?? 0;
}

export function elimTotals(elim: ElimState, week = elim.week): [number, number] {
  const sum = (picks: ElimPick[]) =>
    picks.reduce((n, pick) => n + scoredWeek(pick.player, week, elim.year), 0);
  return [round1(sum(elim.picks[0])), round1(sum(elim.picks[1]))];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function elimWinner(elim: ElimState, cash: [number, number], week = elim.week): Seat | null {
  const [a, b] = elimTotals(elim, week);
  if (a > b) return 0;
  if (b > a) return 1;
  if (cash[0] > cash[1]) return 0;
  if (cash[1] > cash[0]) return 1;
  return null;
}

export function elimSeriesWinner(elim: ElimState): Seat | null {
  const wins = elim.weekWins ?? [0, 0];
  if (wins[0] > wins[1]) return 0;
  if (wins[1] > wins[0]) return 1;
  return null;
}

export function elimSeriesOver(elim: ElimState): boolean {
  const wins = elim.weekWins ?? [0, 0];
  if (wins[0] >= ELIM_WINS_NEEDED || wins[1] >= ELIM_WINS_NEEDED) return true;
  return (elim.playedWeeks?.length ?? 0) >= ELIM_MAX_SETS;
}

export function elimSets(elim: ElimState): ElimSet[] {
  if (elim.sets?.length) return elim.sets;
  return elim.lastSet ? [elim.lastSet] : [];
}

/** Best single week in the match — this is the official elimination high. */
export function elimBestWeeks(elim: ElimState): [number, number] {
  const weeks = elimWeekScores(elim);
  const best = (seat: Seat) => Math.round(Math.max(0, ...weeks.map((pair) => Number(pair[seat]) || 0)));
  return [best(0), best(1)];
}

/** Worst single week in the match — this is the official elimination low. */
export function elimWorstWeeks(elim: ElimState): [number, number] {
  const weeks = elimWeekScores(elim);
  const worst = (seat: Seat) =>
    Math.round(Math.min(...weeks.map((pair) => Number(pair[seat]) || 0)));
  return [worst(0), worst(1)];
}

function elimWeekScores(elim: ElimState): [number, number][] {
  const sets = elimSets(elim);
  const weeks = sets.length ? sets.map((set) => set.scores) : [elimTotals(elim)];
  return weeks.length ? weeks : [[0, 0]];
}

export const ELIM_PICK_HOLD_MS = 1500;
export const ELIM_PICK_CLOCK_MS = 60_000;

export function startElimination(
  name0: string,
  name1: string,
  carry?: AuctionCarry,
  locked?: { year: ElimYear; week: number; firstPicker?: Seat; order?: ElimSlot[]; era?: ElimEra },
): GameState {
  const era: ElimEra = locked?.era ?? carry?.elimEra ?? "modern";
  const year = locked?.year ?? randomYear(era);
  const week =
    locked?.week && playableWeeks(year).includes(locked.week) ? locked.week : randomWeek(year);
  const firstPicker: Seat = locked?.firstPicker === 0 || locked?.firstPicker === 1
    ? locked.firstPicker
    : Math.random() < 0.5
      ? 0
      : 1;
  const order = locked?.order ? elimLineup({ order: locked.order }) : shuffleElimOrder();
  const season = buildSeason(year);
  const opening = slotPos(order[0]!);
  const elim: ElimState = {
    year,
    week,
    round: 0,
    taken: [],
    picks: emptyElimPicks(),
    board: season[opening],
    revealAt: null,
    weekWins: [0, 0],
    playedWeeks: [],
    lastSet: null,
    sets: [],
    firstPicker,
    order,
    weekReady: [false, false],
    lastPickId: null,
    pickHoldUntil: null,
    pickClockUntil: Date.now() + ELIM_PICK_CLOCK_MS,
    pending: null,
  };
  return {
    phase: "draft" as Phase,
    kind: "elimination",
    names: [name0.trim() || "Home", name1.trim() || "Away"],
    cash: [ELIM_BUDGET, ELIM_BUDGET],
    rosters: [emptyRoster(), emptyRoster()],
    lots: [],
    lotIndex: 0,
    nominator: 0,
    currentBidder: pickerForRound(0, firstPicker),
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
    avatars: carry?.avatars ?? ["poor", "poor"],
    userIds: carry?.userIds ?? [null, null],
    rematchReady: [false, false],
    shuffleUsed: [false, false],
    rerollUsed: [false, false],
    series: carry?.series ?? [0, 0],
    nights: carry?.nights ?? 0,
    chat: carry?.chat ?? [],
    publicJoin: carry?.publicJoin ?? false,
    elim,
    elimEra: era,
    elimReady: [false, false],
  };
}

export function elimBriefing(
  name0: string,
  name1: string,
  carry?: AuctionCarry,
): GameState {
  return {
    phase: "lobby",
    kind: "elimination",
    names: [name0.trim() || "Home", name1.trim() || "Away"],
    cash: [ELIM_BUDGET, ELIM_BUDGET],
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
    avatars: carry?.avatars ?? ["poor", "poor"],
    userIds: carry?.userIds ?? [null, null],
    rematchReady: [false, false],
    shuffleUsed: [false, false],
    rerollUsed: [false, false],
    series: carry?.series ?? [0, 0],
    nights: carry?.nights ?? 0,
    chat: carry?.chat ?? [],
    publicJoin: carry?.publicJoin ?? false,
    elim: null,
    elimEra: carry?.elimEra ?? "modern",
    elimReady: [false, false],
  };
}

/** Both GMs are seated in the elimination briefing — leave the invite screen. */
export function elimStartOpen(
  state: Pick<GameState, "phase" | "kind" | "names">,
  filled = false,
): boolean {
  if (state.phase !== "lobby" || state.kind !== "elimination") return false;
  return filled || Boolean(state.names[1]?.trim());
}

export function setElimEra(state: GameState, era: ElimEra, actor?: Seat): GameState {
  if (state.kind !== "elimination" || state.phase !== "lobby") return state;
  if (!state.names[1]) return state;
  if (actor === 1) return state;
  if (!isElimEra(era) || era === (state.elimEra ?? "modern")) return state;
  return { ...state, elimEra: era };
}

export function readyElim(state: GameState, actor?: Seat): GameState {
  if (state.kind !== "elimination" || state.phase !== "lobby") return state;
  if (!state.names[0] || !state.names[1]) return state;
  const ready: [boolean, boolean] = [state.elimReady?.[0] ?? false, state.elimReady?.[1] ?? false];
  if (actor === 0 || actor === 1) {
    if (ready[actor]) return state;
    ready[actor] = true;
  } else {
    ready[0] = true;
    ready[1] = true;
  }
  if (!ready[0] || !ready[1]) return { ...state, elimReady: ready };
  return startElimination(state.names[0], state.names[1], {
    series: state.series ?? [0, 0],
    nights: state.nights ?? 0,
    avatars: (state.avatars ?? ["poor", "poor"]).map((id) => clampAvatar(id)) as [AvatarId, AvatarId],
    userIds: state.userIds ?? [null, null],
    elimEra: state.elimEra ?? "modern",
    chat: state.chat ?? [],
    publicJoin: state.publicJoin,
  });
}

export function pickHoldOpen(elim: ElimState, now = Date.now()): boolean {
  return Boolean(elim.pickHoldUntil && now < elim.pickHoldUntil);
}

export function pickClockLeft(elim: ElimState, now = Date.now()): number {
  if (pickHoldOpen(elim, now) || !elim.pickClockUntil) return 0;
  return Math.max(0, elim.pickClockUntil - now);
}

function armClock(now: number): number {
  return now + ELIM_PICK_CLOCK_MS;
}

export function pickElim(state: GameState, id: string, actor?: Seat, now = Date.now()): GameState {
  if (state.kind !== "elimination" || state.phase !== "draft" || !state.elim) return state;
  if (pickHoldOpen(state.elim, now)) return state;
  if (state.elim.pickHoldUntil) {
    state = flushElimDraft(state, now);
    if (state.kind !== "elimination" || state.phase !== "draft" || !state.elim) return state;
  }
  const elim = state.elim;
  const seat: Seat = actor === 0 || actor === 1 ? actor : state.currentBidder;
  if (seat !== state.currentBidder) return state;
  const player = elim.board.find((row) => row.id === id);
  if (!player) return state;
  if (elim.taken.includes(player.id)) return state;
  const lineup = elimLineup(elim);
  const slot = lineup[elim.round];
  if (!slot) return state;
  if (elim.picks[seat].some((pick) => pick.slot === slot)) return state;
  if (elim.picks[seat].some((pick) => pick.player.id === player.id)) return state;
  const legal = legalElimPicks(elim, state.cash[seat], seat);
  if (!legal.some((row) => row.id === player.id)) return state;
  const cash: [number, number] = [state.cash[0], state.cash[1]];
  const price = Math.min(player.cost, cash[seat]);
  cash[seat] -= price;
  const picks: [ElimPick[], ElimPick[]] = [[...elim.picks[0]], [...elim.picks[1]]];
  picks[seat] = [...picks[seat], { slot, pos: player.pos, player, seat }];
  const taken = [...elim.taken, player.id];
  const bothDone = elim.solo
    ? picks[seat].length > elim.round
    : picks[0].length > elim.round && picks[1].length > elim.round;
  const holdUntil = now + ELIM_PICK_HOLD_MS;

  if (!bothDone) {
    return {
      ...state,
      cash,
      currentBidder: seat === 0 ? 1 : 0,
      elim: {
        ...elim,
        taken,
        picks,
        lastPickId: player.id,
        pickHoldUntil: holdUntil,
        pickClockUntil: null,
        pending: null,
      },
    };
  }

  const nextRound = elim.round + 1;
  return {
    ...state,
    cash,
    elim: {
      ...elim,
      taken,
      picks,
      lastPickId: player.id,
      pickHoldUntil: holdUntil,
      pickClockUntil: null,
      pending: { round: nextRound, bidder: elim.solo ? 0 : pickerForRound(nextRound, elim.firstPicker ?? 0) },
    },
  };
}

export function flushElimDraft(state: GameState, now = Date.now()): GameState {
  if (state.kind !== "elimination" || state.phase !== "draft" || !state.elim) return state;
  const elim = state.elim;
  if (!elim.pickHoldUntil) return state;
  if (now < elim.pickHoldUntil) return state;
  if (!elim.pending) {
    return {
      ...state,
      elim: { ...elim, pickHoldUntil: null, lastPickId: null, pickClockUntil: armClock(now) },
    };
  }
  const nextRound = elim.pending.round;
  const lineup = elimLineup(elim);
  if (nextRound >= lineup.length) {
    return {
      ...state,
      currentBidder: 0,
      phase: "matchup",
      elim: {
        ...elim,
        round: nextRound,
        board: [],
        weekReady: [false, false],
        lastPickId: null,
        pickHoldUntil: null,
        pickClockUntil: null,
        pending: null,
      },
    };
  }
  const nextSlot = lineup[nextRound]!;
  const season = elimSeason(elim);
  return {
    ...state,
    currentBidder: elim.pending.bidder,
    elim: {
      ...elim,
      round: nextRound,
      board: season[slotPos(nextSlot)],
      lastPickId: null,
      pickHoldUntil: null,
      pickClockUntil: armClock(now),
      pending: null,
    },
  };
}

export function timeoutElim(
  state: GameState,
  _actor?: Seat,
  now = Date.now(),
  roll = Math.random(),
): GameState {
  if (state.kind !== "elimination" || state.phase !== "draft" || !state.elim) return state;
  if (pickHoldOpen(state.elim, now)) return state;
  if (state.elim.pickHoldUntil) {
    state = flushElimDraft(state, now);
    if (state.kind !== "elimination" || state.phase !== "draft" || !state.elim) return state;
  }
  const elim = state.elim;
  if (!elim.pickClockUntil || now < elim.pickClockUntil) return state;
  const seat: Seat = state.currentBidder;
  const legal = legalElimPicks(elim, state.cash[seat], seat);
  if (!legal.length) return state;
  const index = Math.min(legal.length - 1, Math.max(0, Math.floor(roll * legal.length)));
  const pick = legal[index]!;
  return pickElim(state, pick.id, seat, now);
}

export const ELIM_REVEAL_MS = 1500;
export const ELIM_REVEAL_STEPS = ELIM_SLOTS.length * 2;

export function elimRevealSteps(elim: ElimState): number {
  return elim.solo ? ELIM_SLOTS.length : ELIM_REVEAL_STEPS;
}

function revealSeats(elim: ElimState): Seat[] {
  return elim.solo ? [0] : [0, 1];
}

export function startElimReveal(state: GameState, actor?: Seat): GameState {
  if (state.kind !== "elimination" || state.phase !== "matchup" || !state.elim) return state;
  if (state.elim.revealAt) return { ...state, phase: "reveal" };
  if (state.elim.solo) {
    return {
      ...state,
      phase: "reveal",
      elim: { ...state.elim, weekReady: [true, true], revealAt: Date.now() },
    };
  }
  const ready = elimWeekReady(state.elim);
  if (actor === 0 || actor === 1) {
    if (ready[actor]) return state;
    ready[actor] = true;
  } else if (!ready[0]) {
    ready[0] = true;
  } else {
    ready[1] = true;
  }
  if (!ready[0] || !ready[1]) {
    return { ...state, elim: { ...state.elim, weekReady: ready } };
  }
  return {
    ...state,
    phase: "reveal",
    elim: { ...state.elim, weekReady: [false, false], revealAt: Date.now() },
  };
}

export function revealedCount(elim: ElimState, now = Date.now()): number {
  if (!elim.revealAt) return 0;
  const lineup = elimDisplay();
  const seats = revealSeats(elim);
  let shown = 0;
  let beats = 0;
  for (let i = 0; i < lineup.length; i++) {
    for (const s of seats) {
      const openAt = elim.revealAt + (shown + beats) * ELIM_REVEAL_MS;
      if (now < openAt) return shown;
      shown += 1;
      const pick = pickAt(elim.picks[s], lineup[i]!);
      if (pick && isByeWeek(pick.player, elim.week)) beats += 1;
    }
  }
  return shown;
}

/** Home, then away, down the lineup. Step 0 = Home QB. */
export function revealOpen(shown: number, posIndex: number, seat: Seat, solo = false): boolean {
  if (solo) return shown > posIndex;
  return shown > posIndex * 2 + seat;
}

function byeBeatsBefore(elim: ElimState, posIndex: number, seat: Seat): number {
  const lineup = elimDisplay();
  const seats = revealSeats(elim);
  const stop = elim.solo ? posIndex : posIndex * 2 + seat;
  let n = 0;
  let step = 0;
  for (let i = 0; i < lineup.length; i++) {
    for (const s of seats) {
      if (step >= stop) return n;
      const pick = pickAt(elim.picks[s], lineup[i]!);
      if (pick && isByeWeek(pick.player, elim.week)) n += 1;
      step += 1;
    }
  }
  return n;
}

function byeBeatsTotal(elim: ElimState): number {
  const lineup = elimDisplay();
  let n = 0;
  for (const slot of lineup) {
    for (const s of revealSeats(elim)) {
      const pick = pickAt(elim.picks[s], slot);
      if (pick && isByeWeek(pick.player, elim.week)) n += 1;
    }
  }
  return n;
}

export function revealOpenedAt(elim: ElimState, posIndex: number, seat: Seat): number {
  if (!elim.revealAt) return 0;
  const stride = elim.solo ? 1 : 2;
  const seatOff = elim.solo ? 0 : seat;
  return elim.revealAt + (posIndex * stride + seatOff + byeBeatsBefore(elim, posIndex, seat)) * ELIM_REVEAL_MS;
}

export function byeHasRolled(elim: ElimState, posIndex: number, seat: Seat, now = Date.now()): boolean {
  const slot = elimDisplay()[posIndex];
  const pick = slot ? pickAt(elim.picks[seat], slot) : undefined;
  if (!pick || !isByeWeek(pick.player, elim.week)) return true;
  if (!elim.revealAt) return false;
  return now >= revealOpenedAt(elim, posIndex, seat) + ELIM_REVEAL_MS;
}

export function elimRevealReady(elim: ElimState, now = Date.now()): boolean {
  if (!elim.revealAt) return false;
  if (revealedCount(elim, now) < elimRevealSteps(elim)) return false;
  return now - elim.revealAt >= (elimRevealSteps(elim) + byeBeatsTotal(elim)) * ELIM_REVEAL_MS;
}

export function finishElimination(state: GameState): GameState {
  if (state.kind !== "elimination" || !state.elim) return state;
  if (state.phase === "results") return state;
  if (state.phase !== "reveal") return state;
  if (!elimRevealReady(state.elim)) return state;

  const scores = elimTotals(state.elim);
  const winner = elimWinner(state.elim, state.cash);
  const weekWins: [number, number] = [state.elim.weekWins?.[0] ?? 0, state.elim.weekWins?.[1] ?? 0];
  if (winner === 0) weekWins[0] += 1;
  else if (winner === 1) weekWins[1] += 1;
  const playedWeeks = state.elim.playedWeeks?.includes(state.elim.week)
    ? [...(state.elim.playedWeeks ?? [])]
    : [...(state.elim.playedWeeks ?? []), state.elim.week];
  const lastSet: ElimSet = { week: state.elim.week, scores, winner };
  const sets = [...elimSets(state.elim), lastSet];
  const nextElim: ElimState = {
    ...state.elim,
    weekWins,
    playedWeeks,
    lastSet,
    sets,
    revealAt: null,
  };

  if (state.elim.solo || elimSeriesOver(nextElim)) {
    const seriesWinner = elimSeriesWinner(nextElim);
    const series: [number, number] = [state.series?.[0] ?? 0, state.series?.[1] ?? 0];
    if (seriesWinner === 0) series[0] += 1;
    else if (seriesWinner === 1) series[1] += 1;
    return {
      ...state,
      phase: "results",
      series,
      nights: (state.nights ?? 0) + 1,
      rematchReady: [false, false],
      elim: nextElim,
    };
  }

  return {
    ...state,
    phase: "matchup",
    currentBidder: 0,
    elim: {
      ...nextElim,
      week: unusedWeek(state.elim.year, playedWeeks),
      weekReady: [false, false],
    },
  };
}

export function rematchElimination(state: GameState, actor?: Seat): GameState {
  if (state.phase !== "results" || state.kind !== "elimination") return state;
  const ready: [boolean, boolean] = [
    state.rematchReady?.[0] ?? false,
    state.rematchReady?.[1] ?? false,
  ];
  if (actor === 0 || actor === 1) ready[actor] = true;
  else {
    ready[0] = true;
    ready[1] = true;
  }
  if (!ready[0] || !ready[1]) return { ...state, rematchReady: ready };
  return {
    ...elimBriefing(state.names[0], state.names[1], {
      series: state.series ?? [0, 0],
      nights: state.nights ?? 0,
      avatars: (state.avatars ?? ["poor", "poor"]).map((id) => clampAvatar(id)) as [AvatarId, AvatarId],
      userIds: state.userIds ?? [null, null],
      elimEra: state.elimEra ?? "modern",
      chat: state.chat ?? [],
      publicJoin: state.publicJoin,
    }),
  };
}