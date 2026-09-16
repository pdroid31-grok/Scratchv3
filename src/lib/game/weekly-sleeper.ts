import type { ElimPlayer, ElimPos } from "./elim-data";
import { WEEKLY_TZ, WEEKLY_SPREAD_EXTRA, WEEKLY_SPREAD_KEEP, spreadPpr, type WeeklyPackedBoard, type WeeklyPackedPlayer } from "./weekly";
import type { TeamId } from "./types";

const UA = "DarknessWeekly/1.0";
const TEAMS = new Set<string>([
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB",
  "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
  "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
]);
const TEAM_FIX: Record<string, string> = {
  OAK: "LV",
  SD: "LAC",
  STL: "LAR",
  LA: "LAR",
  WSH: "WAS",
  JAC: "JAX",
};
const NICKS: Record<string, string> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers",
  CHI: "Bears", CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos",
  DET: "Lions", GB: "Packers", HOU: "Texans", IND: "Colts", JAX: "Jaguars",
  KC: "Chiefs", LAC: "Chargers", LAR: "Rams", LV: "Raiders", MIA: "Dolphins",
  MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets",
  PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks", SF: "49ers", TB: "Buccaneers",
  TEN: "Titans", WAS: "Commanders",
};
const DONE = new Set(["complete", "final", "closed", "post_game", "status_final", "final_overtime"]);
const LIVE = new Set(["in_game", "inprogress", "halftime", "end_period", "status_in_progress"]);

function gameStarted(status: string): boolean {
  const s = String(status || "").toLowerCase();
  return LIVE.has(s) || DONE.has(s) || s === "complete";
}

/** Kickoff window flags. `scheduled` / empty is not live. */
export function weekPhase(
  now: number,
  lockAt: number,
  endAt: number,
  statuses: readonly string[],
): { open: boolean; live: boolean; done: boolean } {
  const norm = statuses.map((status) => String(status || "").toLowerCase());
  const allDone = norm.length > 0 && norm.every((status) => DONE.has(status) || status === "complete");
  const kickedOff = now >= lockAt || norm.some(gameStarted);
  const done = allDone || now >= endAt;
  const open = !kickedOff && now < lockAt;
  return { open, live: kickedOff && !done, done };
}

type Cache<T> = { at: number; value: T };
const mem = new Map<string, Cache<unknown>>();

async function getJson<T>(url: string, ttl: number): Promise<T> {
  const hit = mem.get(url) as Cache<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const req = await fetch(url, { headers: { "User-Agent": UA } });
  if (!req.ok) throw new Error(`sleeper ${req.status}`);
  const value = (await req.json()) as T;
  mem.set(url, { at: Date.now(), value });
  return value;
}

function teamOf(raw: string | null | undefined): TeamId | null {
  const team = TEAM_FIX[(raw || "").toUpperCase()] ?? (raw || "").toUpperCase();
  return TEAMS.has(team) ? (team as TeamId) : null;
}

export type NflClock = {
  season: number;
  week: number;
  seasonType: string;
};

export type NflGame = {
  week: number;
  date: string;
  status: string;
  home: string;
  away: string;
};

export function weekOpponents(games: NflGame[]): Record<string, TeamId> {
  const out: Record<string, TeamId> = {};
  for (const game of games) {
    const home = teamOf(game.home);
    const away = teamOf(game.away);
    if (!home || !away || home === away) continue;
    out[home] = away;
    out[away] = home;
  }
  return out;
}

export function fillPackedOpponents(pack: WeeklyPackedBoard, games: NflGame[]): WeeklyPackedBoard {
  const opp = weekOpponents(games);
  const out = {} as WeeklyPackedBoard;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "D"] as ElimPos[]) {
    out[pos] = (pack[pos] ?? []).map((row) => ({
      ...row,
      vs: row.vs ?? opp[row.team],
    }));
  }
  return out;
}

export async function nflClock(): Promise<NflClock> {
  const raw = await getJson<{
    week?: number;
    display_week?: number;
    season?: string;
    season_type?: string;
    season_start_date?: string;
  }>("https://api.sleeper.app/v1/state/nfl", 60_000);
  const season = Number(raw.season) || new Date().getFullYear();
  const type = String(raw.season_type || "regular").toLowerCase();
  // Weekly Elimination is regular-season only. Preseason week 1 is a different slate.
  if (type.startsWith("pre") || type.startsWith("off")) {
    return { season, week: 1, seasonType: "regular" };
  }
  if (type.startsWith("post")) {
    return { season, week: 18, seasonType: "regular" };
  }
  const week = Math.min(18, Math.max(1, Number(raw.display_week ?? raw.week) || 1));
  return { season, week, seasonType: "regular" };
}

export async function nflSchedule(season: number): Promise<NflGame[]> {
  const raw = await getJson<NflGame[]>(`https://api.sleeper.app/schedule/nfl/regular/${season}`, 5 * 60_000);
  return Array.isArray(raw) ? raw : [];
}

function etOffset(ymd: string): string {
  const month = Number(ymd.slice(5, 7));
  return month >= 3 && month <= 10 ? "-04:00" : "-05:00";
}

function atEt(ymd: string, hhmm: string): number {
  return Date.parse(`${ymd}T${hhmm}:00${etOffset(ymd)}`);
}

export function ymdInTz(ms: number, tz = WEEKLY_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Keep only kickoffs that fall on this NFL week's schedule dates (drop preseason / other-week calendar noise). */
export function stampsInWeek(stamps: number[], firstDate?: string, lastDate?: string): number[] {
  if (!firstDate || !lastDate) return stamps.filter((n) => Number.isFinite(n));
  return stamps.filter((ms) => {
    if (!Number.isFinite(ms)) return false;
    const ymd = ymdInTz(ms);
    return ymd >= firstDate && ymd <= lastDate;
  });
}

async function espnKickoffs(season: number, week: number): Promise<number[]> {
  try {
    const url = `https://cdn.espn.com/core/nfl/schedule?xhr=1&year=${season}&seasontype=2&week=${week}`;
    const raw = await getJson<unknown>(url, 10 * 60_000);
    const blob = JSON.stringify(raw);
    const stamps = [...blob.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z/g)].map((row) => Date.parse(row[0]!));
    return stamps.filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export async function weekWindow(
  season: number,
  week: number,
): Promise<{ lockAt: number; endAt: number; games: NflGame[]; open: boolean; live: boolean; done: boolean }> {
  const games = (await nflSchedule(season)).filter((game) => Number(game.week) === week);
  const dates = games.map((game) => String(game.date || "")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const espn = stampsInWeek(await espnKickoffs(season, week), dates[0], dates[dates.length - 1]);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const lockAt = espn.length ? Math.min(...espn) : firstDate ? atEt(firstDate, "20:20") : Date.now() + 86400000;
  const lastKick = espn.length ? Math.max(...espn) : lastDate ? atEt(lastDate, "20:15") : lockAt;
  const endAt = lastKick + 4 * 60 * 60 * 1000;
  const now = Date.now();
  const statuses = games.map((game) => String(game.status || "").toLowerCase());
  const allDone = games.length > 0 && statuses.every((status) => DONE.has(status) || status === "complete");
  const phase = weekPhase(now, lockAt, endAt, statuses);
  return { lockAt, endAt, games, open: phase.open, live: phase.live, done: phase.done || allDone };
}

type ProjRow = {
  player_id?: string;
  team?: string;
  stats?: { pts_ppr?: number };
  player?: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    fantasy_positions?: string[];
    injury_status?: string | null;
    injury_body_part?: string | null;
    injury_notes?: string | null;
  };
};

const INJURED_STATUSES = new Set([
  "out",
  "ir",
  "pup",
  "doubtful",
  "sus",
  "suspended",
  "na",
  "dnr",
  "injured reserve",
  "physically unable",
  "covid",
  "covid-19",
]);

export function isInjuredForWeekly(player?: ProjRow["player"]): boolean {
  const status = String(player?.injury_status || "").trim().toLowerCase();
  if (!status) return false;
  if (INJURED_STATUSES.has(status)) return true;
  if (status !== "questionable") return false;
  const part = String(player?.injury_body_part || "").toLowerCase();
  const notes = String(player?.injury_notes || "").toLowerCase();
  if (notes.includes("surgery") || /\bir\b/.test(notes)) return true;
  return part.includes("acl") || part.includes("achilles") || part.includes("fracture");
}

function posOf(row: ProjRow): ElimPos | null {
  const pos = row.player?.position || row.player?.fantasy_positions?.[0] || "";
  if (pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE" || pos === "K") return pos;
  if (pos === "FB") return "RB";
  if (pos === "DEF") return "D";
  return null;
}

function packPosition(ranked: WeeklyPackedPlayer[], stream: boolean): WeeklyPackedPlayer[] {
  const n = stream ? 5 : 10;
  const picked = spreadPpr(
    ranked,
    (row) => row.ppr,
    n,
    WEEKLY_SPREAD_EXTRA,
    stream ? 2 : WEEKLY_SPREAD_KEEP,
  );
  return picked
    .slice()
    .sort((a, b) => b.ppr - a.ppr)
    .map((row, i) => ({ ...row, cost: n - i }));
}

/** Fresh weekly board: highest healthy, non-bye projections, then the current top-to-bottom spread. */
export function buildWeeklyBoard(
  rows: ProjRow[],
  season: number,
  week: number,
  games: NflGame[],
): WeeklyPackedBoard {
  const opp = weekOpponents(games);
  const skipBye = Object.keys(opp).length >= 16;
  const byPos: Record<ElimPos, WeeklyPackedPlayer[]> = { QB: [], RB: [], WR: [], TE: [], K: [], D: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    const pos = posOf(row);
    if (!pos) continue;
    if (isInjuredForWeekly(row.player)) continue;
    const pts = Number(row.stats?.pts_ppr) || 0;
    if (pts < 0.4) continue;
    const team = teamOf(row.team || row.player?.team);
    if (!team) continue;
    if (skipBye && !opp[team]) continue;
    const sid = String(row.player_id || "");
    if (!sid || seen.has(`${pos}:${sid}`)) continue;
    seen.add(`${pos}:${sid}`);
    const name =
      pos === "D"
        ? NICKS[team] ?? team
        : `${row.player?.first_name ?? ""} ${row.player?.last_name ?? ""}`.trim();
    if (!name) continue;
    byPos[pos].push({
      id: `w:${season}:${pos}:${sid}`,
      sid,
      name,
      pos,
      team,
      cost: 1,
      ppr: Math.round(pts * 10) / 10,
      vs: opp[team],
    });
  }
  const pack = {} as WeeklyPackedBoard;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "D"] as ElimPos[]) {
    const ranked = [...byPos[pos]].sort((a, b) => b.ppr - a.ppr);
    pack[pos] = packPosition(ranked, pos === "K" || pos === "D");
  }
  return pack;
}

export async function weeklyProjections(season: number, week: number): Promise<WeeklyPackedBoard> {
  const [raw, schedule] = await Promise.all([
    getJson<ProjRow[]>(
      `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
      30 * 60_000,
    ),
    nflSchedule(season),
  ]);
  return buildWeeklyBoard(
    Array.isArray(raw) ? raw : [],
    season,
    week,
    schedule.filter((game) => Number(game.week) === week),
  );
}

export async function weeklyLiveStats(season: number, week: number): Promise<Record<string, number>> {
  try {
    const raw = await getJson<unknown>(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`, 30_000);
    const out: Record<string, number> = {};
    if (Array.isArray(raw)) {
      for (const row of raw) {
        if (!row || typeof row !== "object") continue;
        const id = String((row as { player_id?: string }).player_id || "");
        const pts = Number((row as { pts_ppr?: number; stats?: { pts_ppr?: number } }).pts_ppr
          ?? (row as { stats?: { pts_ppr?: number } }).stats?.pts_ppr);
        if (id && Number.isFinite(pts)) out[id] = Math.round(pts * 10) / 10;
      }
      return out;
    }
    if (raw && typeof raw === "object") {
      for (const [id, row] of Object.entries(raw as Record<string, { pts_ppr?: number }>)) {
        const pts = Number(row?.pts_ppr);
        if (Number.isFinite(pts)) out[id] = Math.round(pts * 10) / 10;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function playersFromPack(pack: WeeklyPackedBoard, week: number): Record<ElimPos, ElimPlayer[]> {
  const out = {} as Record<ElimPos, ElimPlayer[]>;
  for (const pos of ["QB", "RB", "WR", "TE", "D", "K"] as ElimPos[]) {
    out[pos] = (pack[pos] ?? []).map((row) => {
      const weeks = Array.from({ length: 18 }, () => 0);
      weeks[Math.max(0, week - 1)] = row.ppr;
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
        blocked: Boolean(row.blocked),
      };
    });
  }
  return out;
}

export function sidMap(pack: WeeklyPackedBoard): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pos of Object.keys(pack) as ElimPos[]) {
    for (const row of pack[pos] ?? []) out[row.id] = row.sid;
  }
  return out;
}
