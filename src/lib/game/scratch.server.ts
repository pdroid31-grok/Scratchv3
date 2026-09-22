/** Server-only scratch tickets. Prize is rolled here; the client never RNGs. */
import { randomInt } from "node:crypto";
import { justUnlockedScratchLook, parseOwned } from "./avatars";
import {
  prizeByKey,
  prizeFromRoll,
  scratchFromTotal,
  scratchPercent,
  SCRATCH_BANK_START,
  SCRATCH_NEED,
  type ScratchCardView,
  type ScratchClaimResult,
  type ScratchPrize,
  type ScratchState,
} from "./scratch";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

async function ensureScratchTables(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_scratch_cards (
      id serial primary key,
      user_id text not null,
      roll integer not null,
      prize text not null,
      coins integer not null default 0,
      stars integer not null default 0,
      avatar_id text,
      created_at timestamptz not null default now(),
      scratched_at timestamptz
    )`);
  await sql.query(
    "create index if not exists darkness_scratch_cards_user_idx on darkness_scratch_cards (user_id, scratched_at, id)",
  );
}

const NO_GIFT_IDS = new Set([
  "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh",
  "1UmyGNGrnaW6ohbCWrU7hYQzZSZpqa8n",
]);

function asInt(value: number | string | null | undefined): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

async function lookupTestPgUserId(sql: Sql): Promise<string | null> {
  try {
    const rows = await sql.query<{ id: string }>(
      `select id from (
         select user_id as id from player_profiles where lower(trim(display_name)) = 'testpg'
         union
         select id from "user" where lower(trim(name)) = 'testpg'
       ) x
       limit 1`,
    );
    const id = rows[0]?.id ?? null;
    if (!id || NO_GIFT_IDS.has(id)) return null;
    return id;
  } catch {
    return null;
  }
}

async function isTestPgUser(sql: Sql, userId: string): Promise<boolean> {
  if (!userId || NO_GIFT_IDS.has(userId)) return false;
  try {
    const rows = await sql.query<{ ok: number }>(
      `select 1 as ok from player_profiles where user_id = $1 and lower(trim(display_name)) = 'testpg'
       union
       select 1 as ok from "user" where id = $1 and lower(trim(name)) = 'testpg'
       limit 1`,
      [userId],
    );
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

async function dropHistoricUnused(sql: Sql): Promise<void> {
  await sql.query(
    `delete from darkness_scratch_cards
      where scratched_at is null
        and created_at < ($1::timestamp AT TIME ZONE 'America/New_York')`,
    [SCRATCH_BANK_START],
  );
}

async function capPostCutoffUnused(sql: Sql, userId: string, earnedCards: number): Promise<void> {
  const scratchedRows = await sql.query<{ n: number | string }>(
    `select count(*)::int as n
       from darkness_scratch_cards
      where user_id = $1
        and scratched_at is not null
        and created_at >= ($2::timestamp AT TIME ZONE 'America/New_York')`,
    [userId, SCRATCH_BANK_START],
  );
  const scratched = asInt(scratchedRows[0]?.n);
  const extraKeep = (await isTestPgUser(sql, userId)) ? 1 : 0;
  const allowed = Math.max(0, earnedCards - scratched) + extraKeep;
  await sql.query(
    `delete from darkness_scratch_cards
      where id in (
        select id from darkness_scratch_cards
         where user_id = $1
           and scratched_at is null
           and created_at >= ($2::timestamp AT TIME ZONE 'America/New_York')
         order by id asc
         offset $3
      )`,
    [userId, SCRATCH_BANK_START, allowed],
  );
}

async function dailyScoreTotal(sql: Sql, userId: string): Promise<number> {
  try {
    const rows = await sql.query<{ n: number | string | null }>(
      `select coalesce(sum(floor(score)), 0)::bigint as n
         from darkness_daily_runs
        where user_id = $1
          and status = 'done'
          and score is not null
          and day >= $2::date`,
      [userId, SCRATCH_BANK_START],
    );
    return asInt(rows[0]?.n);
  } catch {
    return 0;
  }
}

function rollPrize(): { roll: number; prize: ScratchPrize } {
  const roll = randomInt(1, 101);
  return { roll, prize: prizeFromRoll(roll) };
}

async function mintMissing(sql: Sql, userId: string, need: number): Promise<void> {
  for (let i = 0; i < need; i += 1) {
    const { roll, prize } = rollPrize();
    await sql.query(
      `insert into darkness_scratch_cards (user_id, roll, prize, coins, stars, avatar_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId, roll, prize.key, prize.coins, prize.stars, prize.avatar],
    );
  }
}

export async function syncScratchBank(sql: Sql, userId: string): Promise<ScratchState> {
  await ensureScratchTables(sql);
  await dropHistoricUnused(sql);
  const total = await dailyScoreTotal(sql, userId);
  const earned = scratchFromTotal(total);
  await capPostCutoffUnused(sql, userId, earned.cards);
  const mintedRows = await sql.query<{ n: number | string }>(
    `select count(*)::int as n
       from darkness_scratch_cards
      where user_id = $1
        and created_at >= ($2::timestamp AT TIME ZONE 'America/New_York')`,
    [userId, SCRATCH_BANK_START],
  );
  const minted = asInt(mintedRows[0]?.n);
  const missing = Math.max(0, earned.cards - minted);
  if (missing) await mintMissing(sql, userId, missing);
  await mintTestPgStoreTicketOnce(sql, userId);
  const readyRows = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from darkness_scratch_cards where user_id = $1 and scratched_at is null`,
    [userId],
  );
  return {
    bank: earned.bank,
    need: SCRATCH_NEED,
    percent: scratchPercent(earned.bank),
    ready: asInt(readyRows[0]?.n),
  };
}

/** One unused Store-ticket test card for TestPG. Flagged so it never auto-mints again. */
const TESTPG_STORE_TICKET_FLAG = "testpg-store-ticket-v3";

async function mintTestPgStoreTicketOnce(sql: Sql, userId: string): Promise<void> {
  if (!(await isTestPgUser(sql, userId))) return;
  const unused = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from darkness_scratch_cards where user_id = $1 and scratched_at is null`,
    [userId],
  );
  if (asInt(unused[0]?.n) >= 1) return;
  await sql.query(`
    create table if not exists darkness_scratch_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_scratch_flags where key = $1`,
    [TESTPG_STORE_TICKET_FLAG],
  );
  if (already[0]) return;
  await mintMissing(sql, userId, 1);
  await sql.query(`insert into darkness_scratch_flags (key) values ($1) on conflict (key) do nothing`, [
    TESTPG_STORE_TICKET_FLAG,
  ]);
}

/** Lookup TestPG by name and sync their bank (one-shot gift lives in syncScratchBank). */
export async function ensureTestPgScratchGift(sql: Sql): Promise<void> {
  const userId = await lookupTestPgUserId(sql);
  if (!userId) return;
  await syncScratchBank(sql, userId);
}

export async function peekScratchCard(sql: Sql, userId: string): Promise<ScratchCardView | null> {
  const state = await syncScratchBank(sql, userId);
  if (!state.ready) return null;
  const rows = await sql.query<{ id: number | string; prize: string }>(
    `select id, prize
       from darkness_scratch_cards
      where user_id = $1 and scratched_at is null
      order by id asc
      limit 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: asInt(row.id), prize: prizeByKey(String(row.prize)) };
}

export async function claimScratchCard(sql: Sql, userId: string, cardId: number): Promise<ScratchClaimResult> {
  await ensureScratchTables(sql);
  const id = Math.max(0, Math.floor(cardId));
  if (!id) return { ok: false, reason: "missing" };
  const locked = await sql.query<{
    id: number | string;
    prize: string;
    coins: number | string;
    stars: number | string;
    avatar_id: string | null;
  }>(
    `update darkness_scratch_cards
        set scratched_at = now()
      where id = $1 and user_id = $2 and scratched_at is null
      returning id, prize, coins, stars, avatar_id`,
    [id, userId],
  );
  const card = locked[0];
  if (!card) return { ok: false, reason: "gone" };
  const prize = prizeByKey(String(card.prize));
  const amount = Math.max(0, asInt(card.coins));
  const stars = Math.max(0, asInt(card.stars));
  const { ensurePayoutsTable, scratchPayoutKey, syncDailyStarsFromPayouts } = await import("./payouts");
  await ensurePayoutsTable(sql);
  const inserted = await sql.query<{ id: number }>(
    `insert into darkness_payouts (user_id, amount, stars, kind, source_key)
     values ($1, $2, $3, 'scratch', $4)
     on conflict (source_key) do nothing
     returning id`,
    [userId, amount, stars, scratchPayoutKey(id)],
  );
  let grantedAvatar: "crypepe" | "joker" | null = null;
  if (inserted[0]) {
    if (amount > 0) {
      await sql.query(`update player_profiles set coins = coins + $1, updated_at = now() where user_id = $2`, [
        amount,
        userId,
      ]);
    }
    const avatar = prize.avatar;
    if (avatar) {
      const rows = await sql.query<{ owned: unknown }>(`select owned from player_profiles where user_id = $1`, [userId]);
      const owned = parseOwned(rows[0]?.owned);
      const next = owned.includes(avatar) ? owned : [...owned, avatar];
      const fresh = justUnlockedScratchLook(owned, next);
      if (fresh) {
        await sql.query(
          `update player_profiles set owned = $1, avatar_id = $2, updated_at = now() where user_id = $3`,
          [JSON.stringify(next), fresh, userId],
        );
        grantedAvatar = fresh;
        try {
          const { recordLookUnlockNews } = await import("./news.server");
          await recordLookUnlockNews(sql, userId, fresh, "feats");
        } catch (err) {
          console.error("[darkness] scratch feat news failed", err);
        }
      }
    }
    await syncDailyStarsFromPayouts(sql, userId);
    const starRows = await sql.query<{ daily_stars: number | string | null; owned: unknown }>(
      `select daily_stars, owned from player_profiles where user_id = $1`,
      [userId],
    );
    const { grantStarLooks } = await import("./stats.server");
    await grantStarLooks(sql, userId, parseOwned(starRows[0]?.owned), asInt(starRows[0]?.daily_stars));
    const scratched = await sql.query<{ n: number | string }>(
      `select count(*)::int as n from darkness_scratch_cards where user_id = $1 and scratched_at is not null`,
      [userId],
    );
    if (asInt(scratched[0]?.n) === 1) {
      try {
        const { maybeGrantVegas } = await import("./board-feats.server");
        await maybeGrantVegas(sql, userId);
      } catch (err) {
        console.error("[darkness] vegas scratch failed", err);
      }
    }
    try {
      const { maybeGrantBoxLunch } = await import("./board-feats.server");
      await maybeGrantBoxLunch(sql, userId);
    } catch (err) {
      console.error("[darkness] box lunch scratch failed", err);
    }
  }
  const book = await sql.query<{
    coins: number | string | null;
    daily_stars: number | string | null;
    owned: unknown;
    avatar_id: string | null;
  }>(`select coins, daily_stars, owned, avatar_id from player_profiles where user_id = $1`, [userId]);
  const state = await syncScratchBank(sql, userId);
  const owned = parseOwned(book[0]?.owned);
  try {
    const { recordNewsSafe, newsActor } = await import("./news.server");
    const actor = await newsActor(sql, userId);
    if (actor) {
      await recordNewsSafe(sql, {
        sourceKey: `scratch:${id}`,
        payload: {
          kind: "scratch",
          faces: [{ name: actor.name, avatarId: actor.avatarId, userId }],
          prizeId: prize.avatar ?? undefined,
          prizeLabel: prize.label,
        },
      });
    }
  } catch (err) {
    console.error("[darkness] scratch news failed", err);
  }
  return {
    ok: true,
    prize,
    grantedAvatar,
    avatarId: String(book[0]?.avatar_id ?? "poor"),
    coins: asInt(book[0]?.coins),
    dailyStars: asInt(book[0]?.daily_stars),
    owned,
    bank: state.bank,
    need: state.need,
    percent: state.percent,
    ready: state.ready,
  };
}
