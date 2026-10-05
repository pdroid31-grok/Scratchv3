import {
  COLD_STREAK_FROM,
  COLD_STREAK_NEED,
  CROSSWORD_STREAK_NEED,
  FEAT_TRACK_FROM,
  FOCUSED_STREAK_NEED,
  ICE_COLD_STREAK_NEED,
  LOCKED_IN_STREAK_NEED,
  LOST_GAP_DAYS,
  LUMPED_UP_DAYS,
  LUMPED_UP_UNDER,
  BOX_ADDICT_POOL_NEED,
  EARLY_BIRD_NEED,
  NIGHT_OWL_NEED,
  POOP_NEED,
  SILVER_SECOND_NEED,
  MUSICAL_CHAIRS_NEED,
  THANOS_OWN_NEED,
  THREE_LEAF_NEED,
  TREND_FROM,
  boxPoolOwnedCount,
  earlyBirdDayCount,
  nightOwlDayCount,
  parseOwned,
  silverSecondDayCount,
} from "./avatars";
import { EASY_DOLLAR_LINE, EASY_DOLLAR_NEED } from "./avatars/money";
import { RAINY_DAY_FROM } from "./board-feats/place-daily";
import { asTime } from "./board-feats/place-weekly";
import { skipBoardRow } from "./board-feats/grant";
import { dailyDayStamp, dailyYesterday } from "./daily";
import { clipGm } from "./stats-shared";
import {
  currentCalendarRun,
  currentColdRun,
  currentLastPlaceRun,
  currentUnderRun,
  daysSince,
  fallingTail,
  risingTail,
  trailingAtLeast,
  musicalChairLine,
  placesHeld,
  type FeatProgressLines,
} from "./feat-progress";
import type { Sql } from "@/lib/db";

const RAINY_NEED = 2;
const TREND_NEED = 3;

function line(n: number, need: number, rule: string): string {
  return `${n} / ${need}. ${rule}`;
}

function total(n: number, need: number, noun: string): string {
  return `${n} / ${need} ${noun}. A skip does not break it.`;
}

function pairLine(hitYesterday: boolean, todayAwarded: boolean, hitToday: boolean, yesterdayWord: string, todayWord: string): string {
  if (!hitYesterday) return `Not ${yesterdayWord} yesterday.`;
  if (!todayAwarded) return `${cap(yesterdayWord)} yesterday. Need ${todayWord} today.`;
  if (!hitToday) return `${cap(yesterdayWord)} yesterday. Not ${todayWord} today.`;
  return `${cap(yesterdayWord)} yesterday. ${cap(todayWord)} today.`;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export async function loadFeatProgress(sql: Sql, userId: string): Promise<FeatProgressLines> {
  const today = dailyDayStamp();
  const yesterday = dailyYesterday(today);
  const runs = await sql.query<{ day: string; score: number | string | null; payout_win: boolean | null }>(
    `select r.day::text as day, r.score, r.payout_win
       from darkness_daily_runs r
      where r.user_id = $1 and r.status = 'done'`,
    [userId],
  );
  const played = runs.map((row) => ({
    day: String(row.day).slice(0, 10),
    score: row.score == null ? null : Number(row.score),
    won: Boolean(row.payout_win),
  }));
  const doneDays = played.map((row) => row.day);
  const focusedDays = doneDays.filter((day) => day >= FEAT_TRACK_FROM);
  const scored = played.flatMap((row) => (row.score != null && Number.isFinite(row.score) ? [{ day: row.day, score: row.score }] : []));
  const trendScores = scored.filter((row) => row.day >= TREND_FROM).sort((a, b) => a.day.localeCompare(b.day)).map((row) => row.score);
  const lumped = scored.filter((row) => row.day >= FEAT_TRACK_FROM);
  const cold = played.filter((row) => row.day >= COLD_STREAK_FROM).map((row) => ({ day: row.day, won: row.won }));
  const coldNow = currentColdRun(cold);
  const calendar = currentCalendarRun(focusedDays, today);
  const lastDay = [...doneDays].sort().at(-1) ?? "";

  const boards = await sql.query<{ day: string; user_id: string; name: string | null; score: number | string; awarded: boolean }>(
    `select d.day::text as day, r.user_id, r.score, d.awarded,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from darkness_daily_days d
       join darkness_daily_runs r on r.day = d.day
      left join player_profiles p on p.user_id = r.user_id
      left join "user" u on u.id = r.user_id
      where d.awarded is true
        and d.day >= $1::date
        and r.status = 'done'
        and r.score is not null`,
    [RAINY_DAY_FROM < FEAT_TRACK_FROM ? RAINY_DAY_FROM : FEAT_TRACK_FROM],
  );
  const byDay = new Map<string, { userId: string; score: number }[]>();
  for (const row of boards) {
    const day = String(row.day).slice(0, 10);
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const list = byDay.get(day) ?? [];
    list.push({ userId: row.user_id, score });
    byDay.set(day, list);
  }
  const awardedDays = [...byDay.keys()];
  const lastDays: string[] = [];
  const firstDays: string[] = [];
  for (const [day, list] of byDay) {
    if (list.length < 2) continue;
    const low = Math.min(...list.map((row) => row.score));
    const high = Math.max(...list.map((row) => row.score));
    if (list.some((row) => row.userId === userId && row.score === low)) lastDays.push(day);
    if (list.some((row) => row.userId === userId && row.score === high)) firstDays.push(day);
  }
  const yesterdayAwarded = byDay.has(yesterday);
  const todayAwarded = byDay.has(today);
  const poop = lastDays.filter((day) => day >= FEAT_TRACK_FROM).length;
  const silverRows = [...byDay.entries()].flatMap(([day, list]) =>
    day >= FEAT_TRACK_FROM ? list.map((row) => ({ day, userId: row.userId, score: row.score })) : [],
  );
  const locks = await sql.query<{ day: string; user_id: string; name: string | null; finished_at: unknown; started_at: unknown }>(
    `select r.day::text as day, r.user_id, r.finished_at, r.started_at,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '') as name
       from darkness_daily_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.day >= $1::date and r.status = 'done'`,
    [FEAT_TRACK_FROM],
  );
  const early: { day: string; userId: string; at: number }[] = [];
  const owl: { day: string; userId: string; at: number }[] = [];
  for (const row of locks) {
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const at = asTime(row.finished_at) || asTime(row.started_at);
    if (!at) continue;
    const day = String(row.day).slice(0, 10);
    early.push({ day, userId: row.user_id, at });
    if (day >= today || dailyDayStamp(at) === day) owl.push({ day, userId: row.user_id, at });
  }
  const ownedRows = await sql.query<{ owned: unknown }>(`select owned from player_profiles where user_id = $1`, [userId]);
  const owned = parseOwned(ownedRows[0]?.owned);
  const scratches = await sql.query<{ prize: string | null }>(
    `select distinct prize from darkness_scratch_cards where user_id = $1 and scratched_at is not null`,
    [userId],
  );
  const leaf = new Set(scratches.map((row) => String(row.prize ?? "").trim()).filter(Boolean)).size;

  return {
    crossword: line(currentCalendarRun(doneDays, today), CROSSWORD_STREAK_NEED, "A skipped Daily breaks it."),
    focused: line(calendar, FOCUSED_STREAK_NEED, "A skipped calendar day breaks it."),
    lockedin: line(calendar, LOCKED_IN_STREAK_NEED, "A skipped calendar day breaks it."),
    rainyday: line(
      currentLastPlaceRun(
        awardedDays.filter((day) => day >= RAINY_DAY_FROM),
        lastDays.filter((day) => day >= RAINY_DAY_FROM),
        today,
      ),
      RAINY_NEED,
      "Not finishing last breaks it.",
    ),
    trending: line(risingTail(trendScores), TREND_NEED, "A score that does not rise breaks it."),
    canceled: line(fallingTail(trendScores), TREND_NEED, "A score that does not fall breaks it."),
    easydollar: line(trailingAtLeast(trendScores, EASY_DOLLAR_LINE), EASY_DOLLAR_NEED, "A Daily under 100 breaks it."),
    lumpedup: line(currentUnderRun(lumped, today, LUMPED_UP_UNDER), LUMPED_UP_DAYS, "A Daily at 100+ breaks it."),
    coldstreak: line(coldNow, COLD_STREAK_NEED, "A Daily win breaks it. A skipped Daily does not count and does not break it."),
    icecoldstreak: line(coldNow, ICE_COLD_STREAK_NEED, "A Daily win breaks it. A skipped Daily does not count and does not break it."),
    comebackkid: pairLine(lastDays.includes(yesterday) && yesterdayAwarded, todayAwarded, firstDays.includes(today), "last", "first"),
    freefall: pairLine(firstDays.includes(yesterday) && yesterdayAwarded, todayAwarded, lastDays.includes(today), "first", "last"),
    lost: line(daysSince(lastDay, today), LOST_GAP_DAYS, "Days since your last Daily."),
    poop: total(poop, POOP_NEED, "last-place Dailys"),
    earlybird: total(earlyBirdDayCount(userId, early), EARLY_BIRD_NEED, "first locks"),
    nightowl: total(nightOwlDayCount(userId, owl), NIGHT_OWL_NEED, "last locks"),
    silvermedal: total(silverSecondDayCount(silverRows, userId), SILVER_SECOND_NEED, "seconds"),
    thanos: total(new Set(owned).size, THANOS_OWN_NEED, "owned"),
    boxaddict: total(boxPoolOwnedCount(owned), BOX_ADDICT_POOL_NEED, "boxes"),
    threeleafclover: total(leaf, THREE_LEAF_NEED, "scratch results"),
    musicalchairs: musicalChairLine(
      placesHeld(
        [...byDay.entries()].filter(([day]) => day >= COLD_STREAK_FROM).map(([, list]) => list),
        userId,
        MUSICAL_CHAIRS_NEED,
      ),
    ),
  };
}
