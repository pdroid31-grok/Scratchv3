import { ELIM_SLOTS, ELIM_YEARS, isElimYear, playableWeeks, playerById, type ElimSlot, type ElimYear } from "./elim-data";
import {
  scoredWeek,
  startElimination,
  timeoutElim,
  flushElimDraft,
  pickElim,
  legalElimPicks,
  elimLineup,
  ELIM_PICK_CLOCK_MS,
  ELIM_PICK_HOLD_MS,
  type ElimPick,
} from "./elim";
import { clampAvatar, type AvatarId } from "./avatars";
import type { GameState } from "./engine";

export const DAILY_LAUNCH = "2026-09-02";
export const DAILY_SCORE_LINE = 100;
export const DAILY_PAY = 1;
export const DAILY_TZ = "America/New_York";

export function dailyDayStamp(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function dailyYesterday(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d! - 1);
  const iso = new Date(utc).toISOString().slice(0, 10);
  return iso;
}

export function formatDailyDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function isDailyDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= DAILY_LAUNCH;
}

/** Own card while the day is live. Everyone’s card after midnight ET. */
export function canViewDailyLineup(
  day: string,
  today: string,
  viewerId: string | null | undefined,
  ownerId: string,
): boolean {
  if (!isDailyDay(day) || day > today) return false;
  if (day < today) return Boolean(ownerId);
  return Boolean(viewerId && viewerId === ownerId);
}

export function pickDailyPuzzle(rollYear = Math.random(), rollWeek = Math.random()): {
  year: ElimYear;
  week: number;
} {
  const year = ELIM_YEARS[Math.min(ELIM_YEARS.length - 1, Math.floor(rollYear * ELIM_YEARS.length))]!;
  const weeks = playableWeeks(year);
  const week = weeks[Math.min(weeks.length - 1, Math.floor(rollWeek * weeks.length))]!;
  return { year, week };
}

export function puzzleIsLegal(year: number, week: number): year is ElimYear {
  return isElimYear(year) && playableWeeks(year).includes(week);
}

export function dailyScorePays(score: number): boolean {
  return score > DAILY_SCORE_LINE;
}

/** Solo daily: one clock + hold per slot. After this, leftover picks auto-submit. */
export function dailyAutoBudgetMs(): number {
  return ELIM_SLOTS.length * (ELIM_PICK_CLOCK_MS + ELIM_PICK_HOLD_MS);
}

function saltRoll(salt: string, step: number): number {
  let h = 2166136261;
  const text = `${salt}:${step}`;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

export type DailyPickIds = { slot: string; id: string };

export function clipDailyPickIds(raw: unknown): DailyPickIds[] {
  const rows = Array.isArray(raw) ? raw : typeof raw === "string" ? parsePickJson(raw) : [];
  const out: DailyPickIds[] = [];
  const seen = new Set<string>();
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const slot = String((item as { slot?: string }).slot ?? "").trim();
    const id = String((item as { id?: string }).id ?? "").trim();
    if (!slot || !id || seen.has(slot)) continue;
    seen.add(slot);
    out.push({ slot, id });
  }
  return out;
}

function parsePickJson(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Fill leftover solo daily slots the same way the draft clock auto-picks. */
export function autoFillDailyPicks(
  year: ElimYear,
  day: string,
  salt = "",
  existing: DailyPickIds[] = [],
): ElimPick[] {
  let state = startDailyGame("GM", year, day, "poor", [...ELIM_SLOTS]);
  let steps = 0;
  let now = 1_000_000;
  while (state.phase === "draft") {
    if (++steps > 40) break;
    if (state.elim?.pickHoldUntil) {
      now = state.elim.pickHoldUntil + 1;
      state = flushElimDraft(state, now);
      continue;
    }
    const clock = state.elim?.pickClockUntil ?? now;
    now = clock;
    const slot = state.elim ? elimLineup(state.elim)[state.elim.round] : undefined;
    const want = slot ? existing.find((row) => row.slot === slot)?.id : undefined;
    if (want && state.elim) {
      const legal = legalElimPicks(state.elim, state.cash[0], 0);
      if (legal.some((row) => row.id === want)) {
        state = pickElim(state, want, 0, now);
        continue;
      }
    }
    state = timeoutElim(state, 0, now, saltRoll(salt, steps));
  }
  if (state.elim?.pickHoldUntil) state = flushElimDraft(state, state.elim.pickHoldUntil + 1);
  return state.elim?.picks[0] ?? [];
}

export function tiedDailyWinners(rows: { userId: string; score: number }[]): string[] {
  if (rows.length === 0) return [];
  const top = Math.max(...rows.map((row) => row.score));
  return rows.filter((row) => row.score === top).map((row) => row.userId);
}

export function startDailyGame(
  name: string,
  year: ElimYear,
  day: string,
  avatarId: AvatarId = "poor",
  order?: ElimSlot[],
): GameState {
  const placeholder = playableWeeks(year)[0]!;
  const dealt = startElimination(name, "Field", { avatars: [clampAvatar(avatarId), "poor"] }, {
    year,
    week: placeholder,
    firstPicker: 0,
    ...(order ? { order } : {}),
  });
  return {
    ...dealt,
    names: [name.trim() || "GM", "Field"],
    currentBidder: 0,
    daily: { day, hideWeek: true },
    elim: dealt.elim
      ? {
          ...dealt.elim,
          solo: true,
          firstPicker: 0,
          week: placeholder,
        }
      : null,
  };
}

/** Replay saved Daily picks only. Never auto-fills leftover slots. */
export function resumeDailyGame(
  name: string,
  year: ElimYear,
  day: string,
  avatarId: AvatarId = "poor",
  existing: DailyPickIds[] = [],
): GameState {
  let state = startDailyGame(name, year, day, avatarId, [...ELIM_SLOTS]);
  let now = 1_000_000;
  const bySlot = new Map(existing.map((row) => [row.slot, row.id]));
  while (state.phase === "draft" && state.elim) {
    if (state.elim.pickHoldUntil) {
      now = state.elim.pickHoldUntil + 1;
      state = flushElimDraft(state, now);
      continue;
    }
    const slot = elimLineup(state.elim)[state.elim.round];
    const want = slot ? bySlot.get(slot) : undefined;
    if (!want) break;
    const legal = legalElimPicks(state.elim, state.cash[0], 0);
    if (!legal.some((row) => row.id === want)) break;
    state = pickElim(state, want, 0, now);
  }
  if (state.elim?.pickHoldUntil) state = flushElimDraft(state, state.elim.pickHoldUntil + 1);
  return state;
}

export function dailyPickPayload(picks: ElimPick[]): { slot: string; id: string }[] {
  return ELIM_SLOTS.map((slot) => {
    const hit = picks.find((row) => row.slot === slot);
    return hit ? { slot, id: hit.player.id } : { slot, id: "" };
  }).filter((row) => row.id);
}

export type DailyPickSnap = {
  slot: string;
  id: string;
  name: string;
  team: string;
  cost: number;
  score: number;
};

export function dailyPickSnapshot(year: ElimYear, week: number, picks: ElimPick[]): DailyPickSnap[] {
  return picks.map((pick) => ({
    slot: pick.slot,
    id: pick.player.id,
    name: pick.player.name,
    team: pick.player.team,
    cost: pick.player.cost,
    score: Math.round(scoredWeek(pick.player, week, year) * 10) / 10,
  }));
}

export function hydrateDailyPicks(year: number, week: number, raw: unknown): DailyPickSnap[] {
  const rows = Array.isArray(raw) ? raw : [];
  const snaps: DailyPickSnap[] = [];
  for (const slot of ELIM_SLOTS) {
    const row = rows.find((item) => item && typeof item === "object" && String((item as { slot?: string }).slot) === slot) as
      | { slot?: string; id?: string; name?: string; team?: string; cost?: number; score?: number }
      | undefined;
    if (!row) continue;
    const named = String(row.name ?? "").trim();
    const id = String(row.id ?? "");
    const storedScore = row.score;
    const player = id ? playerById(id) : null;
    const computed =
      player && isElimYear(year) ? Math.round(scoredWeek(player, week, year) * 10) / 10 : null;
    const score =
      storedScore != null && named ? Number(storedScore) || 0 : computed != null ? computed : Number(storedScore) || 0;
    snaps.push({
      slot,
      id: player?.id ?? id,
      name: named || player?.name || id || slot,
      team: String(row.team ?? player?.team ?? ""),
      cost: Number(row.cost) || player?.cost || 0,
      score,
    });
  }
  return snaps;
}
