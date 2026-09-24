/** Career book handlers. Move-only from stats.server. */
import { clampAvatar, isAvatarId, type AvatarId } from "../avatars";
import { clipDisplayName } from "../stats-shared";
import { syncDailyStarsFromPayouts } from "../payouts";
import type { BookSlice, CareerBook, CareerOpponent, PublicBook } from "../stats-types";
import { asInt, emptyBook, emptySlice, type OppRow, type TotalsRow } from "./shared";
import { catchUpStarLooksAll } from "./stars";
import { settleProfile } from "./profile";
import { ensureNightLowScore } from "./nights";

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

async function withScratchBook(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
  book: Omit<CareerBook, "scratchBank" | "scratchReady">,
): Promise<CareerBook> {
  try {
    const { syncScratchBank } = await import("../scratch.server");
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
      try {
        const { backfillPatDjUnlockOnce } = await import("../news.server");
        await backfillPatDjUnlockOnce(sql);
      } catch (err) {
        console.error("[darkness] pat dj unlock backfill failed", err);
      }
      try {
        const { grantPatBoxLunchOnce } = await import("../board-feats.server");
        await grantPatBoxLunchOnce(sql);
      } catch (err) {
        console.error("[darkness] pat box lunch check failed", err);
      }
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

