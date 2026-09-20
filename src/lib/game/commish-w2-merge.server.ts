/** One-shot: copy Arkeayes Cunning 2026-W2 slate onto Commish. Weekly only. */
import { HIDDEN_BOARD_IDS } from "./stats-shared";
import { clipWeeklyPickIds } from "./weekly";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export const COMMISH_SURVIVOR_ID = "e7APj7EJ03oPUXuukNxNpWqDzsCjUrIM";
export const COMMISH_W2_MERGE_KEY = "commish-w2-arkeayes-2026";
const DONOR_NAME = "arkeayes cunning";
const SEASON = 2026;
const WEEK = 2;

async function ensureFlagTable(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
}

async function lookupDonorIds(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ user_id: string }>(
    `select distinct x.user_id
       from (
         select p.user_id
           from player_profiles p
          where lower(trim(coalesce(p.display_name, ''))) = $1
         union
         select u.id
           from "user" u
          where lower(trim(coalesce(u.name, ''))) = $1
       ) x
      where x.user_id is not null and x.user_id <> '' and x.user_id <> $2`,
    [DONOR_NAME, COMMISH_SURVIVOR_ID],
  );
  return rows.map((row) => String(row.user_id)).filter(Boolean);
}

function pickCount(raw: unknown): number {
  return clipWeeklyPickIds(raw).length;
}

export async function mergeCommishW2Once(sql: Sql): Promise<void> {
  await ensureFlagTable(sql);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_weekly_flags where key = $1`,
    [COMMISH_W2_MERGE_KEY],
  );
  if (already[0]) return;

  const donorIds = await lookupDonorIds(sql);
  if (!donorIds.length) {
    console.log("[darkness] commish w2 merge donor=not-found copied=no");
    return;
  }

  const donorRuns = await sql.query<{ user_id: string; status: string; picks: unknown }>(
    `select user_id, status, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and user_id = any($3::text[])
      order by finished_at desc nulls last, started_at desc`,
    [SEASON, WEEK, donorIds],
  );
  const donor = donorRuns.find((row) => row.status === "done" && pickCount(row.picks) > 0) ?? null;
  const picks = donor?.picks ?? null;
  const copied = Boolean(donor && picks != null);
  const n = copied ? pickCount(picks) : 0;

  if (copied) {
    const payload = typeof picks === "string" ? picks : JSON.stringify(picks);
    await sql.query(
      `insert into darkness_weekly_runs (season, week, user_id, status, score, payout_score, payout_win, picks, finished_at)
       values ($1, $2, $3, 'done', null, false, false, $4::jsonb, now())
       on conflict (season, week, user_id) do update
         set status = 'done',
             score = null,
             payout_score = false,
             payout_win = false,
             picks = excluded.picks,
             finished_at = now()`,
      [SEASON, WEEK, COMMISH_SURVIVOR_ID, payload],
    );
  }

  for (const id of donorIds) {
    HIDDEN_BOARD_IDS.add(id);
    const mail = await sql.query<{ has_email: boolean }>(
      `select (email is not null and btrim(email) <> '') as has_email from "user" where id = $1`,
      [id],
    );
    if (mail[0]?.has_email) {
      await sql.query(
        `update "user"
            set email = $1,
                "updatedAt" = now()
          where id = $2
            and email is not null
            and btrim(email) <> ''
            and email not like 'merged+%@users.invalid'`,
        [`merged+${id}@users.invalid`, id],
      );
    }
    await sql.query(
      `update account
          set "userId" = $1
        where "userId" = $2
          and "providerId" in ('google', 'credential')
          and not exists (
            select 1 from account a2
             where a2."userId" = $1 and a2."providerId" = account."providerId"
          )`,
      [COMMISH_SURVIVOR_ID, id],
    );
  }

  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict do nothing`, [COMMISH_W2_MERGE_KEY]);
  console.log(
    `[darkness] commish w2 merge donor=${donorIds.join(",")} copied=${copied ? "yes" : "no"} picks=${n}`,
  );
}
