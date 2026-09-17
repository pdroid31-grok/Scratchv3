/** Server-only room / lobby writes. Do not import from client modules. */
import { applyAction, lobbyState, startAuction, type GameAction, type GameKind, type GameState } from "./engine";
import { elimBriefing } from "./elim";
import { isElimEra } from "./elim-data";
import { redactHalftime } from "./halftime";
import { hostedMatchView, historyLineScore } from "./hosted-match";
import { clampAvatar, isAvatarId, parseOwned, type AvatarId } from "./avatars";
import { clipDisplayName } from "./stats-shared";
import { listingFromRoom, type LobbyListing } from "./lobby-list";
import type { Seat } from "./types";
import type { MatchHistoryRow, RoomResult, RoomView, WatchResult } from "./rooms-types";
export type { MatchHistoryRow, RoomFail, RoomResult, RoomView, WatchResult, WatchView } from "./rooms-types";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_TTL_MS = 1000 * 60 * 60 * 24;
const LOBBY_WAIT_MS = 20_000;
const LOBBY_PLAY_MS = 5 * 60 * 1000;
const LOBBY_HISTORY_GEN = 1;
const LOBBY_HISTORY_KEEP = 10;
const ACTION_TYPES = new Set<GameAction["type"]>([
  "placeBid",
  "pass",
  "claim",
  "reroll",
  "advance",
  "rematch",
  "cancelRematch",
  "selectChoice",
  "shuffleLot",
  "pickBox",
  "pickElim",
  "flushElimDraft",
  "timeoutElim",
  "startReveal",
  "finishElim",
  "chat",
  "setElimEra",
  "readyElim",
]);


type RoomRow = {
  code: string;
  state: GameState | string;
  host_token: string;
  guest_token: string | null;
  version: number;
  created_at: string | Date;
  updated_at?: string | Date;
  host_user_id?: string | null;
  guest_user_id?: string | null;
};

function parseState(raw: GameState | string): GameState {
  if (typeof raw === "string") return JSON.parse(raw) as GameState;
  return raw;
}

function randomCode(): string {
  let code = "";
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  for (const b of buf) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function randomToken(): string {
  const buf = new Uint8Array(18);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function clipName(name: string): string {
  const trimmed = name.trim().slice(0, 16);
  return trimmed || "GM";
}

function clipAvatar(id: unknown): AvatarId {
  const value = String(id ?? "");
  return isAvatarId(value) ? value : "poor";
}

async function seatedIdentity(
  fallback: AvatarId,
  knownId?: string | null,
): Promise<{
  avatarId: AvatarId;
  userId: string | null;
  displayName: string;
}> {
  let userId = knownId ?? null;
  if (!userId) {
    try {
      const { getSessionUser } = await import("@/lib/auth/verify.server");
      userId = (await getSessionUser())?.id ?? null;
    } catch {
      userId = null;
    }
  }
  if (!userId) return { userId: null, avatarId: clampAvatar(fallback), displayName: "" };
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const profile = await sql.query<{ avatar_id: string; display_name: string | null; owned: string | null }>(
      "select avatar_id, display_name, owned from player_profiles where user_id = $1",
      [userId],
    );
    const auth = await sql.query<{ name: string | null }>(
      `select name from "user" where id = $1`,
      [userId],
    );
    return {
      userId,
      avatarId: clampAvatar(profile[0]?.avatar_id ?? fallback, parseOwned(profile[0]?.owned)),
      displayName:
        clipDisplayName(profile[0]?.display_name ?? "") || clipDisplayName(auth[0]?.name ?? ""),
    };
  } catch {
    return { userId, avatarId: clampAvatar(fallback), displayName: "" };
  }
}

async function persistDisplayName(userId: string | null, name: string) {
  const displayName = clipDisplayName(name);
  if (!userId || !displayName) return;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql.query(
    `insert into player_profiles (user_id, avatar_id, display_name, updated_at)
     values ($1, 'poor', $2, now())
     on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()`,
    [userId, displayName],
  );
}

function clipCode(code: unknown): string {
  return String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function asDate(value: string | Date): number {
  return new Date(value).getTime();
}

function parseAction(raw: unknown): GameAction {
  if (!raw || typeof raw !== "object") return { type: "advance" };
  const action = raw as { type?: unknown; amount?: unknown; index?: unknown; id?: unknown; text?: unknown; era?: unknown };
  const type = ACTION_TYPES.has(action.type as GameAction["type"])
    ? (action.type as GameAction["type"])
    : "advance";
  if (type === "placeBid") {
    return { type: "placeBid", amount: Math.floor(Number(action.amount) || 0) };
  }
  if (type === "selectChoice") {
    return { type: "selectChoice", index: Number(action.index) === 1 ? 1 : 0 };
  }
  if (type === "pickBox") {
    const index = Math.max(0, Math.min(3, Math.floor(Number(action.index) || 0)));
    return { type: "pickBox", index };
  }
  if (type === "pickElim") {
    return { type: "pickElim", id: String(action.id ?? "").slice(0, 80) };
  }
  if (type === "chat") {
    return { type: "chat", text: String(action.text ?? "").slice(0, 120) };
  }
  if (type === "setElimEra") {
    const era = String(action.era ?? "");
    return { type: "setElimEra", era: isElimEra(era) ? era : "modern" };
  }
  return { type };
}

async function loadRoom(code: string): Promise<RoomRow | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<RoomRow>(
    "select code, state, host_token, guest_token, version, created_at, updated_at, host_user_id, guest_user_id from darkness_rooms where code = $1",
    [code],
  );
  const row = rows[0];
  if (!row) return null;
  const age = Date.now() - asDate(row.created_at);
  const idle = Date.now() - asDate(row.updated_at ?? row.created_at);
  const phase = parseState(row.state).phase;
  const waiting = !row.guest_token && phase === "lobby";
  if (age > ROOM_TTL_MS || (waiting && idle > LOBBY_WAIT_MS) || (idle > LOBBY_PLAY_MS && phase !== "results")) {
    await sql.query("delete from darkness_rooms where code = $1", [code]);
    return null;
  }
  return row;
}

function view(row: RoomRow, seat: Seat, token: string): RoomView {
  return {
    ok: true,
    code: row.code,
    seat,
    token,
    version: Number(row.version) || 0,
    state: redactHalftime(parseState(row.state)),
    filled: Boolean(row.guest_token),
  };
}

async function stampSeatUser(state: GameState, seat: Seat, knownId?: string | null): Promise<GameState> {
  const ident = await seatedIdentity(state.avatars?.[seat] ?? "poor", knownId);
  if (!ident.userId) return state;
  const userIds: [string | null, string | null] = [
    state.userIds?.[0] ?? null,
    state.userIds?.[1] ?? null,
  ];
  if (userIds[seat]) return state;
  userIds[seat] = ident.userId;
  return { ...state, userIds };
}

async function bindRoomUser(code: string, seat: Seat, userId: string | null): Promise<void> {
  if (!userId || !code) return;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  if (seat === 0) {
    await sql.query(
      `update darkness_rooms set host_user_id = coalesce(host_user_id, $1), updated_at = now() where code = $2`,
      [userId, code],
    );
  } else {
    await sql.query(
      `update darkness_rooms set guest_user_id = coalesce(guest_user_id, $1), updated_at = now() where code = $2`,
      [userId, code],
    );
  }
}

async function ensureHistoryColumns(sql: {
  query: <T>(text: string, params?: unknown[]) => Promise<T[]>;
}): Promise<void> {
  await sql.query("alter table darkness_results add column if not exists series0 integer");
  await sql.query("alter table darkness_results add column if not exists series1 integer");
  await sql.query("alter table darkness_results add column if not exists avatar0 text");
  await sql.query("alter table darkness_results add column if not exists avatar1 text");
  await sql.query("alter table darkness_results add column if not exists hist_gen integer");
  await sql.query("alter table darkness_results add column if not exists low0 integer");
  await sql.query("alter table darkness_results add column if not exists low1 integer");
  await sql.query("delete from darkness_results where coalesce(hist_gen, 0) < $1", [LOBBY_HISTORY_GEN]);
}

async function pruneLobbyHistory(sql: {
  query: <T>(text: string, params?: unknown[]) => Promise<T[]>;
}): Promise<void> {
  await sql.query(
    `with keep as (
       select code, nights
         from darkness_results
        where coalesce(hist_gen, 0) >= $1
        order by created_at desc, nights desc
        limit $2
     )
     delete from darkness_results
      where coalesce(hist_gen, 0) >= $1
        and not exists (
          select 1 from keep k
           where k.code = darkness_results.code and k.nights = darkness_results.nights
        )`,
    [LOBBY_HISTORY_GEN, LOBBY_HISTORY_KEEP],
  );
}

async function rememberResult(row: RoomRow, state: GameState): Promise<void> {
  const view = hostedMatchView(state);
  if (!view || !row.guest_token) return;
  const hostUser = row.host_user_id || view.userIds[0] || null;
  const guestUser = row.guest_user_id || view.userIds[1] || null;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureHistoryColumns(sql);
  const payload = [
    row.code,
    view.nights,
    view.kind,
    view.winner,
    view.scores[0],
    view.scores[1],
    view.lows[0],
    view.lows[1],
    view.series[0],
    view.series[1],
    view.names[0],
    view.names[1],
    view.avatars[0],
    view.avatars[1],
    hostUser,
    guestUser,
    row.host_token,
    row.guest_token,
  ];
  try {
    await sql.query(
      `insert into darkness_results (
         code, nights, kind, winner, score0, score1, low0, low1, series0, series1, name0, name1,
         avatar0, avatar1, host_user_id, guest_user_id, host_token, guest_token, hist_gen, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
       on conflict (code, nights) do update set
         winner = excluded.winner,
         score0 = excluded.score0,
         score1 = excluded.score1,
         low0 = excluded.low0,
         low1 = excluded.low1,
         series0 = excluded.series0,
         series1 = excluded.series1,
         name0 = excluded.name0,
         name1 = excluded.name1,
         avatar0 = coalesce(excluded.avatar0, darkness_results.avatar0),
         avatar1 = coalesce(excluded.avatar1, darkness_results.avatar1),
         host_user_id = coalesce(darkness_results.host_user_id, excluded.host_user_id),
         guest_user_id = coalesce(darkness_results.guest_user_id, excluded.guest_user_id),
         hist_gen = excluded.hist_gen,
         created_at = now()`,
      [...payload, LOBBY_HISTORY_GEN],
    );
    await pruneLobbyHistory(sql);
  } catch (err) {
    console.error("[darkness] rememberResult extended insert failed", err);
    await sql.query(
      `insert into darkness_results (
         code, nights, kind, winner, score0, score1, name0, name1,
         host_user_id, guest_user_id, host_token, guest_token, hist_gen
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (code, nights) do update set
         winner = excluded.winner,
         score0 = excluded.score0,
         score1 = excluded.score1,
         name0 = excluded.name0,
         name1 = excluded.name1,
         host_user_id = coalesce(darkness_results.host_user_id, excluded.host_user_id),
         guest_user_id = coalesce(darkness_results.guest_user_id, excluded.guest_user_id),
         hist_gen = excluded.hist_gen`,
      [
        row.code,
        view.nights,
        view.kind,
        view.winner,
        view.scores[0],
        view.scores[1],
        view.names[0],
        view.names[1],
        hostUser,
        guestUser,
        row.host_token,
        row.guest_token,
        LOBBY_HISTORY_GEN,
      ],
    );
    await pruneLobbyHistory(sql);
  }
  await recordMatchNews(sql, row, view, hostUser, guestUser);
}

async function recordMatchNews(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  row: RoomRow,
  view: NonNullable<ReturnType<typeof hostedMatchView>>,
  hostUser: string | null,
  guestUser: string | null,
): Promise<void> {
  try {
    const { recordNewsSafe, formatNewsScore } = await import("./news.server");
    const win = view.winner;
    const lose: 0 | 1 = win === 0 ? 1 : 0;
    const faces =
      win === 0 || win === 1
        ? [
            { name: clipDisplayName(view.names[win]) || view.names[win] || "GM", avatarId: view.avatars[win], userId: win === 0 ? hostUser : guestUser },
            { name: clipDisplayName(view.names[lose]) || view.names[lose] || "GM", avatarId: view.avatars[lose], userId: lose === 0 ? hostUser : guestUser },
          ]
        : [
            { name: clipDisplayName(view.names[0]) || view.names[0] || "GM", avatarId: view.avatars[0], userId: hostUser },
            { name: clipDisplayName(view.names[1]) || view.names[1] || "GM", avatarId: view.avatars[1], userId: guestUser },
          ];
    const a = win === 0 || win === 1 ? view.scores[win] : view.scores[0];
    const b = win === 0 || win === 1 ? view.scores[lose] : view.scores[1];
    await recordNewsSafe(sql, {
      sourceKey: `match:${row.code}:${view.nights}`,
      payload: {
        kind: "match",
        faces,
        score: `${formatNewsScore(a)}–${formatNewsScore(b)}`,
      },
    });
  } catch (err) {
    console.error("[darkness] match news failed", err);
  }
}

/** Save the finished night into lobby history while the room is still on results. */
export async function rememberLiveResult(code: string, token: string): Promise<void> {
  const clipped = clipCode(code);
  if (!clipped || !token) return;
  const row = await loadRoom(clipped);
  if (!row?.guest_token) return;
  if (seatForToken(row, token) === null) return;
  await creditRoom(row, null, null);
}

async function creditRoom(row: RoomRow, seat: Seat | null, knownId?: string | null): Promise<void> {
  try {
    if (!row.guest_token) return;
    let state = parseState(row.state);
    if (state.phase !== "results") return;
    if (seat === 0 || seat === 1) {
      state = await stampSeatUser(state, seat, knownId);
      const id = state.userIds?.[seat] ?? knownId ?? null;
      await bindRoomUser(row.code, seat, id);
      if (seat === 0) row = { ...row, host_user_id: row.host_user_id || id };
      else row = { ...row, guest_user_id: row.guest_user_id || id };
    }
    const userIds: [string | null, string | null] = [
      row.host_user_id || state.userIds?.[0] || null,
      row.guest_user_id || state.userIds?.[1] || null,
    ];
    state = { ...state, userIds };
    try {
      await rememberResult(row, state);
    } catch (err) {
      console.error("[darkness] rememberResult failed", err);
    }
    const { creditHostedMatch } = await import("./stats.server");
    await creditHostedMatch(state, row.code, userIds);
  } catch (err) {
    console.error("[darkness] creditRoom failed", err);
  }
}

function seatForToken(row: RoomRow, token: string): Seat | null {
  if (token && token === row.host_token) return 0;
  if (token && row.guest_token && token === row.guest_token) return 1;
  return null;
}

export async function hostedResultForToken(code: string, token: string): Promise<{
  code: string;
  seat: Seat;
  names: [string, string];
  kind: "auction" | "elimination";
  won: boolean | null;
  score: number;
  opponentScore: number;
  lowScore: number;
  nights: number;
} | null> {
  const clipped = clipCode(code);
  const row = await loadRoom(clipped);
  if (row?.guest_token) {
    const seat = seatForToken(row, token);
    if (seat !== null) {
      const view = hostedMatchView(parseState(row.state));
      if (view) {
        const other: Seat = seat === 0 ? 1 : 0;
        return {
          code: row.code,
          seat,
          names: view.names,
          kind: view.kind,
          won: view.winner == null ? null : view.winner === seat,
          score: view.scores[seat],
          opponentScore: view.scores[other],
          lowScore: view.lows[seat],
          nights: view.nights,
        };
      }
    }
  }
  return archivedResultForToken(clipped, token);
}

async function archivedResultForToken(code: string, token: string): Promise<{
  code: string;
  seat: Seat;
  names: [string, string];
  kind: "auction" | "elimination";
  won: boolean | null;
  score: number;
  opponentScore: number;
  lowScore: number;
  nights: number;
} | null> {
  if (!code || !token) return null;
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureHistoryColumns(sql);
    const rows = await sql.query<{
      code: string;
      nights: number;
      kind: string;
      winner: number | null;
      score0: number;
      score1: number;
      low0: number | string | null;
      low1: number | string | null;
      name0: string;
      name1: string;
      host_token: string;
      guest_token: string;
    }>(
      `select code, nights, kind, winner, score0, score1, low0, low1, name0, name1, host_token, guest_token
         from darkness_results
        where code = $1 and (host_token = $2 or guest_token = $2)
        order by nights desc
        limit 1`,
      [code, token],
    );
    const row = rows[0];
    if (!row) return null;
    const seat: Seat = token === row.host_token ? 0 : 1;
    const other: Seat = seat === 0 ? 1 : 0;
    const scores: [number, number] = [Number(row.score0) || 0, Number(row.score1) || 0];
    const lows: [number, number] = [
      row.low0 == null ? scores[0] : Number(row.low0) || 0,
      row.low1 == null ? scores[1] : Number(row.low1) || 0,
    ];
    const winner = row.winner === 0 || row.winner === 1 ? (row.winner as Seat) : null;
    return {
      code: row.code,
      seat,
      names: [row.name0, row.name1],
      kind: row.kind === "elimination" ? "elimination" : "auction",
      won: winner == null ? null : winner === seat,
      score: scores[seat],
      opponentScore: scores[other],
      lowScore: lows[seat],
      nights: Number(row.nights) || 0,
    };
  } catch {
    return null;
  }
}

export async function hostNightHandler({ data, context }: { data: { name: string; avatarId: AvatarId; kind: GameKind; publicJoin: boolean }; context: { userId: string | null } }): Promise<RoomView> {
    const ident = await seatedIdentity(data.avatarId, context.userId);
    const name = clipDisplayName(data.name) || ident.displayName || "GM";
    await persistDisplayName(ident.userId, name);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const token = randomToken();
    const kind = data.kind as GameKind;
    const state = lobbyState(name, ident.avatarId, ident.userId, kind, data.publicJoin);
    for (let i = 0; i < 8; i++) {
      const code = randomCode();
      try {
        await sql.query(
          "insert into darkness_rooms (code, state, host_token, host_user_id, version) values ($1, $2::jsonb, $3, $4, 0)",
          [code, JSON.stringify(state), token, ident.userId],
        );
        return { ok: true, code, seat: 0, token, version: 0, state, filled: false };
      } catch {
        /* collision, retry */
      }
    }
    throw new Error("Could not open a night");
}

export async function joinNightHandler({ data, context }: { data: { code: string; name: string; avatarId: AvatarId }; context: { userId: string | null } }): Promise<RoomResult> {
    const row = await loadRoom(data.code);
    if (!row) return { ok: false, error: "No night with that code." };
    const state = parseState(row.state);
    if (row.guest_token) {
      return { ok: false, error: "That night already has two GMs." };
    }
    if (state.phase !== "lobby") {
      return { ok: false, error: "That night already started." };
    }
    const ident = await seatedIdentity(data.avatarId, context.userId);
    const name = clipDisplayName(data.name) || ident.displayName || "GM";
    await persistDisplayName(ident.userId, name);
    const guestToken = randomToken();
    const carry = {
      avatars: [state.avatars?.[0] ?? "poor", ident.avatarId] as [AvatarId, AvatarId],
      userIds: [state.userIds?.[0] ?? null, ident.userId] as [string | null, string | null],
      elimEra: state.elimEra ?? "modern",
      chat: state.chat ?? [],
      publicJoin: Boolean(state.publicJoin),
    };
    const next =
      state.kind === "elimination"
        ? elimBriefing(state.names[0] || "Home", name, carry)
        : startAuction(state.names[0] || "Home", name, carry);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const updated = await sql.query<RoomRow>(
      `update darkness_rooms
       set state = $1::jsonb, guest_token = $2, guest_user_id = $3, version = version + 1, updated_at = now()
       where code = $4 and guest_token is null
       returning code, state, host_token, guest_token, version, created_at, host_user_id, guest_user_id`,
      [JSON.stringify(next), guestToken, ident.userId, data.code],
    );
    const saved = updated[0];
    if (!saved) return { ok: false, error: "That night already has two GMs." };
    return view(saved, 1, guestToken);
}

export async function syncNightHandler({ data, context }: { data: { code: string; token: string }; context: { userId: string | null } }): Promise<RoomResult> {
    const row = await loadRoom(data.code);
    if (!row) return { ok: false, error: "This night ended." };
    const seat = seatForToken(row, data.token);
    if (seat === null) return { ok: false, error: "This night ended." };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const touched = asDate(row.updated_at ?? row.created_at);
    if (Date.now() - touched > 2500) {
      await sql.query("update darkness_rooms set updated_at = now() where code = $1", [data.code]);
    }
    await creditRoom(row, seat, context.userId);
    return view(row, seat, data.token);
}

export async function watchNightHandler({ data, context }: { data: { code: string; claim: boolean }; context: { userId: string | null } }): Promise<WatchResult> {
    const row = await loadRoom(data.code);
    if (!row) return { ok: false, error: "This night ended." };
    if (!row.guest_token) return { ok: false, error: "That night hasn't started." };
    const state = redactHalftime(parseState(row.state));
    if (
      data.claim &&
      context.userId &&
      row.host_user_id !== context.userId &&
      row.guest_user_id !== context.userId
    ) {
      try {
        const { getSql } = await import("@/lib/db");
        const { grantPeeping } = await import("./stats.server");
        await grantPeeping(await getSql(), context.userId);
      } catch (err) {
        console.error("[darkness] peeping grant failed", err);
      }
    }
    return {
      ok: true,
      code: row.code,
      version: Number(row.version) || 0,
      state,
      filled: true,
    };
}

export async function actNightHandler({ data, context }: { data: { code: string; token: string; version: number; action: GameAction }; context: { userId: string | null } }): Promise<RoomResult> {
    const row = await loadRoom(data.code);
    if (!row) return { ok: false, error: "This night ended." };
    const seat = seatForToken(row, data.token);
    if (seat === null) return { ok: false, error: "This night ended." };
    const current = parseState(row.state);
    if (current.phase === "results") {
      await creditRoom(row, seat, context.userId);
    }
    let next = applyAction(current, data.action, seat);
    next = await stampSeatUser(next, seat, context.userId);
    if (context.userId) await bindRoomUser(data.code, seat, context.userId);
    if (next === current) {
      await creditRoom(row, seat, context.userId);
      return view(row, seat, data.token);
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const updated = await sql.query<RoomRow>(
      `update darkness_rooms
       set state = $1::jsonb, version = version + 1, updated_at = now()
       where code = $2 and version = $3
       returning code, state, host_token, guest_token, version, created_at, host_user_id, guest_user_id`,
      [JSON.stringify(next), data.code, data.version],
    );
    const saved = updated[0];
    if (!saved) {
      const fresh = await loadRoom(data.code);
      if (!fresh) return { ok: false, error: "This night ended." };
      await creditRoom(fresh, seat, context.userId);
      return view(fresh, seat, data.token);
    }
    await creditRoom(saved, seat, context.userId);
    return view(saved, seat, data.token);
}

export async function leaveNightHandler({ data, context }: { data: { code: string; token: string }; context: { userId: string | null } }): Promise<{ ok: true }> {
    const row = await loadRoom(data.code);
    if (!row) return { ok: true };
    const seat = seatForToken(row, data.token);
    await creditRoom(row, seat, context.userId);
    if (data.token !== row.host_token) return { ok: true };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query("delete from darkness_rooms where code = $1", [data.code]);
    return { ok: true };
}

export async function listLobbiesHandler(): Promise<LobbyListing[]> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `delete from darkness_rooms
        where (guest_token is null and (state->>'phase') = 'lobby' and updated_at < now() - interval '20 seconds')
           or (updated_at < now() - interval '5 minutes' and coalesce(state->>'phase','') <> 'results')`,
    );
    const rows = await sql.query<RoomRow>(
      "select code, state, guest_token, created_at, updated_at from darkness_rooms order by updated_at desc limit 50",
    );
    const now = Date.now();
    const listings: LobbyListing[] = [];
    for (const row of rows) {
      const idle = now - asDate(row.updated_at ?? row.created_at);
      const waiting = !row.guest_token && parseState(row.state).phase === "lobby";
      if (waiting && idle > LOBBY_WAIT_MS) continue;
      if (idle > LOBBY_PLAY_MS) continue;
      const listing = listingFromRoom(row.code, parseState(row.state), row.guest_token);
      if (listing) listings.push(listing);
    }
    listings.sort((a, b) => Number(b.open) - Number(a.open) || a.host.localeCompare(b.host));
    return listings;
  } catch (err) {
    console.error("[darkness] listLobbies failed", err);
    return [];
  }
}

export async function listMatchHistoryHandler(): Promise<MatchHistoryRow[]> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureHistoryColumns(sql);
    const rows = await sql.query<{
      code: string;
      nights: number;
      kind: string;
      winner: number | null;
      score0: number;
      score1: number;
      series0: number | null;
      series1: number | null;
      name0: string;
      name1: string;
      avatar0: string | null;
      avatar1: string | null;
      host_avatar: string | null;
      guest_avatar: string | null;
    }>(
      `select r.code, r.nights, r.kind, r.winner, r.score0, r.score1,
              r.series0, r.series1, r.name0, r.name1, r.avatar0, r.avatar1,
              p0.avatar_id as host_avatar, p1.avatar_id as guest_avatar
         from darkness_results r
         left join player_profiles p0 on p0.user_id = r.host_user_id
         left join player_profiles p1 on p1.user_id = r.guest_user_id
        where coalesce(r.hist_gen, 0) >= $1
        order by r.created_at desc, r.nights desc
        limit $2`,
      [LOBBY_HISTORY_GEN, LOBBY_HISTORY_KEEP],
    );
    return rows.map((row) => {
      const kind = row.kind === "elimination" ? "elimination" : "auction";
      const winner = row.winner === 0 || row.winner === 1 ? (row.winner as 0 | 1) : null;
      return {
        code: row.code,
        nights: Number(row.nights) || 0,
        kind,
        winner,
        names: [clipDisplayName(row.name0) || "GM", clipDisplayName(row.name1) || "GM"],
        avatars: [
          clampAvatar(row.avatar0 || row.host_avatar || "poor"),
          clampAvatar(row.avatar1 || row.guest_avatar || "poor"),
        ],
        series: historyLineScore(
          kind,
          winner,
          Number(row.score0) || 0,
          Number(row.score1) || 0,
          row.series0 == null ? null : Number(row.series0),
          row.series1 == null ? null : Number(row.series1),
        ),
      };
    });
  } catch (err) {
    console.error("[darkness] listMatchHistory failed", err);
    return [];
  }
}
