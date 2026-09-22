/** Hosted night writes. Move-only from stats.server. */
import { clipDisplayName, clipGm, hostedNightKey, opponentKey, planHostedNightWrite } from "../stats-shared";
import { hostedMatchView } from "../hosted-match";
import type { GameState } from "../engine";
import type { RecordNightInput } from "../stats-types";
import { asInt } from "./shared";

export function normalizeRecordNight(data: RecordNightInput) {
  return {
    nightKey: String(data.nightKey ?? "").slice(0, 240),
    opponentName: clipGm(String(data.opponentName ?? "")),
    gmName: clipDisplayName(String(data.gmName ?? "")),
    won: data.won === true ? true : data.won === false ? false : null,
    score: Math.floor(Number(data.score) || 0),
    opponentScore: Math.floor(Number(data.opponentScore) || 0),
    lowScore: Math.floor(Number(data.lowScore) || 0),
    kind: data.kind === "elimination" ? "elimination" as const : "auction" as const,
    roomCode: String(data.roomCode ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6),
    token: String(data.token ?? ""),
    seat: data.seat === 1 ? 1 as const : 0 as const,
    nights: Math.max(0, Math.floor(Number(data.nights) || 0)),
  };
}

export async function recordNightHandler({ context, data }: { context: { userId: string }; data: ReturnType<typeof normalizeRecordNight> }) {
    if (!data.roomCode || !data.token) return { ok: false as const };
    let hosted: {
      code: string;
      seat: 0 | 1;
      names: [string, string];
      kind: "auction" | "elimination";
      won: boolean | null;
      score: number;
      opponentScore: number;
      lowScore: number;
      nights: number;
    } | null = null;
    try {
      const { hostedResultForToken } = await import("@/lib/game/rooms.server");
      hosted = await hostedResultForToken(data.roomCode, data.token);
    } catch {
      hosted = null;
    }
    const planned = planHostedNightWrite(
      {
        ...data,
        seat: data.seat === 1 ? 1 : 0,
        kind: data.kind === "elimination" ? "elimination" : "auction",
      },
      hosted,
    );
    if (!planned) return { ok: false as const };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await writePlayerNight(sql, context.userId, planned);
    if (planned.gmName) {
      await sql.query(
        `insert into player_profiles (user_id, avatar_id, display_name, updated_at)
         values ($1, 'poor', $2, now())
         on conflict (user_id) do update
           set display_name = excluded.display_name, updated_at = now()`,
        [context.userId, planned.gmName],
      );
    }
    const { settleProfile } = await import("./profile");
    await settleProfile(sql, context.userId);
    try {
      const { rememberLiveResult } = await import("@/lib/game/rooms.server");
      await rememberLiveResult(data.roomCode, data.token);
    } catch (err) {
      console.error("[darkness] rememberLiveResult failed", err);
    }
    return { ok: true as const };
}

export async function creditHostedMatch(
  state: GameState,
  code: string,
  overlayIds?: [string | null, string | null],
): Promise<void> {
  const view = hostedMatchView(state);
  if (!view || !code) return;
  const userIds: [string | null, string | null] = [
    overlayIds?.[0] || view.userIds[0],
    overlayIds?.[1] || view.userIds[1],
  ];
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  for (const seat of [0, 1] as const) {
    const userId = userIds[seat];
    if (!userId) continue;
    const other = seat === 0 ? 1 : 0;
    const opponentName = clipGm(view.names[other]);
    const gmName = clipDisplayName(view.names[seat]);
    const nightKey = hostedNightKey(code, view.nights, view.kind, seat);
    const won = view.winner == null ? null : view.winner === seat;
    await writePlayerNight(sql, userId, {
      nightKey,
      opponentName,
      won,
      score: view.scores[seat],
      opponentScore: view.scores[other],
      lowScore: view.lows[seat],
      kind: view.kind,
    });
    if (gmName) {
      await sql.query(
        `insert into player_profiles (user_id, avatar_id, display_name, updated_at)
         values ($1, 'poor', $2, now())
         on conflict (user_id) do update
           set display_name = excluded.display_name, updated_at = now()`,
        [userId, gmName],
      );
    }
    const { settleProfile } = await import("./profile");
    await settleProfile(sql, userId);
  }
}

export async function ensureNightLowScore(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }) {
  try {
    await sql.query("alter table player_nights add column if not exists low_score integer");
  } catch {
    /* ignore */
  }
}

async function writePlayerNight(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  planned: {
    nightKey: string;
    opponentName: string;
    won: boolean | null;
    score: number;
    opponentScore: number;
    lowScore?: number;
    kind: "auction" | "elimination";
  },
) {
  await ensureNightLowScore(sql);
  const low = Math.min(asInt(planned.lowScore ?? planned.score), asInt(planned.score));
  await sql.query(
    `insert into player_nights
       (user_id, night_key, opponent_name, opponent_key, won, score, opponent_score, low_score, kind)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (user_id, night_key) do update set
       won = excluded.won,
       score = excluded.score,
       opponent_score = excluded.opponent_score,
       low_score = excluded.low_score,
       opponent_name = excluded.opponent_name,
       opponent_key = excluded.opponent_key,
       kind = excluded.kind`,
    [
      userId,
      planned.nightKey,
      planned.opponentName,
      opponentKey(planned.opponentName),
      planned.won,
      planned.score,
      planned.opponentScore,
      low,
      planned.kind,
    ],
  );
}

/** Name is not a bank. Drop invented Commish nights; never pad wins or coins. */
export async function keepCommishBook(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  _displayName: string,
  _authName: string,
) {
  await sql.query(
    `delete from player_nights
      where user_id = $1
        and (night_key like 'official:commish:%' or night_key like 'bonus-win:%')`,
    [userId],
  );
}

export async function backfillHostedNights(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  displayName: string,
) {
  type ResultRow = {
    code: string;
    nights: number | string;
    kind: string | null;
    winner: number | string | null;
    score0: number | string;
    score1: number | string;
    name0: string | null;
    name1: string | null;
    host_user_id: string | null;
    guest_user_id: string | null;
  };
  let rows: ResultRow[] = [];
  try {
    rows = await sql.query<ResultRow>(
      `select code, nights, kind, winner, score0, score1, name0, name1, host_user_id, guest_user_id
         from darkness_results
        where host_user_id = $1
           or guest_user_id = $1
           or (
             $2 <> ''
             and (
               (host_user_id is null and lower(trim(name0)) = $2)
               or (guest_user_id is null and lower(trim(name1)) = $2)
             )
           )`,
      [userId, displayName.trim().toLowerCase()],
    );
  } catch {
    return;
  }
  for (const row of rows) {
    const host = Boolean(row.host_user_id === userId || (!row.host_user_id && displayName.trim().toLowerCase() === String(row.name0 ?? "").trim().toLowerCase()));
    const guest = Boolean(row.guest_user_id === userId || (!row.guest_user_id && displayName.trim().toLowerCase() === String(row.name1 ?? "").trim().toLowerCase()));
    const seats: (0 | 1)[] = [];
    if (host) seats.push(0);
    if (guest) seats.push(1);
    const kind = row.kind === "elimination" ? "elimination" : "auction";
    const winner = row.winner == null || row.winner === "" ? null : asInt(row.winner);
    const nights = asInt(row.nights);
    for (const seat of seats) {
      const other = seat === 0 ? 1 : 0;
      const opponentName = clipGm(String((seat === 0 ? row.name1 : row.name0) ?? ""));
      const won = winner == null ? null : winner === seat;
      await sql.query(
        `insert into player_nights
           (user_id, night_key, opponent_name, opponent_key, won, score, opponent_score, kind)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, night_key) do update set
           won = excluded.won,
           score = excluded.score,
           opponent_score = excluded.opponent_score,
           opponent_name = excluded.opponent_name,
           opponent_key = excluded.opponent_key,
           kind = excluded.kind`,
        [
          userId,
          hostedNightKey(String(row.code), nights, kind, seat),
          opponentName,
          opponentKey(opponentName),
          won,
          asInt(seat === 0 ? row.score0 : row.score1),
          asInt(seat === 0 ? row.score1 : row.score0),
          kind,
        ],
      );
    }
  }
}

