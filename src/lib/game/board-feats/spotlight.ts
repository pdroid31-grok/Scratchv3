import { SPOTLIGHT_FROM, SPOTLIGHT_ID, SPOTLIGHT_NEED } from "../avatars";
import { grantFeat, type Sql } from "./grant";

let flagsReady = false;

function etDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function ensureFlags(sql: Sql): Promise<void> {
  if (flagsReady) return;
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
  flagsReady = true;
}

/** Hosted Elimination only. Both seated players, never a viewer. */
export async function maybeGrantSpotlight(
  sql: Sql,
  match: {
    code: string;
    createdAt: string | Date;
    userIds: string[];
    kind: string;
    solo: boolean;
    daily: boolean;
    weekly: boolean;
  },
  viewerCount: number,
): Promise<void> {
  if (viewerCount < SPOTLIGHT_NEED) return;
  if (match.kind !== "elimination" || match.solo || match.daily || match.weekly) return;
  if (etDay(match.createdAt) < SPOTLIGHT_FROM) return;
  const ids = [...new Set(match.userIds.filter(Boolean))];
  if (ids.length < 2) return;
  await ensureFlags(sql);
  for (const userId of ids) {
    const key = `spotlight:${match.code}:${userId}`;
    const inserted = await sql.query<{ key: string }>(
      `insert into darkness_feat_flags (key) values ($1) on conflict do nothing returning key`,
      [key],
    );
    if (!inserted[0]) continue;
    try {
      await grantFeat(sql, userId, SPOTLIGHT_ID);
    } catch (err) {
      await sql.query(`delete from darkness_feat_flags where key = $1`, [key]);
      throw err;
    }
  }
}
