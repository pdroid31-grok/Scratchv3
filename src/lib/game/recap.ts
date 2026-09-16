import { gradeForTotal, nightWinner, rosterTotal } from "./auction";
import { avatarById, clampAvatar, type AvatarId } from "./avatars";
import { elimDisplay, elimSeriesWinner, pickAt, type ElimState } from "./elim";
import { SLOTS, SLOT_SHORT, type Roster, type Seat } from "./types";
import type { GameState } from "./engine";

export type RecapLine = {
  slot: string;
  name: string;
  team: string;
  pts: number;
};

export type Recap = {
  v: 1;
  kind: "auction" | "elimination";
  names: [string, string];
  avatars: [AvatarId, AvatarId];
  winner: Seat | null;
  scores: [number, number];
  year?: number;
  weekWins?: [number, number];
  lines: [RecapLine[], RecapLine[]];
};

type WireLine = { p: string; n: string; t: string; x: number };
type Wire = {
  v: 1;
  k: "a" | "e";
  n: [string, string];
  a: [string, string];
  w: 0 | 1 | 2;
  s: [number, number];
  y?: number;
  ww?: [number, number];
  l: [WireLine[], WireLine[]];
};

function clip(value: string, max: number): string {
  return value.trim().slice(0, max) || "GM";
}

function linesFromRoster(roster: Roster): RecapLine[] {
  return SLOTS.map((slot) => {
    const lot = roster[slot];
    return {
      slot: SLOT_SHORT[slot],
      name: lot?.player.name ?? "—",
      team: lot?.player.team ?? "",
      pts: lot?.player.rating ?? 0,
    };
  });
}

function linesFromElim(elim: ElimState, seat: Seat): RecapLine[] {
  return elimDisplay().map((slot) => {
    const pick = pickAt(elim.picks[seat], slot);
    return {
      slot,
      name: pick?.player.name ?? "—",
      team: pick?.player.team ?? "",
      pts: pick?.player.cost ?? 0,
    };
  });
}

export function recapFromState(state: Pick<GameState, "kind" | "names" | "avatars" | "rosters" | "bonus" | "cash" | "elim">): Recap | null {
  const names: [string, string] = [clip(state.names[0] || "Home", 16), clip(state.names[1] || "Away", 16)];
  const avatars: [AvatarId, AvatarId] = [
    clampAvatar(state.avatars?.[0] ?? "poor"),
    clampAvatar(state.avatars?.[1] ?? "poor"),
  ];
  if (state.kind === "elimination" && state.elim) {
    const winner = elimSeriesWinner(state.elim);
    const weekWins: [number, number] = [state.elim.weekWins?.[0] ?? 0, state.elim.weekWins?.[1] ?? 0];
    return {
      v: 1,
      kind: "elimination",
      names,
      avatars,
      winner,
      scores: weekWins,
      year: state.elim.year,
      weekWins,
      lines: [linesFromElim(state.elim, 0), linesFromElim(state.elim, 1)],
    };
  }
  if (state.kind === "elimination") return null;
  const scores: [number, number] = [
    rosterTotal(state.rosters[0], state.bonus?.[0] ?? 0),
    rosterTotal(state.rosters[1], state.bonus?.[1] ?? 0),
  ];
  return {
    v: 1,
    kind: "auction",
    names,
    avatars,
    winner: nightWinner(state.rosters, state.bonus ?? [0, 0], state.cash),
    scores,
    lines: [linesFromRoster(state.rosters[0]), linesFromRoster(state.rosters[1])],
  };
}

function toWire(recap: Recap): Wire {
  const pack = (rows: RecapLine[]): WireLine[] =>
    rows.map((row) => ({ p: row.slot, n: clip(row.name, 24), t: row.team.slice(0, 3), x: row.pts }));
  return {
    v: 1,
    k: recap.kind === "elimination" ? "e" : "a",
    n: recap.names,
    a: recap.avatars,
    w: recap.winner === 0 ? 0 : recap.winner === 1 ? 1 : 2,
    s: recap.scores,
    ...(recap.year ? { y: recap.year } : {}),
    ...(recap.weekWins ? { ww: recap.weekWins } : {}),
    l: [pack(recap.lines[0]), pack(recap.lines[1])],
  };
}

function fromWire(raw: Wire): Recap | null {
  if (!raw || raw.v !== 1) return null;
  if (raw.k !== "a" && raw.k !== "e") return null;
  if (!Array.isArray(raw.n) || raw.n.length < 2) return null;
  const unpack = (rows: WireLine[] | undefined): RecapLine[] =>
    Array.isArray(rows)
      ? rows.map((row) => ({
          slot: String(row.p ?? ""),
          name: String(row.n ?? "—"),
          team: String(row.t ?? ""),
          pts: Number(row.x) || 0,
        }))
      : [];
  const winner: Seat | null = raw.w === 0 || raw.w === 1 ? raw.w : null;
  const recap: Recap = {
    v: 1,
    kind: raw.k === "e" ? "elimination" : "auction",
    names: [clip(String(raw.n[0] ?? "Home"), 16), clip(String(raw.n[1] ?? "Away"), 16)],
    avatars: [clampAvatar(raw.a?.[0]), clampAvatar(raw.a?.[1])],
    winner,
    scores: [Number(raw.s?.[0]) || 0, Number(raw.s?.[1]) || 0],
    lines: [unpack(raw.l?.[0]), unpack(raw.l?.[1])],
  };
  if (typeof raw.y === "number") recap.year = raw.y;
  if (raw.ww) recap.weekWins = [Number(raw.ww[0]) || 0, Number(raw.ww[1]) || 0];
  return recap;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64ToBytes(token: string): Uint8Array {
  const pad = token.length % 4 === 0 ? "" : "=".repeat(4 - (token.length % 4));
  const bin = atob(token.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeRecap(recap: Recap): string {
  return bytesToB64(new TextEncoder().encode(JSON.stringify(toWire(recap))));
}

export function decodeRecap(token: string): Recap | null {
  try {
    const json = new TextDecoder().decode(b64ToBytes(token));
    return fromWire(JSON.parse(json) as Wire);
  } catch {
    return null;
  }
}

export function recapPath(recap: Recap): string {
  return `/recap#${encodeRecap(recap)}`;
}

export function recapCaption(recap: Recap): string {
  const format = recap.kind === "elimination" ? "Elimination" : "Auction";
  if (recap.winner === null) {
    return recap.kind === "elimination"
      ? `Darkness ${format}${recap.year ? ` ${recap.year}` : ""} — ${recap.names[0]} and ${recap.names[1]} drew ${recap.scores[0]}–${recap.scores[1]}.`
      : `Darkness ${format} — ${recap.names[0]} ${recap.scores[0]} · ${recap.names[1]} ${recap.scores[1]}. Draw.`;
  }
  const win = recap.names[recap.winner];
  const lose = recap.names[recap.winner === 0 ? 1 : 0];
  const a = recap.scores[recap.winner];
  const b = recap.scores[recap.winner === 0 ? 1 : 0];
  if (recap.kind === "elimination") {
    return `Darkness ${format}${recap.year ? ` ${recap.year}` : ""} — ${win} beats ${lose} ${a}–${b}.`;
  }
  return `Darkness ${format} — ${win} ${a} over ${lose} ${b}.`;
}

export function recapHeadline(recap: Recap): string {
  if (recap.kind === "elimination") {
    return recap.year ? `Elimination · ${recap.year}` : "Elimination";
  }
  return "Auction";
}

export function recapScoreLabel(recap: Recap, seat: Seat): string {
  if (recap.kind === "elimination") return String(recap.scores[seat]);
  return String(Math.round(recap.scores[seat]));
}

export function recapGrade(recap: Recap, seat: Seat): string {
  if (recap.kind !== "auction") return "";
  return gradeForTotal(recap.scores[seat]).letter;
}

export function recapAvatarSrc(id: AvatarId): string {
  return avatarById(id).src;
}
