import { ELIM_SLOTS, isElimSlot, slotPos, type ElimPlayer, type ElimPos, type ElimSlot } from "./elim-data";
import { startElimination, pickElim, flushElimDraft, legalElimPicks, elimLineup, type ElimPick } from "./elim";
import { clampAvatar, type AvatarId } from "./avatars";
import { initialGame, type GameState } from "./engine";
import type { TeamId } from "./types";

export const WEEKLY_SCORE_LINE = 100;
export const WEEKLY_PAY = 1;
export const WEEKLY_WIN_PAY = 2;
export const WEEKLY_WIN_STARS = 2;
export const WEEKLY_TZ = "America/New_York";
export const WEEK1_TNF_TEAMS = new Set(["SEA", "NE"]);

/**
 * 2026-W2 only: drop Thursday BUF–DET and lock Sunday 1:00 PM ET.
 * Do not apply that team pair to any other week. Already-locked W1–W3
 * runs stay on the clock they were saved with.
 */
export const WEEKLY_MIGRATION_WEEK = { season: 2026, week: 2 } as const;
const WEEKLY_MIGRATION_SKIP = new Set(["BUF", "DET"]);

/** Standing slate from 2026-W4 on. One lock: that week's Sunday 1:00 PM ET. */
export const SUNDAY_SLATE_FROM = { season: 2026, week: 4 } as const;

export function isSundaySlateWeek(season: number, week: number): boolean {
  return season > SUNDAY_SLATE_FROM.season || (season === SUNDAY_SLATE_FROM.season && week >= SUNDAY_SLATE_FROM.week);
}

export function isWeeklyMigrationWeek(season: number, week: number): boolean {
  return season === WEEKLY_MIGRATION_WEEK.season && week === WEEKLY_MIGRATION_WEEK.week;
}

export function skipWeeklyMigrationGame(season: number, week: number, home: string, away: string): boolean {
  if (!isWeeklyMigrationWeek(season, week)) return false;
  const a = String(home || "").toUpperCase();
  const b = String(away || "").toUpperCase();
  return WEEKLY_MIGRATION_SKIP.has(a) && WEEKLY_MIGRATION_SKIP.has(b);
}

export function weeklyMigrationSkipTeam(season: number, week: number, team: string): boolean {
  return isWeeklyMigrationWeek(season, week) && WEEKLY_MIGRATION_SKIP.has(String(team || "").toUpperCase());
}

function etStamp(ymd: string, hhmm: string): number {
  const month = Number(ymd.slice(5, 7));
  const off = month >= 3 && month <= 10 ? "-04:00" : "-05:00";
  return Date.parse(`${ymd}T${hhmm}:00${off}`);
}

function etYmd(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEKLY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function etWeekday(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: WEEKLY_TZ }).format(new Date(ms));
}

/** First Sunday 1:00 PM ET among these YYYY-MM-DD dates. */
export function firstSundayLockMs(dates: readonly string[]): number | null {
  const sunday = [...dates].filter((ymd) => /^\d{4}-\d{2}-\d{2}$/.test(ymd)).sort().find((ymd) => {
    const label = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: WEEKLY_TZ }).format(
      new Date(etStamp(ymd, "12:00")),
    );
    return label === "Sun";
  });
  return sunday ? etStamp(sunday, "13:00") : null;
}

/** W2 only. Same Sunday 1:00 stamp. Later weeks use keepSundaySlate. */
export function weeklyMigrationSundayLockMs(season: number, week: number, dates: readonly string[]): number | null {
  if (!isWeeklyMigrationWeek(season, week)) return null;
  return firstSundayLockMs(dates);
}

/** Sunday 1:00 PM ET on the earliest Sunday kickoff in the set. */
export function sundayOnePmLock(kickoffs: readonly number[]): number | null {
  const ymds = kickoffs
    .filter((ms) => Number.isFinite(ms) && etWeekday(ms) === "Sun")
    .map((ms) => etYmd(ms))
    .sort();
  return ymds.length ? etStamp(ymds[0]!, "13:00") : null;
}

export type SlateKickGame = {
  home: string;
  away: string;
  date: string;
  status?: string;
  kickoff?: number;
};

/** Drop kickoffs before Sunday 1:00 PM ET. Weeks before 2026-W4 are unchanged. */
export function keepSundaySlate<T extends SlateKickGame>(
  games: readonly T[],
  season: number,
  week: number,
): { games: T[]; lockAt: number | null } {
  if (!isSundaySlateWeek(season, week)) return { games: [...games], lockAt: null };
  const kickoffs = games.flatMap((game) =>
    typeof game.kickoff === "number" && Number.isFinite(game.kickoff) ? [game.kickoff] : [],
  );
  const lockAt =
    sundayOnePmLock(kickoffs) ??
    firstSundayLockMs(games.map((game) => game.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  if (lockAt == null) return { games: [...games], lockAt: null };
  const sunday = etYmd(lockAt);
  const kept = games.filter((game) => {
    if (typeof game.kickoff === "number" && Number.isFinite(game.kickoff)) return game.kickoff >= lockAt;
    return Boolean(game.date) && game.date >= sunday;
  });
  return { games: kept, lockAt };
}

/** Monday games still on the slate. No Monday kickoff → empty. Does not invent one. */
export function mondayNightTeams(
  games: readonly { home: string; away: string; date?: string; kickoff?: number }[],
  lockAt: number,
): Set<string> {
  const sunday = etYmd(lockAt);
  const out = new Set<string>();
  for (const game of games) {
    const kick = game.kickoff;
    const monday =
      typeof kick === "number" && Number.isFinite(kick)
        ? etWeekday(kick) === "Mon" && kick >= lockAt
        : Boolean(game.date && game.date > sunday);
    if (!monday) continue;
    const home = String(game.home || "").toUpperCase();
    const away = String(game.away || "").toUpperCase();
    if (home) out.add(home);
    if (away) out.add(away);
  }
  return out;
}

/** If the board missed every MNF team, swap in the best unpacked Monday player at the closest projection. */
export function withMondayNightPlayer(
  pack: WeeklyPackedBoard,
  pools: WeeklyPackedBoard,
  teams: ReadonlySet<string>,
): WeeklyPackedBoard {
  if (!teams.size) return pack;
  const slots = ["QB", "RB", "WR", "TE", "K", "D"] as ElimPos[];
  const packedIds = new Set<string>();
  for (const pos of slots) {
    for (const row of pack[pos] ?? []) {
      packedIds.add(row.id);
      if (teams.has(row.team)) return pack;
    }
  }
  let best: WeeklyPackedPlayer | null = null;
  for (const pos of slots) {
    for (const row of pools[pos] ?? []) {
      if (!teams.has(row.team) || packedIds.has(row.id)) continue;
      if (!best || row.ppr > best.ppr || (row.ppr === best.ppr && row.id < best.id)) best = row;
    }
  }
  if (!best) return pack;
  const pos = best.pos;
  const current = [...(pack[pos] ?? [])];
  if (!current.length) return { ...pack, [pos]: [{ ...best, cost: 1 }] };
  let pick = 0;
  for (let i = 1; i < current.length; i += 1) {
    const gap = Math.abs(current[i]!.ppr - best.ppr);
    const bestGap = Math.abs(current[pick]!.ppr - best.ppr);
    if (gap < bestGap || (gap === bestGap && current[i]!.ppr < current[pick]!.ppr)) pick = i;
  }
  current[pick] = { ...best };
  const n = current.length;
  return {
    ...pack,
    [pos]: current
      .slice()
      .sort((a, b) => b.ppr - a.ppr || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((row, i) => ({ ...row, cost: n - i })),
  };
}

export function applyWeeklyMigrationBoard(pack: WeeklyPackedBoard, season: number, week: number): WeeklyPackedBoard {
  if (!isWeeklyMigrationWeek(season, week)) return pack;
  const out = {} as WeeklyPackedBoard;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "D"] as ElimPos[]) {
    out[pos] = (pack[pos] ?? []).filter((row) => !weeklyMigrationSkipTeam(season, week, row.team));
  }
  return out;
}

export function weeklyTeamBlocked(team: string): boolean {
  return WEEK1_TNF_TEAMS.has(String(team || "").toUpperCase());
}

export function blockWeeklyTeams(pack: WeeklyPackedBoard, teams: ReadonlySet<string>): WeeklyPackedBoard {
  const out = {} as WeeklyPackedBoard;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "D"] as ElimPos[]) {
    out[pos] = (pack[pos] ?? []).map((row) => ({
      ...row,
      blocked: Boolean(row.blocked) || teams.has(row.team),
    }));
  }
  return out;
}

export type WeeklyPickSnap = {
  slot: string;
  id: string;
  sid: string;
  name: string;
  team: string;
  cost: number;
  score: number;
  vs?: string;
};

export type WeeklyPackedPlayer = {
  id: string;
  sid: string;
  name: string;
  pos: ElimPos;
  team: TeamId;
  cost: number;
  ppr: number;
  vs?: TeamId;
  blocked?: boolean;
  /** Finished-week Sleeper PPR for the player sheet. null = unplayed / blank. */
  weeks?: (number | null)[];
};

export type WeeklyPackedBoard = Record<ElimPos, WeeklyPackedPlayer[]>;

export type WeeklyResume = {
  season: number;
  week: number;
  live: boolean;
  awarded: boolean;
  score: number;
  picks: WeeklyPickSnap[];
  paid?: boolean;
  winner?: boolean;
};

export function weeklyKey(season: number, week: number): string {
  return `${season}-W${String(week).padStart(2, "0")}`;
}

export function parseWeeklyKey(value: string): { season: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const season = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(season) || week < 1 || week > 18) return null;
  return { season, week };
}

export function weeklyScorePays(score: number): boolean {
  return score > WEEKLY_SCORE_LINE;
}

export function tiedWeeklyWinners(rows: { userId: string; score: number }[]): string[] {
  if (rows.length === 0) return [];
  const top = Math.max(...rows.map((row) => row.score));
  return rows.filter((row) => row.score === top).map((row) => row.userId);
}

export function canViewWeeklyLineup(
  awarded: boolean,
  live: boolean,
  viewerId: string | null | undefined,
  ownerId: string,
): boolean {
  if (!ownerId) return false;
  if (awarded || live) return true;
  return Boolean(viewerId && viewerId === ownerId);
}

export function formatWeeklyLock(lockAt: number): string {
  if (!lockAt) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: WEEKLY_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(lockAt));
}

export function weeklyVsLabel(vs?: string | null): string {
  const team = String(vs || "").trim().toUpperCase();
  return team ? `VS ${team}` : "";
}

export function fillSnapOpponents(picks: WeeklyPickSnap[], opp: Record<string, string>): WeeklyPickSnap[] {
  return picks.map((row) => ({
    ...row,
    vs: row.vs || opp[row.team] || undefined,
  }));
}

export const WEEKLY_SPREAD_EXTRA = 1.8;
export const WEEKLY_SPREAD_KEEP = 4;

export function spreadPpr<T>(
  ranked: T[],
  score: (row: T) => number,
  n = 10,
  extra = WEEKLY_SPREAD_EXTRA,
  keep = 0,
): T[] {
  if (ranked.length <= n) return ranked;
  const top = score(ranked[0]!);
  const ref = score(ranked[Math.min(9, ranked.length - 1)]!);
  const gap = Math.max(1, top - ref);
  const target = top - gap * extra;
  let bottomI = 9;
  for (let i = 9; i < ranked.length; i += 1) {
    bottomI = i;
    if (score(ranked[i]!) <= target) break;
  }
  bottomI = Math.max(bottomI, n - 1);
  const pool = ranked.slice(0, bottomI + 1);
  const keepN = Math.min(Math.max(keep, 1), n - 1, pool.length);
  const picked = new Set<number>();
  for (let i = 0; i < keepN; i += 1) picked.add(i);
  const startP = score(pool[keepN - 1]!);
  const botP = score(pool[pool.length - 1]!);
  const rest = n - keepN;
  for (let i = 1; i <= rest; i += 1) {
    const want = startP - (i * (startP - botP)) / rest;
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = keepN; j < pool.length; j += 1) {
      if (picked.has(j)) continue;
      const d = Math.abs(score(pool[j]!) - want);
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0) picked.add(bestJ);
  }
  return [...picked]
    .sort((a, b) => a - b)
    .map((i) => pool[i]!)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}

export function spreadIndex<T>(rows: T[], n = 5): T[] {
  if (rows.length <= n) return rows;
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    let idx = Math.round((i * (rows.length - 1)) / (n - 1));
    while (used.has(idx) && idx < rows.length - 1) idx += 1;
    used.add(idx);
    out.push(rows[idx]!);
  }
  return out;
}

export function unpackWeeklyBoard(pack: WeeklyPackedBoard, _week: number): Record<ElimPos, ElimPlayer[]> {
  const out = {} as Record<ElimPos, ElimPlayer[]>;
  for (const pos of ["QB", "RB", "WR", "TE", "D", "K"] as ElimPos[]) {
    out[pos] = (pack[pos] ?? []).map((row) => {
      const weeks = Array.from({ length: 18 }, (_, i) => {
        const v = row.weeks?.[i];
        return v == null || !Number.isFinite(Number(v)) ? Number.NaN : Number(v);
      });
      return {
        id: row.id,
        name: row.name,
        pos: row.pos,
        team: row.team,
        cost: row.cost,
        ppr: row.ppr,
        weeks,
        bye: 0,
        vs: row.vs,
      };
    });
  }
  return out;
}

export function packWeeklyBoard(season: Record<ElimPos, ElimPlayer[]>, sids: Record<string, string>): WeeklyPackedBoard {
  const pack = {} as WeeklyPackedBoard;
  for (const pos of ["QB", "RB", "WR", "TE", "D", "K"] as ElimPos[]) {
    pack[pos] = season[pos].map((row) => ({
      id: row.id,
      sid: sids[row.id] ?? "",
      name: row.name,
      pos: row.pos,
      team: row.team,
      cost: row.cost,
      ppr: row.ppr,
      vs: row.vs,
    }));
  }
  return pack;
}

export function startWeeklyGame(
  name: string,
  season: number,
  week: number,
  pool: Record<ElimPos, ElimPlayer[]>,
  avatarId: AvatarId = "poor",
): GameState {
  const dealt = startElimination(name, "Field", { avatars: [clampAvatar(avatarId), "poor"] }, {
    year: 2025,
    week,
    firstPicker: 0,
  });
  const opening = dealt.elim ? pool[slotPos(dealt.elim.order[0] ?? "QB")] : pool.QB;
  return {
    ...dealt,
    names: [name.trim() || "GM", "Field"],
    currentBidder: 0,
    weekly: { season, week, live: false, locked: false },
    elim: dealt.elim
      ? {
          ...dealt.elim,
          year: season,
          week,
          solo: true,
          firstPicker: 0,
          seasonPool: pool,
          board: opening,
        }
      : null,
  };
}

export function weeklyLockPayload(picks: ElimPick[]): { slot: string; id: string }[] {
  return ELIM_SLOTS.map((slot) => {
    const hit = picks.find((row) => row.slot === slot);
    return hit ? { slot, id: hit.player.id } : { slot, id: "" };
  }).filter((row) => row.id);
}

export function clipWeeklyPickIds(raw: unknown): { slot: string; id: string }[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: { slot: string; id: string }[] = [];
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

/** Replay saved Weekly picks only. Never auto-fills leftover slots. */
export function resumeWeeklyGame(
  name: string,
  season: number,
  week: number,
  pool: Record<ElimPos, ElimPlayer[]>,
  avatarId: AvatarId = "poor",
  existing: { slot: string; id: string }[] = [],
): GameState {
  let state = startWeeklyGame(name, season, week, pool, avatarId);
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

export function weeklyPickPayload(picks: ElimPick[], sids: Record<string, string> = {}): WeeklyPickSnap[] {
  const snaps: WeeklyPickSnap[] = [];
  for (const slot of ELIM_SLOTS) {
    const hit = picks.find((row) => row.slot === slot);
    if (!hit) continue;
    snaps.push({
      slot,
      id: hit.player.id,
      sid: sids[hit.player.id] ?? "",
      name: hit.player.name,
      team: hit.player.team,
      cost: hit.player.cost,
      score: Number(hit.player.ppr) || 0,
      vs: hit.player.vs,
    });
  }
  return snaps;
}

export function hydrateWeeklyPicks(
  raw: unknown,
  live: Record<string, number>,
  missing: "stored" | "zero" = "stored",
): WeeklyPickSnap[] {
  const rows = Array.isArray(raw) ? raw : [];
  const snaps: WeeklyPickSnap[] = [];
  for (const slot of ELIM_SLOTS) {
    const row = rows.find((item) => item && typeof item === "object" && String((item as { slot?: string }).slot) === slot) as
      | { slot?: string; id?: string; sid?: string; name?: string; team?: string; cost?: number; score?: number; vs?: string }
      | undefined;
    if (!row) continue;
    const sid = String(row.sid ?? "");
    const stored = Number(row.score);
    const livePts =
      sid && live[sid] != null
        ? live[sid]!
        : missing === "zero"
          ? 0
          : Number.isFinite(stored)
            ? stored
            : 0;
    const vs = String(row.vs ?? "").trim().toUpperCase();
    snaps.push({
      slot,
      id: String(row.id ?? ""),
      sid,
      name: String(row.name ?? slot),
      team: String(row.team ?? ""),
      cost: Number(row.cost) || 0,
      score: Math.round(livePts * 10) / 10,
      vs: vs || undefined,
    });
  }
  return snaps;
}

export function weeklyTotal(picks: WeeklyPickSnap[]): number {
  return Math.round(picks.reduce((n, row) => n + row.score, 0) * 10) / 10;
}

/** Overlay packed-board PPR so a pre-live lineup is not a fake 0.0 actual. */
export function withPackedProjections(picks: WeeklyPickSnap[], pack: WeeklyPackedBoard | null | undefined): WeeklyPickSnap[] {
  if (!pack) return picks;
  const ppr = new Map<string, number>();
  for (const rows of Object.values(pack)) {
    for (const row of rows) ppr.set(row.id, row.ppr);
  }
  return picks.map((pick) => {
    const proj = ppr.get(pick.id);
    return proj == null ? pick : { ...pick, score: Math.round(proj * 10) / 10 };
  });
}

function snapsToPicks(resume: WeeklyResume): ElimPick[] {
  const picks: ElimPick[] = [];
  for (const row of resume.picks) {
    if (!isElimSlot(row.slot)) continue;
    const pos = slotPos(row.slot);
    const weeks = Array.from({ length: 18 }, () => Number.NaN);
    weeks[Math.max(0, resume.week - 1)] = row.score;
    picks.push({
      slot: row.slot,
      pos,
      seat: 0,
      player: {
        id: row.id,
        name: row.name,
        pos,
        team: (row.team as TeamId) || "WAS",
        cost: row.cost,
        ppr: row.score,
        weeks,
        bye: 0,
        vs: row.vs ? (row.vs as TeamId) : undefined,
      },
    });
  }
  return picks;
}

export function applyWeeklyLive(state: GameState, resume: WeeklyResume): GameState {
  if (!state.elim) return state;
  const bySlot = new Map(resume.picks.map((row) => [row.slot, row]));
  const picks0 = state.elim.picks[0].map((pick) => {
    const snap = bySlot.get(pick.slot);
    if (!snap) return pick;
    const weeks = [...pick.player.weeks];
    weeks[Math.max(0, resume.week - 1)] = snap.score;
    return { ...pick, player: { ...pick.player, weeks, ppr: snap.score, vs: (snap.vs as TeamId) || pick.player.vs } };
  });
  const show = resume.live || resume.awarded;
  return {
    ...state,
    weekly: {
      season: resume.season,
      week: resume.week,
      live: show,
      locked: true,
      awarded: resume.awarded,
      paid: Boolean(resume.paid),
      winner: Boolean(resume.winner),
      score: resume.score,
    },
    elim: {
      ...state.elim,
      week: resume.week,
      picks: [picks0, state.elim.picks[1]],
      lastSet: show ? { week: resume.week, scores: [resume.score, 0], winner: null } : null,
    },
  };
}

export function weeklyCenterGame(name: string, resume: WeeklyResume, avatarId: AvatarId = "poor"): GameState {
  const picks = snapsToPicks(resume);
  const base = initialGame();
  return applyWeeklyLive(
    {
      ...base,
      phase: "matchup",
      kind: "elimination",
      names: [name.trim() || "GM", "Field"],
      cash: [0, 35],
      currentBidder: 0,
      avatars: [clampAvatar(avatarId), "poor"],
      weekly: { season: resume.season, week: resume.week, live: false, locked: true },
      elim: {
        year: resume.season,
        week: resume.week,
        round: ELIM_SLOTS.length,
        taken: picks.map((row) => row.player.id),
        picks: [picks, []],
        board: [],
        revealAt: null,
        weekWins: [0, 0],
        playedWeeks: [],
        lastSet: null,
        sets: [],
        firstPicker: 0,
        order: [...ELIM_SLOTS],
        weekReady: [true, true],
        lastPickId: null,
        pickHoldUntil: null,
        pickClockUntil: null,
        pending: null,
        solo: true,
      },
    },
    resume,
  );
}
