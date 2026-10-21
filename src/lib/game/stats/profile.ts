/** Settle, seed_lock, bank, owned. Move-only from stats.server. */
import {
  clampAvatar,
  parseOwned,
  BANANA_ID,
  BOX_COST,
  CLUB_200_ID,
  GOLDEN_COST,
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

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

/** True only while jail_until is still ahead of the database clock. */
export async function jailAvatarLocked(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql.query<{ locked: boolean | null }>(
    `select jail_until > now() as locked from player_profiles where user_id = $1`,
    [userId],
  );
  return rows[0]?.locked === true;
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

const RETURN_BOX_GEN = 4;
const RETURN_BOX_IDS = new Set(["holy", "holy-red", "holy-blue", "pirate", "ninja", "cyborg", "zombie", "chef"]);

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
  const npl = await nplPaid(sql, userId);
  const coins = Math.max(
    0,
    seedBank + asInt(winsRow[0]?.wins) * WIN_PAY + earned.credit - extraBoxes * BOX_COST - extraGold * GOLDEN_COST + scratchPay - npl,
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
  const beforeWins = asInt(row?.coin_wins);
  const wins = asInt(winsRow[0]?.wins);
  if (coins !== beforeCoins) {
    await sql.query(`update player_profiles set coins = $1, updated_at = now() where user_id = $2`, [coins, userId]);
    const { bankChangeReason, recordBankChange } = await import("../bank-watch");
    const reason = await bankChangeReason(sql, userId, beforeCoins, coins, beforeWins, wins);
    await recordBankChange(sql, userId, beforeCoins, coins, reason);
  }
  const avatarId = (await jailAvatarLocked(sql, userId))
    ? clampAvatar(row?.avatar_id ?? "poor", nextOwned)
    : justUnlockedBanana(owned, nextOwned)
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
  const jailed = await jailAvatarLocked(sql, userId);
  if (asInt(row?.closet_reset) < RETURN_BOX_GEN) {
    const taken = owned.filter((id) => RETURN_BOX_IDS.has(id));
    if (taken.length) {
      owned = owned.filter((id) => !RETURN_BOX_IDS.has(id));
      if (!owned.includes("poor")) owned.unshift("poor");
      if (!jailed && RETURN_BOX_IDS.has(avatarId)) avatarId = "poor";
      if (!jailed) avatarId = clampAvatar(avatarId, owned);
      const paid = taken.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
      boxForgive -= paid * BOX_COST;
    }
    await sql.query(
      jailed
        ? `update player_profiles
            set owned = $1, closet_reset = $2, box_forgive = $3, updated_at = now()
          where user_id = $4`
        : `update player_profiles
            set owned = $1, avatar_id = $2, closet_reset = $3, box_forgive = $4, updated_at = now()
          where user_id = $5`,
      jailed
        ? [JSON.stringify(owned), RETURN_BOX_GEN, boxForgive, userId]
        : [JSON.stringify(owned), avatarId, RETURN_BOX_GEN, boxForgive, userId],
    );
  }
  await keepCommishBook(sql, userId, displayName, authName);
  await backfillHostedNights(sql, userId, displayName || authName);
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
    try {
      const { maybeGrantHunters } = await import("../board-feats/shop");
      await maybeGrantHunters(sql, userId);
    } catch (err) {
      console.error("[darkness] hunter ladder failed", err);
    }
  } else if (!clubHit && owned.includes(CLUB_200_ID)) {
    owned = owned.filter((id) => id !== CLUB_200_ID);
    if (!jailed && avatarId === CLUB_200_ID) avatarId = "poor";
    await sql.query(
      jailed
        ? `update player_profiles set owned = $1, updated_at = now() where user_id = $2`
        : `update player_profiles set owned = $1, avatar_id = $2, updated_at = now() where user_id = $3`,
      jailed ? [JSON.stringify(owned), userId] : [JSON.stringify(owned), avatarId, userId],
    );
  }
  const beforeFeats = owned;
  owned = await grantEarnedFeats(sql, userId, owned);
  if (!jailed && justUnlockedBanana(beforeFeats, owned)) avatarId = BANANA_ID;
  const winsRow = await sql.query<{ wins: number | string }>(
    `select count(*) filter (where won is true)::int as wins
     from player_nights where user_id = $1`,
    [userId],
  );
  const wins = asInt(winsRow[0]?.wins);
  credit = earned.credit + boxForgive;
  const scratchPay = await countScratchCoins(sql, userId);
  const npl = await nplPaid(sql, userId);
  const boxPrizes = owned.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
  const golden = owned.includes("golden") ? GOLDEN_COST : 0;
  const coins = Math.max(0, wins * WIN_PAY + Math.floor(credit) + scratchPay - boxPrizes * BOX_COST - golden - npl);
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
      const { bankChangeReason, recordBankChange } = await import("../bank-watch");
      const reason = await bankChangeReason(sql, userId, beforeCoins, coins, asInt(row?.coin_wins), wins);
      await recordBankChange(sql, userId, beforeCoins, coins, reason);
    }
  }
  if (!jailed) {
    avatarId = clampAvatar(avatarId, owned);
    if (avatarId !== (row?.avatar_id ?? "poor")) {
      await sql.query(`update player_profiles set avatar_id = $1, updated_at = now() where user_id = $2`, [
        avatarId,
        userId,
      ]);
    }
  }
  return { coins, owned, avatarId, displayName, dailyStars };
}

async function nplPaid(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<number> {
  const { nplSpend } = await import("./shop");
  return nplSpend(sql, userId);
}

