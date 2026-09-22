/** Public boards. Move-only from stats.server. */
import { clampAvatar } from "../avatars";
import { clipDisplayName, hiddenBoardIdSql, hiddenBoardNameSql, isHiddenBoardId, isHiddenBoardName } from "../stats-shared";
import type { BoardRow, Leaderboard } from "../stats-types";
import { asInt } from "./shared";

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

