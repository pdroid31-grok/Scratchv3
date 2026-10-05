import { ELIM_BUDGET, ELIM_SLOTS, type ElimPos, type ElimSlot } from "./elim-data";
import type { WeeklyPackedBoard } from "./weekly";

export type WeeklyReviewPick = {
  slot: string;
  name: string;
  team: string;
  cost: number;
  score: number;
};

export type WeeklyReviewBuilt =
  | {
      ok: true;
      best: WeeklyReviewPick[];
      lineup: WeeklyReviewPick[];
      lineupScore: number;
      lineupCost: number;
      worst: WeeklyReviewPick[];
    }
  | { ok: false; missing: string };

type Row = {
  id: string;
  name: string;
  team: string;
  cost: number;
  score: number;
};

const POS: ElimPos[] = ["QB", "RB", "WR", "TE", "K", "D"];
const NEED: Record<ElimPos, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, D: 1 };

function byId(a: Row, b: Row): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function ranked(rows: Row[], high: boolean): Row[] {
  return [...rows].sort((a, b) => {
    if (a.score !== b.score) return high ? b.score - a.score : a.score - b.score;
    return byId(a, b);
  });
}

function slotPicks(rows: Record<ElimPos, Row[]>, high: boolean): WeeklyReviewPick[] {
  const out: WeeklyReviewPick[] = [];
  const take = (pos: ElimPos, slots: ElimSlot[]) => {
    const list = ranked(rows[pos], high);
    slots.forEach((slot, i) => {
      const row = list[i];
      if (!row) return;
      out.push({ slot, name: row.name, team: row.team, cost: row.cost, score: row.score });
    });
  };
  take("QB", ["QB"]);
  take("RB", ["RB1", "RB2"]);
  take("WR", ["WR1", "WR2"]);
  take("TE", ["TE"]);
  take("K", ["K"]);
  take("D", ["D"]);
  return out;
}

function pairs(rows: Row[]): [Row, Row][] {
  const out: [Row, Row][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) out.push([rows[i]!, rows[j]!]);
  }
  return out;
}

function orderPair(a: Row, b: Row): [Row, Row] {
  if (a.score !== b.score) return a.score > b.score ? [a, b] : [b, a];
  return a.id <= b.id ? [a, b] : [b, a];
}

function bestLineup(rows: Record<ElimPos, Row[]>): { picks: WeeklyReviewPick[]; score: number; cost: number } | null {
  const rbPairs = pairs(rows.RB);
  const wrPairs = pairs(rows.WR);
  let best: { score: number; key: string; picks: Row[] } | null = null;
  for (const qb of rows.QB) {
    for (const [rbA, rbB] of rbPairs) {
      for (const [wrA, wrB] of wrPairs) {
        for (const te of rows.TE) {
          for (const k of rows.K) {
            for (const d of rows.D) {
              const group = [qb, rbA, rbB, wrA, wrB, te, k, d];
              const cost = group.reduce((n, row) => n + row.cost, 0);
              if (cost > ELIM_BUDGET) continue;
              const score = Math.round(group.reduce((n, row) => n + row.score, 0) * 10) / 10;
              const key = group
                .map((row) => row.id)
                .sort()
                .join("|");
              if (!best || score > best.score || (score === best.score && key < best.key)) {
                best = { score, key, picks: group };
              }
            }
          }
        }
      }
    }
  }
  if (!best) return null;
  const [rb1, rb2] = orderPair(best.picks[1]!, best.picks[2]!);
  const [wr1, wr2] = orderPair(best.picks[3]!, best.picks[4]!);
  const ordered = [best.picks[0]!, rb1, rb2, wr1, wr2, best.picks[5]!, best.picks[6]!, best.picks[7]!];
  const picks = ELIM_SLOTS.map((slot, i) => {
    const row = ordered[i]!;
    return { slot, name: row.name, team: row.team, cost: row.cost, score: row.score };
  });
  return { picks, score: best.score, cost: picks.reduce((n, row) => n + row.cost, 0) };
}

/** Score a stored weekly board that already has this week's actual on weeks[week - 1]. */
export function buildWeeklyReview(pack: WeeklyPackedBoard, week: number): WeeklyReviewBuilt {
  const index = week - 1;
  const rows = {} as Record<ElimPos, Row[]>;
  for (const pos of POS) {
    rows[pos] = [];
    for (const player of pack[pos] ?? []) {
      const score = player.weeks?.[index];
      if (score == null || !Number.isFinite(Number(score))) return { ok: false, missing: player.name || pos };
      rows[pos].push({
        id: player.id,
        name: player.name,
        team: player.team,
        cost: Number(player.cost) || 0,
        score: Number(score),
      });
    }
    if (rows[pos].length < NEED[pos]) return { ok: false, missing: pos };
  }
  const lineup = bestLineup(rows);
  if (!lineup) return { ok: false, missing: "lineup" };
  return {
    ok: true,
    best: slotPicks(rows, true),
    worst: slotPicks(rows, false),
    lineup: lineup.picks,
    lineupScore: lineup.score,
    lineupCost: lineup.cost,
  };
}
