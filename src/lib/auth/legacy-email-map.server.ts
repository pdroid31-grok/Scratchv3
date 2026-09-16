/**
 * First Google/email sign-in for addresses in env LEGACY_EMAIL_MAP
 * (JSON object, keys lowercased) must use the mapped Better Auth user.id.
 *
 * Do not put mapped emails in the repo. Set LEGACY_EMAIL_MAP on the host.
 * Add the next player as a row in LEGACY_SEEDS (keyed by user id), not a
 * special-case branch.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { getSql } from "../db";
import { CEO_BOARD_ID } from "../game/league-chat-types";

type AuthUserRow = { id: string; email: string; name: string };

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type LegacySeed = {
  id: string;
  name: string;
  avatarId: string;
  owned: readonly string[];
  bank: number;
  stars: number;
  games: number;
  wins: number;
  highest: number | null;
};

/** Old grok.me remap source. Do not seed or rewrite this id. */
const SKIP_SEED_IDS = new Set(["L2L2Tf1HXAeB5rhgLvhogF921BKsICsN"]);

/** darkness-backups snapshots/2026-09-16T1500-ET/store-scrape.json profile PAT. */
const PAT_OWNED = [
  "poor",
  "ninja",
  "wizard",
  "cyborg",
  "superhero",
  "samurai",
  "agent",
  "pilot",
  "lumberjack",
  "rockstar",
  "knight",
  "supervillain",
  "werewolf",
  "reaper",
  "santa",
  "birthday",
  "foam",
  "peeping",
  "crossword",
  "mafia",
] as const;

const LEGACY_SEEDS: readonly LegacySeed[] = [
  {
    id: CEO_BOARD_ID,
    name: "Pat",
    avatarId: "mafia",
    owned: PAT_OWNED,
    bank: 1,
    stars: 2,
    games: 66,
    wins: 34,
    highest: 173,
  },
];

const LEGACY_SEED_BY_ID = new Map(LEGACY_SEEDS.map((row) => [row.id, row]));

export function legacySeedFor(userId: string): LegacySeed | null {
  if (!userId || SKIP_SEED_IDS.has(userId)) return null;
  return LEGACY_SEED_BY_ID.get(userId) ?? null;
}

function legacyStarSourceKey(userId: string): string {
  return `scratch:legacy-seed:${userId}`;
}

function envJson(key: string): unknown {
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    console.error(`[legacy-email-map] ${key} is not valid JSON`);
    return null;
  }
}

export function legacyEmailMap(): Map<string, string> {
  const parsed = envJson("LEGACY_EMAIL_MAP");
  const out = new Map<string, string>();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const email = key.trim().toLowerCase();
    const id = typeof value === "string" ? value.trim() : "";
    if (email && id && !SKIP_SEED_IDS.has(id)) out.set(email, id);
  }
  return out;
}

export function mappedIdForEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return legacyEmailMap().get(email.trim().toLowerCase()) ?? null;
}

async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const sql = await getSql();
  const rows = await sql.query<AuthUserRow>(
    `select id, email, name from "user" where lower(email) = $1 limit 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

async function findUserById(id: string): Promise<AuthUserRow | null> {
  const sql = await getSql();
  const rows = await sql.query<AuthUserRow>(`select id, email, name from "user" where id = $1 limit 1`, [id]);
  return rows[0] ?? null;
}

function throwEmailBound(existingUserId: string): never {
  throw new APIError("CONFLICT", {
    message: `LEGACY_EMAIL_MAP: email already has user ${existingUserId}`,
  });
}

/** If this email already belongs to a different user, stop and report that id. */
export async function assertLegacyEmailFree(email: string, mappedId: string): Promise<void> {
  const existing = await findUserByEmail(email);
  if (existing && existing.id !== mappedId) throwEmailBound(existing.id);
}

/**
 * When the mapped id already exists, point its email at this login so Google
 * account-linking attaches to it (not a new user).
 */
export async function bindLegacyEmailToMappedId(email: string, mappedId: string): Promise<AuthUserRow | null> {
  const normalized = email.trim().toLowerCase();
  await assertLegacyEmailFree(normalized, mappedId);
  const existing = await findUserById(mappedId);
  if (!existing) return null;
  const sql = await getSql();
  const name = legacySeedFor(mappedId)?.name ?? existing.name;
  await sql.query(
    `update "user"
        set email = $1,
            name = $2,
            "emailVerified" = true,
            "updatedAt" = now()
      where id = $3`,
    [normalized, name, mappedId],
  );
  return { id: mappedId, email: normalized, name };
}

/**
 * Rankings stars = daily_stars AFTER syncDailyStarsFromPayouts.
 * Insert a $0 scratch payout so the ladder keeps snapshot stars.
 * amount is 0 so settleSeededProfile does not add this row to bank.
 */
async function insertLegacyStarPayout(sql: Sql, seed: LegacySeed): Promise<void> {
  await sql.query(`
    create table if not exists darkness_payouts (
      id serial primary key,
      user_id text not null,
      amount integer not null,
      stars integer not null default 0,
      kind text not null,
      source_key text not null unique,
      created_at timestamptz not null default now()
    )`);
  await sql.query(
    `insert into darkness_payouts (user_id, amount, stars, kind, source_key)
     values ($1, 0, $2, 'scratch', $3)
     on conflict (source_key) do nothing`,
    [seed.id, seed.stars, legacyStarSourceKey(seed.id)],
  );
  await sql.query(
    `update player_profiles
        set daily_stars = $1, updated_at = now()
      where user_id = $2
        and coalesce(daily_stars, 0) is distinct from $1`,
    [seed.stars, seed.id],
  );
}

/**
 * First-create (and attach) seed for any mapped id that has a LEGACY_SEEDS row.
 * seed_lock=1 keeps dump bank/owned; live wins/buys still add on top.
 */
export async function seedLegacyPlayer(userId: string): Promise<void> {
  const seed = legacySeedFor(userId);
  if (!seed) return;
  const sql = await getSql();
  const existing = await sql.query<{ career_book: unknown }>(
    `select career_book from player_profiles where user_id = $1`,
    [userId],
  );

  if (!existing[0]?.career_book) {
    const owned = [...seed.owned];
    const losses = Math.max(0, seed.games - seed.wins);
    const book = {
      total: {
        games: seed.games,
        wins: seed.wins,
        losses,
        ties: 0,
        highest: seed.highest,
        lowest: null,
      },
      auction: { games: 0, wins: 0, losses: 0, ties: 0, highest: null, lowest: null },
      elimination: { games: 0, wins: 0, losses: 0, ties: 0, highest: null, lowest: null },
      bank: seed.bank,
      stars: seed.stars,
      owned,
    };

    await sql.query(
      `insert into player_profiles (
         user_id, avatar_id, display_name, coins, coin_wins, owned, daily_stars,
         career_book, seed_lock, updated_at
       ) values ($1, $2, $3, $4, 0, $5, $6, $7::jsonb, 1, now())
       on conflict (user_id) do update
         set avatar_id = excluded.avatar_id,
             display_name = excluded.display_name,
             coins = excluded.coins,
             owned = excluded.owned,
             daily_stars = excluded.daily_stars,
             career_book = excluded.career_book,
             seed_lock = 1,
             updated_at = now()
       where player_profiles.career_book is null`,
      [
        seed.id,
        seed.avatarId,
        seed.name,
        seed.bank,
        JSON.stringify(owned),
        seed.stars,
        JSON.stringify(book),
      ],
    );
  }

  await insertLegacyStarPayout(sql, seed);
}

export async function legacyUserCreateBefore(user: {
  id?: string;
  email?: string;
  name?: string;
}): Promise<{ data: typeof user } | false> {
  const email = String(user.email ?? "").trim().toLowerCase();
  const mapped = mappedIdForEmail(email);
  if (!mapped) return { data: user };

  await assertLegacyEmailFree(email, mapped);
  const bound = await bindLegacyEmailToMappedId(email, mapped);
  if (bound) return false;

  const seed = legacySeedFor(mapped);
  return {
    data: {
      ...user,
      id: mapped,
      email,
      name: seed?.name ?? user.name,
    },
  };
}

export function legacyEmailMapPlugin(): BetterAuthPlugin {
  return {
    id: "legacy-email-map",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = String((ctx.body as { email?: string } | undefined)?.email ?? "")
              .trim()
              .toLowerCase();
            const mapped = mappedIdForEmail(email);
            if (!mapped) return;

            await assertLegacyEmailFree(email, mapped);
            const bound = await bindLegacyEmailToMappedId(email, mapped);
            if (!bound) return;

            const accounts = await ctx.context.internalAdapter.findAccounts(mapped);
            const cred = accounts.find((row) => row.providerId === "credential");
            if (cred?.password) return;

            const password = String((ctx.body as { password?: string } | undefined)?.password ?? "");
            if (!password) throw new APIError("BAD_REQUEST", { message: "Password required" });
            const hash = await ctx.context.password.hash(password);
            if (!cred) {
              await ctx.context.internalAdapter.linkAccount({
                userId: mapped,
                providerId: "credential",
                accountId: mapped,
                password: hash,
              });
            }
            await seedLegacyPlayer(mapped);
            const session = await ctx.context.internalAdapter.createSession(mapped);
            if (!session) throw new APIError("BAD_REQUEST", { message: "Failed to create session" });
            const user = await ctx.context.internalAdapter.findUserById(mapped);
            if (!user) throw new APIError("BAD_REQUEST", { message: "Failed to load mapped user" });
            await setSessionCookie(ctx, { session, user });
            return ctx.json({ token: session.token, user });
          }),
        },
      ],
    },
  };
}
