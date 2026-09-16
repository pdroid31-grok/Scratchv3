/**
 * Snapshot board seed (darkness-backups 2026-09-16T1500-ET).
 * Does not create Better Auth users or passwords. Emails stay in env.
 */
import { getSql } from "../db";
import { CEO_BOARD_ID } from "./league-chat-types";
import { HIDDEN_BOARD_IDS, isHiddenBoardId } from "./stats-shared";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export type LegacySlice = {
  games: number;
  wins: number;
  highest: number | null;
};

export type LegacySeed = {
  id: string;
  name: string;
  avatarId: string;
  owned: readonly string[];
  bank: number;
  stars: number;
  games: number;
  wins: number;
  highest: number | null;
  auction?: LegacySlice;
  elimination?: LegacySlice;
};

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

const emptySlice = (): LegacySlice => ({ games: 0, wins: 0, highest: null });

function slice(games: number, wins: number, highest: number | null): LegacySlice {
  return { games, wins, highest };
}

function bookSlice(row: LegacySlice) {
  return {
    games: row.games,
    wins: row.wins,
    losses: Math.max(0, row.games - row.wins),
    ties: 0,
    highest: row.highest,
    lowest: null as number | null,
  };
}

export const LEGACY_SEEDS: readonly LegacySeed[] = [
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
  {
    id: "1UmyGNGrnaW6ohbCWrU7hYQzZSZpqa8n",
    name: "Ty",
    avatarId: "gatorade",
    owned: [
      "poor",
      "holy",
      "superhero",
      "chef",
      "viking",
      "pharaoh",
      "pilot",
      "lumberjack",
      "supervillain",
      "werewolf",
      "hacker",
      "bear",
      "birthday",
      "foam",
      "gatorade",
      "otcoin",
      "dj",
      "crossword",
    ],
    bank: 1,
    stars: 3,
    games: 42,
    wins: 22,
    highest: 164,
    auction: slice(21, 9, 550),
    elimination: slice(21, 13, 164),
  },
  {
    id: "8iURVpnfUfGgeu41IAcAU1bHoGcQtchF",
    name: "WWW",
    avatarId: "wallstreet",
    owned: [
      "poor",
      "holy",
      "vampire",
      "chef",
      "gladiator",
      "agent",
      "rockstar",
      "hotdog",
      "wallstreet",
      "foam",
      "crossword",
    ],
    bank: 9,
    stars: 2,
    games: 22,
    wins: 16,
    highest: 168,
    auction: slice(2, 2, 541),
    elimination: slice(20, 14, 168),
  },
  {
    id: "HaJ3Q1l3AEVrtrPDvrnRG0qCE2OlnHl9",
    name: "Heisenberg",
    avatarId: "supervillain",
    owned: [
      "poor",
      "ninja",
      "chef",
      "scientist",
      "supervillain",
      "alien",
      "hacker",
      "hotdog",
      "foam",
      "peeping",
      "banana",
      "crossword",
      "jail",
    ],
    bank: 2,
    stars: 1,
    games: 17,
    wins: 12,
    highest: 151,
    auction: slice(1, 1, 543),
    elimination: slice(16, 11, 151),
  },
  {
    id: "hoHe7OoFJoMnu7lKA5515n4kVi5NiJ9o",
    name: "JSwanny",
    avatarId: "club200",
    owned: ["poor", "pilot", "foam", "club200"],
    bank: 18,
    stars: 1,
    games: 20,
    wins: 9,
    highest: 203,
    elimination: slice(20, 9, 203),
  },
  {
    id: "FGR4MUWx09k2LG6w2T8g7X3WKh3KbtfY",
    name: "MSwan",
    avatarId: "santa",
    owned: ["poor", "santa", "foam"],
    bank: 11,
    stars: 1,
    games: 12,
    wins: 7,
    highest: 169,
    elimination: slice(12, 7, 169),
  },
  {
    id: "FWuvVwD2j9Lnc3tG9OcNJcGwLdrzR1L4",
    name: "Marquis Scott",
    avatarId: "wizard",
    owned: [
      "poor",
      "ninja",
      "wizard",
      "detective",
      "birthday",
      "foam",
      "dj",
      "peeping",
      "banana",
      "crossword",
      "jail",
    ],
    bank: 9,
    stars: 3,
    games: 19,
    wins: 4,
    highest: 172,
    auction: slice(1, 0, 524),
    elimination: slice(18, 4, 172),
  },
  {
    id: "3kyNi9jSkwY407xWhqGkxd6ghfopayfS",
    name: "Kel",
    avatarId: "chilipepper",
    owned: ["poor", "werewolf", "chilipepper"],
    bank: 2,
    stars: 0,
    games: 6,
    wins: 2,
    highest: 171,
    elimination: slice(6, 2, 171),
  },
  {
    id: "e7APj7EJ03oPUXuukNxNpWqDzsCjUrIM",
    name: "Commish",
    avatarId: "commish",
    owned: ["poor", "commish"],
    bank: 2,
    stars: 0,
    games: 3,
    wins: 2,
    highest: 99,
    elimination: slice(3, 2, 99),
  },
  {
    id: "SXFdEpGdjeutcnOQfMQw0EOxWGa6ysGD",
    name: "Stevo",
    avatarId: "gladiator",
    owned: ["poor", "gladiator", "cowboy", "crossword"],
    bank: 2,
    stars: 0,
    games: 2,
    wins: 1,
    highest: 125,
    elimination: slice(2, 1, 125),
  },
  {
    id: "9XfClEbu9fjWssgLlw8VUZFqYTqxIpCM",
    name: "Big Blender",
    avatarId: "poor",
    owned: ["poor", "foam"],
    bank: 9,
    stars: 2,
    games: 1,
    wins: 0,
    highest: 107,
    elimination: slice(1, 0, 107),
  },
  {
    id: "nzXf1uYVleklHuDLlJTtVHurD4G5obx1",
    name: "Max Faile",
    avatarId: "poor",
    owned: ["poor", "foam"],
    bank: 5,
    stars: 1,
    games: 0,
    wins: 0,
    highest: null,
  },
  {
    id: "dgAqUjVjd9BgblWZfvu9n16G8ks5H5SB",
    name: "James Mack",
    avatarId: "poor",
    owned: ["poor"],
    bank: 2,
    stars: 0,
    games: 0,
    wins: 0,
    highest: null,
  },
];

const LEGACY_SEED_BY_ID = new Map(LEGACY_SEEDS.map((row) => [row.id, row]));

export function legacySeedFor(userId: string): LegacySeed | null {
  if (!userId || isHiddenBoardId(userId) || HIDDEN_BOARD_IDS.has(userId)) return null;
  return LEGACY_SEED_BY_ID.get(userId) ?? null;
}

function legacyStarSourceKey(userId: string): string {
  return `scratch:legacy-seed:${userId}`;
}

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
  if (seed.stars > 0) {
    await sql.query(
      `insert into darkness_payouts (user_id, amount, stars, kind, source_key)
       values ($1, 0, $2, 'scratch', $3)
       on conflict (source_key) do nothing`,
      [seed.id, seed.stars, legacyStarSourceKey(seed.id)],
    );
  }
  await sql.query(
    `update player_profiles
        set daily_stars = $1, updated_at = now()
      where user_id = $2
        and coalesce(daily_stars, 0) is distinct from $1`,
    [seed.stars, seed.id],
  );
}

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
    const book = {
      total: bookSlice({ games: seed.games, wins: seed.wins, highest: seed.highest }),
      auction: bookSlice(seed.auction ?? emptySlice()),
      elimination: bookSlice(seed.elimination ?? emptySlice()),
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

/** Public boards: seed every LEGACY_SEEDS row. No login. No auth passwords. */
export async function seedAllLegacyPlayers(): Promise<void> {
  for (const seed of LEGACY_SEEDS) {
    if (isHiddenBoardId(seed.id)) continue;
    await seedLegacyPlayer(seed.id);
  }
}
