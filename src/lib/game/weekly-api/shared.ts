/** Shared weekly-api types. Move-only from weekly-api.server. */
import type { WeeklyStatus } from "../weekly-api-types";
import type { WeeklyPackedBoard } from "../weekly";

export type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export type WeekRow = {
  season: number;
  week: number;
  lock_at: Date | string;
  end_at: Date | string;
  awarded: boolean;
  board: unknown;
};

export type RunRow = {
  status: string;
  score: number | string | null;
  payout_score: boolean;
  payout_win: boolean;
  picks: unknown;
};

export function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function asTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseBoard(raw: unknown): WeeklyPackedBoard | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const board = raw as WeeklyPackedBoard;
  if (!Array.isArray(board.QB) || board.QB.length < 8) return null;
  return board;
}

export function runStatus(run: RunRow | null, open: boolean): WeeklyStatus {
  if (!run) return open ? "open" : "locked";
  if (run.status === "done") return "done";
  if (run.status === "forfeit") return "forfeit";
  return "playing";
}
