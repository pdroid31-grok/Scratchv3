/** One-shot: copy donor 2026-W2 slate onto Commish by id. Weekly only. */
import { HIDDEN_BOARD_IDS } from "./stats-shared";
import { clipWeeklyPickIds } from "./weekly";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export const COMMISH_SURVIVOR_ID = "e7APj7EJ03oPUXuukNxNpWqDzsCjUrIM";
export const COMMISH_W2_DONOR_ID = "e20r0ZNjMbkgSw6DsHSpqQLTfXX3Xnfh";
export const COMMISH_W2_MERGE_KEY = "commish-w2-arkeayes-2026";
const COMMISH_W2_RUN_KEY = "commish-w2-e20r0-2026";
const SEASON = 2026;
const WEEK = 2;

async function ensureFlagTable(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_weekly_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
}

function pickCount(raw: unknown): number {
  return clipWeeklyPickIds(raw).length;
}

export async function mergeCommishW2Once(sql: Sql): Promise<void> {
  await ensureFlagTable(sql);
  const already = await sql.query<{ key: string }>(
    `select key from darkness_weekly_flags where key = $1`,
    [COMMISH_W2_RUN_KEY],
  );
  if (already[0]) return;

  await sql.query(`delete from darkness_weekly_flags where key = $1`, [COMMISH_W2_MERGE_KEY]);
  HIDDEN_BOARD_IDS.add(COMMISH_W2_DONOR_ID);

  const donorRuns = await sql.query<{ user_id: string; status: string; picks: unknown }>(
    `select user_id, status, picks
       from darkness_weekly_runs
      where season = $1 and week = $2 and user_id = $3
      limit 1`,
    [SEASON, WEEK, COMMISH_W2_DONOR_ID],
  );
  const donor = donorRuns[0];
  const picks = donor?.picks ?? null;
  const copied = Boolean(donor && donor.status === "done" && picks != null);
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

  const mail = await sql.query<{ has_email: boolean }>(
    `select (email is not null and btrim(email) <> '') as has_email from "user" where id = $1`,
    [COMMISH_W2_DONOR_ID],
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
      [`merged+${COMMISH_W2_DONOR_ID}@users.invalid`, COMMISH_W2_DONOR_ID],
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
    [COMMISH_SURVIVOR_ID, COMMISH_W2_DONOR_ID],
  );

  await sql.query(`insert into darkness_weekly_flags (key) values ($1) on conflict do nothing`, [COMMISH_W2_RUN_KEY]);
  console.log(
    `[darkness] commish w2 merge donor=${COMMISH_W2_DONOR_ID} copied=${copied ? "yes" : "no"} picks=${n}`,
  );
}
