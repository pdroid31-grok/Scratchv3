import { nightWinner, rosterTotal } from "./auction";
import { elimBestWeeks, elimSeriesWinner, elimWorstWeeks } from "./elim";
import { clampAvatar, type AvatarId } from "./avatars";
import type { GameState } from "./engine";
import type { Seat } from "./types";

export type HostedMatchView = {
  kind: "auction" | "elimination";
  winner: Seat | null;
  scores: [number, number];
  lows: [number, number];
  series: [number, number];
  nights: number;
  names: [string, string];
  avatars: [AvatarId, AvatarId];
  userIds: [string | null, string | null];
};

export function hostedMatchView(state: GameState): HostedMatchView | null {
  if (state.phase !== "results") return null;
  const isElim = state.kind === "elimination" && Boolean(state.elim);
  const scores: [number, number] =
    isElim && state.elim ? elimBestWeeks(state.elim) : auctionMatchScores(state);
  const lows: [number, number] =
    isElim && state.elim ? elimWorstWeeks(state.elim) : scores;
  const winner =
    isElim && state.elim
      ? elimSeriesWinner(state.elim)
      : nightWinner(state.rosters, state.bonus ?? [0, 0], state.cash);
  return {
    kind: isElim ? "elimination" : "auction",
    winner,
    scores,
    lows,
    series: matchSeries(state, winner),
    nights: state.nights ?? 0,
    names: state.names,
    avatars: [
      clampAvatar(state.avatars?.[0] ?? "poor"),
      clampAvatar(state.avatars?.[1] ?? "poor"),
    ],
    userIds: state.userIds ?? [null, null],
  };
}

export function matchSeries(state: GameState, winner: Seat | null): [number, number] {
  if (state.kind === "elimination" && state.elim) {
    const wins = state.elim.weekWins ?? [0, 0];
    return [Number(wins[0]) || 0, Number(wins[1]) || 0];
  }
  if (winner === 0) return [1, 0];
  if (winner === 1) return [0, 1];
  return [0, 0];
}

export function historyLineScore(
  kind: "auction" | "elimination",
  winner: Seat | null,
  score0: number,
  score1: number,
  series0: number | null,
  series1: number | null,
): [number, number] {
  if (kind === "auction") return [score0, score1];
  if (series0 != null && series1 != null) return [series0, series1];
  if (score0 <= 5 && score1 <= 5 && score0 + score1 > 0) return [score0, score1];
  if (winner === 0) return [1, 0];
  if (winner === 1) return [0, 1];
  return [0, 0];
}

function auctionMatchScores(state: GameState): [number, number] {
  return [
    rosterTotal(state.rosters[0], state.bonus?.[0] ?? 0),
    rosterTotal(state.rosters[1], state.bonus?.[1] ?? 0),
  ];
}
