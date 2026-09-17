/** Server-only career / store / board writes. Do not import from client modules. */
import { clampAvatar, isAvatarId, isFeatAvatar, isStarAvatar, longestDayStreak, parseOwned, pickPrize, silverSecondDayCount, sniperWeekHit, starLooksFor, walletBalance, BANANA_ID, BANANA_SCORE_UNDER, BOX_ADDICT_ID, BOX_COST, CLUB_200, CLUB_200_CAP, CLUB_200_ID, CROSSWORD_ID, CROSSWORD_STREAK_NEED, GOLDEN_COST, LOCKED_IN_ID, LOCKED_IN_STREAK_NEED, PEEPING_ID, SILVER_MEDAL_ID, SILVER_SECOND_NEED, SNIPER_ID, THANOS_ID, THANOS_OWN_NEED, WIN_PAY, hitBananaScore, hitBoxAddict, justUnlockedBanana, type AvatarId } from "./avatars";
import { clipDisplayName, clipGm, hiddenBoardIdSql, hiddenBoardNameSql, hostedNightKey, isHiddenBoardId, isHiddenBoardName, opponentKey, planHostedNightWrite } from "./stats-shared";
import { hostedMatchView } from "./hosted-match";
import { DAILY_PAY } from "./daily";
import { WEEKLY_PAY, WEEKLY_WIN_PAY, WEEKLY_WIN_STARS } from "./weekly";
import { countPayoutStars, countScratchCoins, syncDailyStarsFromPayouts } from "./payouts";
import type { GameState } from "./engine";
import type { BoardRow, BookSlice, BoxResult, CareerBook, CareerOpponent, Leaderboard, PublicBook, RecordNightInput, ShopResult } from "./stats-types";
export type { BoxResult, BoardRow, BookSlice, CareerBook, CareerOpponent, Leaderboard, PublicBook, ShopResult } from "./stats-types";


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

const emptyOpponents = (): CareerBook["opponentsBy"] => ({
  total: [],
  auction: [],
  elimination: [],
});

const emptyBook = (): CareerBook => ({
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  highest: null,
  lowest: null,
  opponents: [],
  total: emptySlice(),
  auction: emptySlice(),
  elimination: emptySlice(),
  opponentsBy: emptyOpponents(),
  avatarId: "poor",
  displayName: "",
  coins: 0,
  owned: ["poor"],
  dailyStars: 0,
  scratchBank: 0,
  scratchReady: 0,
});

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
    await settleProfile(sql, userId);
  }
}

type TotalsRow = {
  games: number | string;
  wins: number | string;
  losses: number | string;
  ties: number | string;
  highest: number | string | null;
  lowest: number | string | null;
};

type OppRow = {
  name: string;
  games: number | string;
  wins: number | string;
  losses: number | string;
  ties: number | string;
};

function asInt(value: number | string | null | undefined): number {
  return Math.floor(Number(value) || 0);
}

async function ensureNightLowScore(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }) {
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

async function earnedChallenge(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<{ credit: number; stars: number }> {
  let credit = 0;
  let stars = 0;
  try {
    const daily = await sql.query<{ score: number | string; win: number | string }>(
      `select
         count(*) filter (where payout_score is true)::int as score,
         count(*) filter (where payout_win is true)::int as win
       from darkness_daily_runs
      where user_id = $1`,
      [userId],
    );
    const scorePays = asInt(daily[0]?.score);
    const winPays = asInt(daily[0]?.win);
    credit += scorePays * DAILY_PAY + winPays * DAILY_PAY;
    stars += winPays;
  } catch {
    /* daily tables may not exist yet */
  }
  try {
    const weekly = await sql.query<{ score: number | string; win: number | string }>(
      `select
         count(*) filter (where payout_score is true)::int as score,
         count(*) filter (where payout_win is true)::int as win
       from darkness_weekly_runs
      where user_id = $1`,
      [userId],
    );
    const scorePays = asInt(weekly[0]?.score);
    const winPays = asInt(weekly[0]?.win);
    credit += scorePays * WEEKLY_PAY + winPays * WEEKLY_WIN_PAY;
    stars += winPays * WEEKLY_WIN_STARS;
  } catch {
    /* weekly tables may not exist yet */
  }
  return { credit, stars };
}

async function hasDailyRun(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ ok: number | string }>(
      `select 1 as ok from darkness_daily_runs where user_id = $1 limit 1`,
      [userId],
    );
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

type ProfileRow = {
  avatar_id: string | null;
  display_name: string | null;
  coins: number | string | null;
  coin_wins: number | string | null;
  owned: string | null;
  credit: number | string | null;
  closet_reset: number | string | null;
  daily_stars?: number | string | null;
  box_forgive?: number | string | null;
  seed_lock?: number | string | null;
  career_book?: unknown;
  box_opens?: number | string | null;
};

const TESTER_NAMES = new Set(["pat", "pastry pat", "ty"]);
const GIFT_LOOKS: Record<string, AvatarId[]> = {
  pat: [PEEPING_ID],
  "pastry pat": [PEEPING_ID],
  heisenberg: [PEEPING_ID],
  "marquis scott": ["birthday", PEEPING_ID],
};
const CLOSET_RESET_GEN = 2;
const TY_RETURN_GEN = 3;
const RETURN_BOX_GEN = 4;
const TY_RETURN_IDS = new Set(["holy", "holy-red", "holy-blue", "gladiator"]);
const RETURN_BOX_IDS = new Set(["holy", "holy-red", "holy-blue", "pirate", "ninja", "cyborg", "zombie", "chef"]);

function isTester(name: string): boolean {
  return TESTER_NAMES.has(name.trim().toLowerCase());
}

function giftLooksFor(name: string): AvatarId[] {
  const key = name.trim().toLowerCase();
  if (GIFT_LOOKS[key]) return GIFT_LOOKS[key]!;
  if (key === "marquis" || key.startsWith("marquis ")) return ["birthday", PEEPING_ID];
  return [];
}

async function pushGifts(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }) {
  const gifted = await sql.query<{ user_id: string }>(
    `select p.user_id
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where lower(trim(coalesce(p.display_name, ''))) in ('marquis scott', 'marquis', 'pat', 'pastry pat', 'heisenberg')
         or lower(trim(coalesce(u.name, ''))) in ('marquis scott', 'marquis', 'pat', 'pastry pat', 'heisenberg')
         or lower(trim(coalesce(p.display_name, ''))) like 'marquis %'
         or lower(trim(coalesce(u.name, ''))) like 'marquis %'`,
  );
  const starred = await sql.query<{ user_id: string }>(
    `select user_id from player_profiles where coalesce(daily_stars, 0) >= 1`,
  );
  let club: { user_id: string }[] = [];
  try {
    club = await sql.query<{ user_id: string }>(
      `select user_id from player_nights
        where coalesce(kind, 'auction') = 'elimination'
          and night_key not like 'bonus-win:%'
          and score > $1 and score <= $2
        union
        select user_id from darkness_daily_runs
         where status = 'done' and score > $1 and score <= $2
        union
        select user_id from player_profiles
         where owned::text like '%club200%'`,
      [CLUB_200, CLUB_200_CAP],
    );
  } catch {
    club = await sql.query<{ user_id: string }>(
      `select user_id from player_nights
        where coalesce(kind, 'auction') = 'elimination'
          and night_key not like 'bonus-win:%'
          and score > $1 and score <= $2
        union
        select user_id from player_profiles
         where owned::text like '%club200%'`,
      [CLUB_200, CLUB_200_CAP],
    );
  }
  const ids = new Set([...gifted, ...starred, ...club].map((row) => row.user_id));
  try {
    const everyone = await sql.query<{ user_id: string }>(`select user_id from player_profiles`);
    for (const row of everyone) ids.add(row.user_id);
  } catch {
    /* ignore */
  }
  for (const id of ids) await settleProfile(sql, id);
}

/** Name is not a bank. Drop invented Commish nights; never pad wins or coins. */
async function keepCommishBook(
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

async function backfillHostedNights(
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

function isTy(name: string): boolean {
  return name.trim().toLowerCase() === "ty";
}

async function hitBanana(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ score: number | string | null }>(
      `select score
         from darkness_daily_runs
        where user_id = $1
          and status = 'done'
          and score is not null
        order by score asc
        limit 1`,
      [userId],
    );
    const score = rows[0]?.score;
    if (score == null) return false;
    return hitBananaScore(Number(score));
  } catch {
    return false;
  }
}

async function hitCrossword(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ day: string }>(
      `select distinct day::text as day
         from darkness_daily_runs
        where user_id = $1 and status = 'done'
        order by 1`,
      [userId],
    );
    return longestDayStreak(rows.map((row) => row.day.slice(0, 10))) >= CROSSWORD_STREAK_NEED;
  } catch {
    return false;
  }
}

async function hitLockedIn(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ day: string }>(
      `select distinct day::text as day
         from darkness_daily_runs
        where user_id = $1 and status = 'done'
        order by 1`,
      [userId],
    );
    return longestDayStreak(rows.map((row) => row.day.slice(0, 10))) >= LOCKED_IN_STREAK_NEED;
  } catch {
    return false;
  }
}

async function hitSniper(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ season: number | string; week: number | string; user_id: string; score: number | string }>(
      `select r.season, r.week, r.user_id, r.score
         from darkness_weekly_weeks w
         join darkness_weekly_runs r
           on r.season = w.season and r.week = w.week
        where w.awarded is true
          and r.status = 'done'
          and r.score is not null`,
    );
    const byWeek = new Map<string, { userId: string; score: number }[]>();
    for (const row of rows) {
      const key = `${row.season}-${row.week}`;
      const list = byWeek.get(key) ?? [];
      list.push({ userId: row.user_id, score: Number(row.score) || 0 });
      byWeek.set(key, list);
    }
    for (const list of byWeek.values()) {
      if (sniperWeekHit(list, userId)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function hitSilver(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  try {
    const rows = await sql.query<{ day: string; user_id: string; score: number | string }>(
      `select day::text as day, user_id, score
         from darkness_daily_runs
        where status = 'done' and score is not null`,
    );
    return (
      silverSecondDayCount(
        rows.map((row) => ({ day: String(row.day).slice(0, 10), userId: row.user_id, score: Number(row.score) || 0 })),
        userId,
      ) >= SILVER_SECOND_NEED
    );
  } catch {
    return false;
  }
}

async function grantEarnedFeats(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  owned: AvatarId[],
): Promise<AvatarId[]> {
  const add: AvatarId[] = [];
  if (!owned.includes(BANANA_ID) && (await hitBanana(sql, userId))) add.push(BANANA_ID);
  if (!owned.includes(CROSSWORD_ID) && (await hitCrossword(sql, userId))) add.push(CROSSWORD_ID);
  if (!owned.includes(LOCKED_IN_ID) && (await hitLockedIn(sql, userId))) add.push(LOCKED_IN_ID);
  if (!owned.includes(SNIPER_ID) && (await hitSniper(sql, userId))) add.push(SNIPER_ID);
  if (!owned.includes(SILVER_MEDAL_ID) && (await hitSilver(sql, userId))) add.push(SILVER_MEDAL_ID);
  const unique = new Set(owned).size;
  if (!owned.includes(THANOS_ID) && unique >= THANOS_OWN_NEED) add.push(THANOS_ID);
  if (!owned.includes(BOX_ADDICT_ID) && hitBoxAddict(owned)) add.push(BOX_ADDICT_ID);
  if (!add.length) return owned;
  const next = [...owned, ...add];
  if (add.includes(BANANA_ID)) {
    await sql.query(`update player_profiles set owned = $1, avatar_id = $2, updated_at = now() where user_id = $3`, [
      JSON.stringify(next),
      BANANA_ID,
      userId,
    ]);
  } else {
    await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
      JSON.stringify(next),
      userId,
    ]);
  }
  return next;
}

async function grantBananaSweep(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }): Promise<void> {
  let rows: { user_id: string; owned: unknown }[] = [];
  try {
    rows = await sql.query(
      `select distinct p.user_id, p.owned
         from player_profiles p
         join darkness_daily_runs r on r.user_id = p.user_id
        where r.status = 'done'
          and r.score is not null
          and r.score < $1`,
      [BANANA_SCORE_UNDER],
    );
  } catch {
    return;
  }
  for (const row of rows) {
    const owned = parseOwned(row.owned);
    if (owned.includes(BANANA_ID)) continue;
    await grantEarnedFeats(sql, row.user_id, owned);
  }
}

async function grantBoxAddictSweep(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }): Promise<void> {
  let rows: { user_id: string; owned: unknown }[] = [];
  try {
    rows = await sql.query(`select user_id, owned from player_profiles`);
  } catch {
    return;
  }
  for (const row of rows) {
    const owned = parseOwned(row.owned);
    if (owned.includes(BOX_ADDICT_ID) || !hitBoxAddict(owned)) continue;
    await grantEarnedFeats(sql, row.user_id, owned);
  }
}

async function grantSeedClub200(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  owned: AvatarId[],
): Promise<AvatarId[]> {
  if (owned.includes(CLUB_200_ID)) return owned;
  if (!(await hitClub200(sql, userId))) return owned;
  const next = [...owned, CLUB_200_ID];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  return next;
}

async function hitClub200(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  const nights = await sql.query<{ ok: number | string }>(
    `select 1 as ok
       from player_nights
      where user_id = $1
        and coalesce(kind, 'auction') = 'elimination'
        and night_key not like 'bonus-win:%'
        and score > $2
        and score <= $3
      limit 1`,
    [userId, CLUB_200, CLUB_200_CAP],
  );
  if (nights[0]) return true;
  try {
    const daily = await sql.query<{ ok: number | string }>(
      `select 1 as ok
         from darkness_daily_runs
        where user_id = $1 and status = 'done' and score > $2 and score <= $3
        limit 1`,
      [userId, CLUB_200, CLUB_200_CAP],
    );
    return Boolean(daily[0]);
  } catch {
    return false;
  }
}

export async function grantPeeping(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  const settled = await settleProfile(sql, userId);
  if (settled.owned.includes(PEEPING_ID)) return false;
  const owned = [...settled.owned, PEEPING_ID];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(owned),
    userId,
  ]);
  return true;
}

function paidLooks(owned: readonly string[]): number {
  return owned.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
}

/** Append Daily Unlock looks the star count already earned. Never strips, never equips. */
export async function grantStarLooks(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  owned: AvatarId[],
  stars: number,
): Promise<AvatarId[]> {
  const missing = starLooksFor(stars).filter((id) => !owned.includes(id));
  if (!missing.length) return owned;
  const next = [...owned, ...missing];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  return next;
}

async function catchUpStarLooksAll(sql: {
  query: <T>(text: string, params?: unknown[]) => Promise<T[]>;
}): Promise<{ id: string; name: string; stars: number; added: AvatarId[] }[]> {
  const rows = await sql.query<{
    user_id: string;
    display_name: string | null;
    owned: unknown;
    daily_stars: number | string | null;
  }>(`select user_id, display_name, owned, coalesce(daily_stars, 0) as daily_stars from player_profiles`);
  const report: { id: string; name: string; stars: number; added: AvatarId[] }[] = [];
  for (const row of rows) {
    try {
      const owned = parseOwned(row.owned);
      const stars = Math.max(0, asInt(row.daily_stars));
      const missing = starLooksFor(stars).filter((id) => !owned.includes(id));
      if (!missing.length) continue;
      const next = [...owned, ...missing];
      await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
        JSON.stringify(next),
        row.user_id,
      ]);
      report.push({
        id: row.user_id,
        name: clipDisplayName(row.display_name ?? "") || "GM",
        stars,
        added: missing,
      });
    } catch {
      /* skip broken row */
    }
  }
  return report;
}

function careerDump(book: unknown): Record<string, unknown> {
  if (book && typeof book === "object" && !Array.isArray(book)) return { ...(book as Record<string, unknown>) };
  return {};
}

/** Seeded wallets: freeze dump closet/bank, skip gift/club/tester rewrites, apply live deltas only. */
async function settleSeededProfile(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  row: ProfileRow | undefined,
): Promise<{ coins: number; owned: AvatarId[]; avatarId: AvatarId; displayName: string; dailyStars: number }> {
  const owned = parseOwned(row?.owned);
  const displayName = clipDisplayName(row?.display_name ?? "");
  const dump = careerDump(row?.career_book);
  const seedOwned = Array.isArray(dump.owned) ? parseOwned(JSON.stringify(dump.owned)) : owned;
  const seedBank = dump.bank != null ? asInt(dump.bank as number | string) : asInt(row?.coins);
  const seedStars = dump.stars != null ? asInt(dump.stars as number | string) : asInt(row?.daily_stars);
  if (dump.bank == null || dump.stars == null || !Array.isArray(dump.owned)) {
    dump.bank = seedBank;
    dump.stars = seedStars;
    dump.owned = seedOwned;
    await sql.query(`update player_profiles set career_book = $1::jsonb, updated_at = now() where user_id = $2`, [
      JSON.stringify(dump),
      userId,
    ]);
  }
  const winsRow = await sql.query<{ wins: number | string }>(
    `select count(*) filter (where won is true)::int as wins from player_nights where user_id = $1`,
    [userId],
  );
  const earned = await earnedChallenge(sql, userId);
  const extraBoxes = Math.max(0, paidLooks(owned) - paidLooks(seedOwned));
  const extraGold = owned.includes("golden") && !seedOwned.includes("golden") ? 1 : 0;
  const scratchPay = await countScratchCoins(sql, userId);
  const coins = Math.max(
    0,
    seedBank + asInt(winsRow[0]?.wins) * WIN_PAY + earned.credit - extraBoxes * BOX_COST - extraGold * GOLDEN_COST + scratchPay,
  );
  const fromPayouts = await countPayoutStars(sql, userId);
  const liveStars = fromPayouts != null ? fromPayouts : Math.max(0, asInt(row?.daily_stars));
  if (fromPayouts != null && liveStars !== asInt(row?.daily_stars)) {
    await sql.query(`update player_profiles set daily_stars = $1, updated_at = now() where user_id = $2`, [
      liveStars,
      userId,
    ]);
  }
  let nextOwned = owned;
  nextOwned = await grantStarLooks(sql, userId, nextOwned, liveStars);
  nextOwned = await grantSeedClub200(sql, userId, nextOwned);
  nextOwned = await grantEarnedFeats(sql, userId, nextOwned);
  const beforeCoins = asInt(row?.coins);
  if (coins !== beforeCoins) {
    await sql.query(`update player_profiles set coins = $1, updated_at = now() where user_id = $2`, [coins, userId]);
    const { recordBankChange } = await import("./bank-watch");
    await recordBankChange(sql, userId, beforeCoins, coins);
  }
  const avatarId = justUnlockedBanana(owned, nextOwned)
    ? BANANA_ID
    : clampAvatar(row?.avatar_id ?? "poor", nextOwned);
  return { coins, owned: nextOwned, avatarId, displayName, dailyStars: liveStars };
}

export async function settleProfile(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<{ coins: number; owned: AvatarId[]; avatarId: AvatarId; displayName: string; dailyStars: number }> {
  await sql.query(
    `insert into player_profiles (user_id, avatar_id, coins, coin_wins, owned, updated_at)
     values ($1, 'poor', 0, 0, '["poor"]', now())
     on conflict (user_id) do nothing`,
    [userId],
  );
  try {
    await sql.query("alter table player_profiles add column if not exists box_forgive int not null default 0");
  } catch {
    /* ignore */
  }
  try {
    await sql.query("alter table player_profiles add column if not exists seed_lock int not null default 0");
    await sql.query("alter table player_profiles add column if not exists career_book jsonb");
    await sql.query("alter table player_profiles add column if not exists box_opens int not null default 0");
  } catch {
    /* ignore */
  }
  const rows = await sql.query<ProfileRow>(
    "select avatar_id, display_name, coins, coin_wins, owned, credit, closet_reset, daily_stars, box_forgive, seed_lock, career_book, box_opens from player_profiles where user_id = $1",
    [userId],
  );
  const row = rows[0];
  if (asInt(row?.seed_lock) >= 1) {
    return settleSeededProfile(sql, userId, row);
  }
  let owned = parseOwned(row?.owned);
  let displayName = clipDisplayName(row?.display_name ?? "");
  const auth = await sql.query<{ name: string | null }>(`select name from "user" where id = $1`, [userId]);
  const authName = clipDisplayName(auth[0]?.name ?? "");
  if (!displayName) displayName = authName;
  let credit = asInt(row?.credit);
  let boxForgive = asInt(row?.box_forgive);
  let avatarId = clampAvatar(row?.avatar_id ?? "poor", owned);
  if (
    (isTester(displayName) || isTester(authName)) &&
    asInt(row?.closet_reset) < CLOSET_RESET_GEN
  ) {
    owned = ["poor"];
    avatarId = "poor";
    await sql.query(
      `update player_profiles
          set owned = $1, avatar_id = 'poor', closet_reset = $2, updated_at = now()
        where user_id = $3`,
      [JSON.stringify(owned), CLOSET_RESET_GEN, userId],
    );
  }
  if ((isTy(displayName) || isTy(authName)) && asInt(row?.closet_reset) < TY_RETURN_GEN) {
    const next = owned.filter((id) => !TY_RETURN_IDS.has(id));
    if (!next.includes("poor")) next.unshift("poor");
    owned = next;
    if (TY_RETURN_IDS.has(avatarId)) avatarId = "poor";
    avatarId = clampAvatar(avatarId, owned);
    await sql.query(
      `update player_profiles
          set owned = $1, avatar_id = $2, closet_reset = $3, updated_at = now()
        where user_id = $4`,
      [JSON.stringify(owned), avatarId, TY_RETURN_GEN, userId],
    );
  }
  if (asInt(row?.closet_reset) < RETURN_BOX_GEN) {
    const taken = owned.filter((id) => RETURN_BOX_IDS.has(id));
    if (taken.length) {
      owned = owned.filter((id) => !RETURN_BOX_IDS.has(id));
      if (!owned.includes("poor")) owned.unshift("poor");
      if (RETURN_BOX_IDS.has(avatarId)) avatarId = "poor";
      avatarId = clampAvatar(avatarId, owned);
      const paid = taken.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
      boxForgive -= paid * BOX_COST;
    }
    await sql.query(
      `update player_profiles
          set owned = $1, avatar_id = $2, closet_reset = $3, box_forgive = $4, updated_at = now()
        where user_id = $5`,
      [JSON.stringify(owned), avatarId, RETURN_BOX_GEN, boxForgive, userId],
    );
  }
  await keepCommishBook(sql, userId, displayName, authName);
  await backfillHostedNights(sql, userId, displayName || authName);
  const gifts = [...new Set([...giftLooksFor(displayName), ...giftLooksFor(authName)])];
  const missing = gifts.filter((id) => !owned.includes(id));
  if (missing.length) {
    owned = [...owned, ...missing];
    await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
      JSON.stringify(owned),
      userId,
    ]);
  }
  const earned = await earnedChallenge(sql, userId);
  const fromPayouts = await countPayoutStars(sql, userId);
  const dailyStars = fromPayouts != null ? fromPayouts : Math.max(asInt(row?.daily_stars), earned.stars);
  owned = await grantStarLooks(sql, userId, owned, dailyStars);
  const clubHit = await hitClub200(sql, userId);
  if (clubHit && !owned.includes(CLUB_200_ID)) {
    owned = [...owned, CLUB_200_ID];
    await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
      JSON.stringify(owned),
      userId,
    ]);
  } else if (!clubHit && owned.includes(CLUB_200_ID)) {
    owned = owned.filter((id) => id !== CLUB_200_ID);
    if (avatarId === CLUB_200_ID) avatarId = "poor";
    await sql.query(
      `update player_profiles set owned = $1, avatar_id = $2, updated_at = now() where user_id = $3`,
      [JSON.stringify(owned), avatarId, userId],
    );
  }
  const beforeFeats = owned;
  owned = await grantEarnedFeats(sql, userId, owned);
  if (justUnlockedBanana(beforeFeats, owned)) avatarId = BANANA_ID;
  const winsRow = await sql.query<{ wins: number | string }>(
    `select count(*) filter (where won is true)::int as wins
     from player_nights where user_id = $1`,
    [userId],
  );
  const wins = asInt(winsRow[0]?.wins);
  const giftOffset =
    gifts.filter((id) => owned.includes(id) && !isFeatAvatar(id) && !isStarAvatar(id)).length * BOX_COST;
  credit = earned.credit + giftOffset + boxForgive;
  const scratchPay = await countScratchCoins(sql, userId);
  const coins = walletBalance(wins, owned, credit) + scratchPay;
  const beforeCoins = asInt(row?.coins);
  if (
    coins !== beforeCoins ||
    wins !== asInt(row?.coin_wins) ||
    credit !== asInt(row?.credit) ||
    dailyStars !== asInt(row?.daily_stars)
  ) {
    await sql.query(
      `update player_profiles
          set coins = $1, coin_wins = $2, credit = $3, daily_stars = $4, updated_at = now()
        where user_id = $5`,
      [coins, wins, credit, dailyStars, userId],
    );
    if (coins !== beforeCoins) {
      const { recordBankChange } = await import("./bank-watch");
      await recordBankChange(sql, userId, beforeCoins, coins);
    }
  }
  avatarId = clampAvatar(avatarId, owned);
  if (avatarId !== (row?.avatar_id ?? "poor")) {
    await sql.query(`update player_profiles set avatar_id = $1, updated_at = now() where user_id = $2`, [
      avatarId,
      userId,
    ]);
  }
  return { coins, owned, avatarId, displayName, dailyStars };
}

async function withScratchBook(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  book: Omit<CareerBook, "scratchBank" | "scratchReady">,
): Promise<CareerBook> {
  try {
    const { syncScratchBank } = await import("./scratch.server");
    const state = await syncScratchBank(sql, userId);
    return { ...book, scratchBank: state.bank, scratchReady: state.ready };
  } catch {
    return { ...book, scratchBank: 0, scratchReady: 0 };
  }
}

export async function getMyStatsHandler({ context }: { context: { userId: string } }): Promise<CareerBook> {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureNightLowScore(sql);
    try {
      await syncDailyStarsFromPayouts(sql);
      const report = await catchUpStarLooksAll(sql);
      if (report.length) {
        try {
          await sql.query(`
            create table if not exists darkness_commish_audit (
              id bigserial primary key,
              actor text not null,
              action text not null,
              detail jsonb not null default '{}'::jsonb,
              created_at timestamptz not null default now()
            )
          `);
          await sql.query(
            `insert into darkness_commish_audit (actor, action, detail) values ($1, $2, $3::jsonb)`,
            ["system", "star_look_catchup", JSON.stringify(report)],
          );
        } catch {
          /* audit is optional */
        }
      }
    } catch {
      /* still settle this user */
    }
    const totals = await sql.query<TotalsRow>(
      `select
         count(*)::int as games,
         count(*) filter (where won is true)::int as wins,
         count(*) filter (where won is false)::int as losses,
         count(*) filter (where won is null)::int as ties,
         max(score)::int as highest,
         min(coalesce(low_score, score))::int as lowest
       from player_nights
       where user_id = $1`,
      [context.userId],
    );
    const row = totals[0];
    const settled = await settleProfile(sql, context.userId);
    const seeded = await loadCareerBook(sql, context.userId);

    if (!row || asInt(row.games) === 0) {
      if (seeded) {
        return withScratchBook(sql, context.userId, {
          ...emptyBook(),
          ...seeded,
          games: seeded.total.games,
          wins: seeded.total.wins,
          losses: seeded.total.losses,
          ties: seeded.total.ties,
          highest: seeded.total.highest,
          lowest: seeded.total.lowest,
          ...settled,
        });
      }
      return withScratchBook(sql, context.userId, { ...emptyBook(), ...settled });
    }

    const byKind = await sql.query<TotalsRow & { kind: string | null }>(
      `select
         coalesce(kind, 'auction') as kind,
         count(*)::int as games,
         count(*) filter (where won is true)::int as wins,
         count(*) filter (where won is false)::int as losses,
         count(*) filter (where won is null)::int as ties,
         max(case when coalesce(kind, 'auction') = 'elimination' and score > 280 then null else score end)::int as highest,
         min(case when coalesce(kind, 'auction') = 'elimination' and coalesce(low_score, score) > 280 then null else coalesce(low_score, score) end)::int as lowest
       from player_nights
       where user_id = $1
       group by coalesce(kind, 'auction')`,
      [context.userId],
    );
    const { auction, elimination } = kindSlices(
      toSlice(byKind.find((slice) => slice.kind !== "elimination")),
      toSlice(byKind.find((slice) => slice.kind === "elimination")),
    );

    const opponents = await sql.query<OppRow>(
      `select
         (array_agg(opponent_name order by created_at desc))[1] as name,
         count(*)::int as games,
         count(*) filter (where won is true)::int as wins,
         count(*) filter (where won is false)::int as losses,
         count(*) filter (where won is null)::int as ties
       from player_nights
       where user_id = $1
       group by opponent_key
       order by count(*) desc, max(created_at) desc
       limit 10`,
      [context.userId],
    );

    const kindOpps = await sql.query<OppRow & { kind: string | null }>(
      `select
         coalesce(kind, 'auction') as kind,
         (array_agg(opponent_name order by created_at desc))[1] as name,
         count(*)::int as games,
         count(*) filter (where won is true)::int as wins,
         count(*) filter (where won is false)::int as losses,
         count(*) filter (where won is null)::int as ties
       from player_nights
       where user_id = $1
       group by opponent_key, coalesce(kind, 'auction')
       order by count(*) desc, max(created_at) desc`,
      [context.userId],
    );
    const mapOpp = (opp: OppRow): CareerOpponent => ({
      name: opp.name,
      games: asInt(opp.games),
      wins: asInt(opp.wins),
      losses: asInt(opp.losses),
      ties: asInt(opp.ties),
    });
    const take = (kind: "auction" | "elimination") =>
      kindOpps.filter((row) => (kind === "elimination" ? row.kind === "elimination" : row.kind !== "elimination")).slice(0, 10).map(mapOpp);
    const listed = opponents.map(mapOpp);
    const mergedAuction = seeded ? addSlices(seeded.auction, auction) : auction;
    const mergedElim = seeded ? addSlices(seeded.elimination, elimination) : elimination;
    const merged = kindSlices(mergedAuction, mergedElim);

    return withScratchBook(sql, context.userId, {
      games: merged.total.games,
      wins: merged.total.wins,
      losses: merged.total.losses,
      ties: merged.total.ties,
      highest: merged.total.highest,
      lowest: merged.total.lowest,
      opponents: listed,
      total: merged.total,
      auction: merged.auction,
      elimination: merged.elimination,
      opponentsBy: {
        total: listed,
        auction: take("auction"),
        elimination: take("elimination"),
      },
      ...settled,
    });
}

export async function setMyAvatarHandler({ context, data }: { context: { userId: string }; data: { avatarId: string } }): Promise<{ avatarId: AvatarId }> {
    if (!isAvatarId(data.avatarId)) return { avatarId: "poor" };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const settled = await settleProfile(sql, context.userId);
    const avatarId = clampAvatar(data.avatarId, settled.owned);
    await sql.query(
      `insert into player_profiles (user_id, avatar_id, updated_at)
       values ($1, $2, now())
       on conflict (user_id) do update set avatar_id = excluded.avatar_id, updated_at = now()`,
      [context.userId, avatarId],
    );
    return { avatarId };
}

export async function setMyNameHandler({ context, data }: { context: { userId: string }; data: { name: string } }): Promise<{ displayName: string }> {
    if (!data.name) return { displayName: "" };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `insert into player_profiles (user_id, avatar_id, display_name, updated_at)
       values ($1, 'poor', $2, now())
       on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()`,
      [context.userId, data.name],
    );
    return { displayName: data.name };
}

export async function openMysteryBoxHandler({ context }: { context: { userId: string } }): Promise<BoxResult> {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const settled = await settleProfile(sql, context.userId);
    if (settled.coins < BOX_COST) {
      return { ok: false, reason: "broke", coins: settled.coins, owned: settled.owned };
    }
    const prize = pickPrize(settled.owned, `${context.userId}:${Date.now()}:${settled.owned.length}`);
    if (!prize) {
      return { ok: false, reason: "complete", coins: settled.coins, owned: settled.owned };
    }
    const owned = [...settled.owned, prize];
    await sql.query(
      `update player_profiles
       set owned = $1, box_opens = coalesce(box_opens, 0) + 1, updated_at = now()
       where user_id = $2`,
      [JSON.stringify(owned), context.userId],
    );
    const next = await settleProfile(sql, context.userId);
    return { ok: true, prize, coins: next.coins, owned: next.owned, avatarId: settled.avatarId };
}

export async function buyGoldenPepeHandler({ context }: { context: { userId: string } }): Promise<ShopResult> {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const settled = await settleProfile(sql, context.userId);
    if (settled.owned.includes("golden")) {
      return { ok: false, reason: "owned", coins: settled.coins, owned: settled.owned };
    }
    if (settled.coins < GOLDEN_COST) {
      return { ok: false, reason: "broke", coins: settled.coins, owned: settled.owned };
    }
    const owned = [...settled.owned, "golden" as AvatarId];
    await sql.query(
      `update player_profiles
       set owned = $1, avatar_id = $2, updated_at = now()
       where user_id = $3`,
      [JSON.stringify(owned), "golden", context.userId],
    );
    const next = await settleProfile(sql, context.userId);
    return { ok: true, coins: next.coins, owned: next.owned, avatarId: "golden" };
}

const emptySlice = (): BookSlice => ({
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  highest: null,
  lowest: null,
});

function toSlice(row: TotalsRow | undefined): BookSlice {
  if (!row) return emptySlice();
  return {
    games: asInt(row.games),
    wins: asInt(row.wins),
    losses: asInt(row.losses),
    ties: asInt(row.ties),
    highest: row.highest == null ? null : asInt(row.highest),
    lowest: row.lowest == null ? null : asInt(row.lowest),
  };
}

function addSlices(a: BookSlice, b: BookSlice): BookSlice {
  return {
    games: a.games + b.games,
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    ties: a.ties + b.ties,
    highest:
      a.highest == null ? b.highest : b.highest == null ? a.highest : Math.max(a.highest, b.highest),
    lowest:
      a.lowest == null ? b.lowest : b.lowest == null ? a.lowest : Math.min(a.lowest, b.lowest),
  };
}

function kindSlices(auction: BookSlice, elimination: BookSlice): {
  auction: BookSlice;
  elimination: BookSlice;
  total: BookSlice;
} {
  const combined = addSlices(auction, elimination);
  return {
    auction,
    elimination,
    total: { ...combined, highest: elimination.highest, lowest: elimination.lowest },
  };
}

function clipPublicId(id: unknown): string {
  return String(id ?? "").trim().slice(0, 80);
}

type BoardSql = {
  id: string;
  name: string | null;
  avatar_id: string | null;
  games: number | string;
  wins: number | string;
  highest: number | string | null;
  daily_stars: number | string | null;
};

/** Public board — aggregated wins only, no emails. */
export async function loadLeaderboard(): Promise<Leaderboard> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const [merged, auction, elimination] = await Promise.all([
    queryBoard(sql, null, 0),
    queryBoard(sql, "auction"),
    queryBoard(sql, "elimination"),
  ]);
  const total = merged.slice(0, 20);
  const score = [...merged]
    .filter((row) => row.highest != null)
    .sort((a, b) => (b.highest ?? -1) - (a.highest ?? -1) || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 20);
  const stars = await queryStarsBoard(sql, merged);
  return { total, auction, elimination, score, stars };
}

export async function getLeaderboardHandler(): Promise<Leaderboard> {
  return loadLeaderboard();
}

async function queryBoard(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  kind: "auction" | "elimination" | null,
  limit = 20,
): Promise<BoardRow[]> {
  const hidden = `${hiddenBoardNameSql()} and ${hiddenBoardIdSql("n.user_id")}`;
  const filter = kind
    ? `where coalesce(n.kind, 'auction') = $1 and ${hidden}`
    : `where ${hidden}`;
  const params = kind ? [kind] : [];
  const highExpr = kind
    ? kind === "elimination"
      ? "max(case when n.score <= 280 then n.score end)::int"
      : "max(n.score)::int"
    : "max(case when coalesce(n.kind, 'auction') = 'elimination' and n.score <= 280 then n.score end)::int";
  const orderHigh = kind
    ? kind === "elimination"
      ? "max(case when n.score <= 280 then n.score end)"
      : "max(n.score)"
    : "max(case when coalesce(n.kind, 'auction') = 'elimination' and n.score <= 280 then n.score end)";
  const rows = await sql.query<BoardSql>(
    `select
       n.user_id as id,
       coalesce(
         nullif(nullif(trim(p.display_name), ''), 'GM'),
         nullif(trim(u.name), ''),
         'GM'
       ) as name,
       coalesce(p.avatar_id, 'poor') as avatar_id,
       count(*)::int as games,
       count(*) filter (where n.won is true)::int as wins,
       ${highExpr} as highest,
       coalesce(p.daily_stars, 0)::int as daily_stars
     from player_nights n
     left join player_profiles p on p.user_id = n.user_id
     left join "user" u on u.id = n.user_id
     ${filter}
     group by n.user_id, p.display_name, p.avatar_id, p.daily_stars, u.name
     order by count(*) filter (where n.won is true) desc,
              count(*) desc,
              ${orderHigh} desc nulls last
     limit 20`,
    params,
  );
  const live = rows.flatMap((row) => {
    const name = clipDisplayName(row.name ?? "");
    if (!name) return [];
    return [
      {
        id: row.id,
        name,
        avatarId: clampAvatar(row.avatar_id ?? "poor"),
        games: asInt(row.games),
        wins: asInt(row.wins),
        highest: row.highest == null ? null : asInt(row.highest),
        stars: Math.max(0, asInt(row.daily_stars)),
      },
    ];
  });
  const seed = await querySeededBoard(sql, kind);
  const byId = new Map<string, BoardRow>();
  for (const row of seed) byId.set(row.id, row);
  for (const row of live) {
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, {
      ...prev,
      name: row.name || prev.name,
      avatarId: row.avatarId || prev.avatarId,
      games: prev.games + row.games,
      wins: prev.wins + row.wins,
      highest:
        prev.highest == null ? row.highest : row.highest == null ? prev.highest : Math.max(prev.highest, row.highest),
      stars: Math.max(prev.stars, row.stars),
    });
  }
  const merged = [...byId.values()].filter(
    (row) => Boolean(clipDisplayName(row.name)) && !isHiddenBoardId(row.id) && !isHiddenBoardName(row.name),
  );
  merged.sort((a, b) => b.wins - a.wins || b.games - a.games || (b.highest ?? -1) - (a.highest ?? -1));
  return limit > 0 ? merged.slice(0, limit) : merged;
}

async function queryStarsBoard(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  merged: BoardRow[],
): Promise<BoardRow[]> {
  let extra: { id: string; name: string | null; avatar_id: string | null; daily_stars: number | string | null }[] = [];
  try {
    extra = await sql.query(
      `select p.user_id as id,
              coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
              p.avatar_id,
              p.daily_stars
         from player_profiles p
         left join "user" u on u.id = p.user_id
        where coalesce(p.daily_stars, 0) > 0
          and ${hiddenBoardIdSql("p.user_id")}
          and ${hiddenBoardNameSql()}`,
    );
  } catch {
    extra = [];
  }
  const byId = new Map<string, BoardRow>();
  for (const row of merged) byId.set(row.id, row);
  for (const row of extra) {
    const name = clipDisplayName(row.name ?? "");
    if (!name || isHiddenBoardId(row.id) || isHiddenBoardName(name)) continue;
    const prev = byId.get(row.id);
    const stars = Math.max(0, asInt(row.daily_stars));
    if (!prev) {
      byId.set(row.id, {
        id: row.id,
        name,
        avatarId: clampAvatar(row.avatar_id ?? "poor"),
        games: 0,
        wins: 0,
        highest: null,
        stars,
      });
      continue;
    }
    byId.set(row.id, { ...prev, name: prev.name || name, stars: Math.max(prev.stars, stars) });
  }
  return [...byId.values()]
    .filter((row) => row.stars > 0 && Boolean(clipDisplayName(row.name)) && !isHiddenBoardName(row.name))
    .sort((a, b) => b.stars - a.stars || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 20);
}

type CareerSlice = {
  games?: number;
  wins?: number;
  losses?: number;
  ties?: number;
  highest?: number | null;
  lowest?: number | null;
};

function careerSlice(book: unknown, kind: "auction" | "elimination" | null): CareerSlice | null {
  if (!book || typeof book !== "object") return null;
  const rec = book as Record<string, unknown>;
  const raw = kind == null ? rec.total : rec[kind];
  if (!raw || typeof raw !== "object") return null;
  return raw as CareerSlice;
}

async function querySeededBoard(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  kind: "auction" | "elimination" | null,
): Promise<BoardRow[]> {
  let rows: {
    id: string;
    name: string | null;
    avatar_id: string | null;
    daily_stars: number | string | null;
    career_book: unknown;
  }[] = [];
  try {
    rows = await sql.query(
      `select user_id as id,
              display_name as name,
              avatar_id,
              daily_stars,
              career_book
         from player_profiles
        where career_book is not null`,
    );
  } catch {
    return [];
  }
  const mapped = rows
    .map((row) => {
      const slice = careerSlice(row.career_book, kind);
      const games = asInt(slice?.games);
      const name = clipDisplayName(row.name ?? "");
      if (!name || isHiddenBoardId(row.id) || isHiddenBoardName(name)) return null;
      if (kind != null && (!slice || games <= 0)) return null;
      return {
        id: row.id,
        name,
        avatarId: clampAvatar(row.avatar_id ?? "poor"),
        games,
        wins: asInt(slice?.wins),
        highest: slice?.highest == null ? null : asInt(slice.highest),
        stars: Math.max(0, asInt(row.daily_stars)),
      };
    })
    .filter((row): row is BoardRow => Boolean(row));
  mapped.sort((a, b) => b.wins - a.wins || b.games - a.games || (b.highest ?? -1) - (a.highest ?? -1));
  return mapped;
}

async function maybeStorePlayerVault(sql: {
  query: <T>(text: string, params?: unknown[]) => Promise<T[]>;
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const existing = await sql.query<{ day: string }>(
      "select day::text as day from player_vault_snapshots where day = $1::date",
      [today],
    );
    if (existing[0]) return;
  } catch {
    return;
  }
  const [profiles, nights, results] = await Promise.all([
    sql.query<Record<string, unknown>>(
      `select user_id, display_name, avatar_id, coins, credit, coin_wins, owned, updated_at
         from player_profiles`,
    ),
    sql.query<Record<string, unknown>>(
      `select user_id, night_key, opponent_name, opponent_key, won, score, opponent_score, kind, created_at
         from player_nights
        order by created_at desc
        limit 5000`,
    ),
    sql.query<Record<string, unknown>>(
      `select code, nights, kind, winner, score0, score1, name0, name1, created_at
         from darkness_results
        order by created_at desc
        limit 2000`,
    ),
  ]);
  const payload = {
    at: new Date().toISOString(),
    profiles,
    nights,
    results,
  };
  await sql.query(
    `insert into player_vault_snapshots (day, payload) values ($1::date, $2::jsonb)
     on conflict (day) do nothing`,
    [today, JSON.stringify(payload)],
  );
  await sql.query("delete from player_vault_snapshots where day < current_date - 30");
}


async function loadCareerBook(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<{ total: BookSlice; auction: BookSlice; elimination: BookSlice } | null> {
  try {
    const rows = await sql.query<{ career_book: unknown }>(
      "select career_book from player_profiles where user_id = $1",
      [userId],
    );
    const book = rows[0]?.career_book;
    const total = careerSlice(book, null);
    if (!total || asInt(total.games) <= 0) return null;
    return {
      total: {
        games: asInt(total.games),
        wins: asInt(total.wins),
        losses: asInt(total.losses),
        ties: asInt(total.ties),
        highest: total.highest == null ? null : asInt(total.highest),
        lowest: total.lowest == null ? null : asInt(total.lowest),
      },
      auction: toSliceFromCareer(careerSlice(book, "auction")),
      elimination: toSliceFromCareer(careerSlice(book, "elimination")),
    };
  } catch {
    return null;
  }
}

function toSliceFromCareer(slice: CareerSlice | null): BookSlice {
  if (!slice) return emptySlice();
  return {
    games: asInt(slice.games),
    wins: asInt(slice.wins),
    losses: asInt(slice.losses),
    ties: asInt(slice.ties),
    highest: slice.highest == null ? null : asInt(slice.highest),
    lowest: slice.lowest == null ? null : asInt(slice.lowest),
  };
}

export async function getPublicProfileHandler({ data }: { data: { userId: string } }): Promise<PublicBook | null> {
    if (!data.userId) return null;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureNightLowScore(sql);
    const totals = await sql.query<
      TotalsRow & {
        name: string | null;
        avatar_id: string | null;
        owned: string | null;
        credit: number | string | null;
        daily_stars: number | string | null;
      }
    >(
      `select
         coalesce(
           nullif(nullif(trim(p.display_name), ''), 'GM'),
           nullif(trim(u.name), ''),
           'GM'
         ) as name,
         coalesce(p.avatar_id, 'poor') as avatar_id,
         p.owned as owned,
         p.credit as credit,
         coalesce(p.daily_stars, 0) as daily_stars,
         count(n.id)::int as games,
         count(n.id) filter (where n.won is true)::int as wins,
         count(n.id) filter (where n.won is false)::int as losses,
         count(n.id) filter (where n.won is null)::int as ties,
         max(n.score)::int as highest,
         min(coalesce(n.low_score, n.score))::int as lowest
       from player_profiles p
       left join player_nights n on n.user_id = p.user_id
       left join "user" u on u.id = p.user_id
       where p.user_id = $1
       group by p.display_name, p.avatar_id, p.owned, p.credit, p.daily_stars, u.name`,
      [data.userId],
    );
    let row = totals[0];
    if (!row) {
      const nights = await sql.query<TotalsRow>(
        `select
           count(*)::int as games,
           count(*) filter (where won is true)::int as wins,
           count(*) filter (where won is false)::int as losses,
           count(*) filter (where won is null)::int as ties,
           max(score)::int as highest,
           min(coalesce(low_score, score))::int as lowest
         from player_nights
         where user_id = $1`,
        [data.userId],
      );
      const playedDaily = await hasDailyRun(sql, data.userId);
      const seeded = await loadCareerBook(sql, data.userId);
      if ((!nights[0] || asInt(nights[0].games) === 0) && !playedDaily && !seeded) return null;
      const auth = await sql.query<{ name: string | null }>(
        `select name from "user" where id = $1`,
        [data.userId],
      );
      row = {
        games: nights[0]?.games ?? 0,
        wins: nights[0]?.wins ?? 0,
        losses: nights[0]?.losses ?? 0,
        ties: nights[0]?.ties ?? 0,
        highest: nights[0]?.highest ?? null,
        lowest: nights[0]?.lowest ?? null,
        name: clipDisplayName(auth[0]?.name ?? "") || "GM",
        avatar_id: "poor",
        owned: null,
        credit: 0,
        daily_stars: 0,
      };
    }
    const byKind = await sql.query<TotalsRow & { kind: string | null }>(
      `select
         coalesce(kind, 'auction') as kind,
         count(*)::int as games,
         count(*) filter (where won is true)::int as wins,
         count(*) filter (where won is false)::int as losses,
         count(*) filter (where won is null)::int as ties,
         max(case when coalesce(kind, 'auction') = 'elimination' and score > 280 then null else score end)::int as highest,
         min(case when coalesce(kind, 'auction') = 'elimination' and coalesce(low_score, score) > 280 then null else coalesce(low_score, score) end)::int as lowest
       from player_nights
       where user_id = $1
       group by coalesce(kind, 'auction')`,
      [data.userId],
    );
    const { auction, elimination, total } = kindSlices(
      toSlice(byKind.find((slice) => slice.kind !== "elimination")),
      toSlice(byKind.find((slice) => slice.kind === "elimination")),
    );
    const settled = await settleProfile(sql, data.userId);
    const owned = settled.owned;
    const avatarId = settled.avatarId;
    const coins = settled.coins;
    const dailyStars = settled.dailyStars;
    const book = {
      id: data.userId,
      name: settled.displayName || row.name?.trim() || "GM",
      avatarId,
      owned,
      coins,
      dailyStars,
    };
    const seeded = await loadCareerBook(sql, data.userId);
    if (seeded) {
      const mergedAuction = addSlices(seeded.auction, auction);
      const mergedElim = addSlices(seeded.elimination, elimination);
      const merged = kindSlices(mergedAuction, mergedElim);
      return { ...book, ...merged };
    }
    if (total.games === 0) {
      const fallback = toSlice(row);
      return {
        ...book,
        total: fallback.games ? fallback : emptySlice(),
        auction: fallback.games ? fallback : emptySlice(),
        elimination: emptySlice(),
      };
    }
    return {
      ...book,
      total,
      auction,
      elimination,
    };
}

