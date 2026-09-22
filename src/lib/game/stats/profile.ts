/** Settle, seed_lock, bank, owned. Move-only from stats.server. */
import {
  clampAvatar,
  parseOwned,
  walletBalance,
  BANANA_ID,
  BOX_COST,
  CLUB_200,
  CLUB_200_CAP,
  CLUB_200_ID,
  GOLDEN_COST,
  PEEPING_ID,
  WIN_PAY,
  isFeatAvatar,
  isStarAvatar,
  justUnlockedBanana,
  type AvatarId,
} from "../avatars";
import { clipDisplayName } from "../stats-shared";
import { DAILY_PAY } from "../daily";
import { WEEKLY_PAY, WEEKLY_WIN_PAY, WEEKLY_WIN_STARS } from "../weekly";
import { countPayoutStars, countScratchCoins } from "../payouts";
import { asInt, type ProfileRow } from "./shared";
import { grantStarLooks } from "./stars";
import { announceFeatUnlocks, grantEarnedFeats, grantSeedClub200, hitClub200, paidLooks } from "./feats";
import { backfillHostedNights, keepCommishBook } from "./nights";

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

function isTy(name: string): boolean {
  return name.trim().toLowerCase() === "ty";
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
    const { recordBankChange } = await import("../bank-watch");
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
    await announceFeatUnlocks(sql, userId, [CLUB_200_ID]);
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
      const { recordBankChange } = await import("../bank-watch");
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

