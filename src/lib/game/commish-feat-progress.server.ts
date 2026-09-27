/** CEO Avatars tab progress. Read-only. Does not grant, pay, or write. */
import {
  BOX_ADDICT_POOL_NEED,
  BLUE_STREAK_NEED,
  COLD_STREAK_FROM,
  COLD_STREAK_NEED,
  EARLY_BIRD_NEED,
  FEAT_TRACK_FROM,
  NIGHT_OWL_NEED,
  SILVER_SECOND_NEED,
  boxPoolOwnedCount,
  earlyBirdDayCount,
  nightOwlDayCount,
  parseOwned,
  silverSecondDayCount,
  skipHeavyHitterWeek,
  stampDayGap,
  thriftySlotCosts,
  type EarlyBirdRow,
} from "./avatars";
import { dailyBestToneCount } from "./board-feats.server";
import { asTime } from "./board-feats/place-weekly";
import { skipBoardRow } from "./board-feats/grant";
import { dailyDayStamp } from "./daily";
import { clipGm } from "./stats-shared";
import { weeklyAwardEtDay } from "./double-trouble.server";
import {
  COMMISH_AVATAR_PROGRESS,
  COMMISH_SETTINGS_ID,
  isCommishAvatarProgressId,
  type CommishAvatarProgress,
  type CommishAvatarProgressId,
} from "./commish-types";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

type Person = { id: string; name: string; owned: unknown };

const NAME_SQL = `coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), '')`;

function forbidden(): never {
  throw new Response("Forbidden", { status: 403, statusText: "Forbidden" });
}

function currentColdRun(rows: readonly { day: string; won: boolean }[]): number {
  const won = new Map<string, boolean>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < COLD_STREAK_FROM) continue;
    won.set(day, Boolean(won.get(day)) || Boolean(row.won));
  }
  let run = 0;
  for (const day of [...won.keys()].sort()) {
    if (won.get(day)) run = 0;
    else run += 1;
  }
  return run;
}

function money(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `$${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}

function ppr(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function lineupCost(picks: unknown): number | null {
  const costs = thriftySlotCosts(Array.isArray(picks) ? (picks as { slot?: string; cost?: number }[]) : null);
  if (!costs) return null;
  return costs.reduce((sum, cost) => sum + cost, 0);
}

function weekAwardDay(endAt: unknown): string {
  const n = endAt instanceof Date ? endAt.getTime() : Date.parse(String(endAt ?? ""));
  if (!Number.isFinite(n)) return "";
  return weeklyAwardEtDay([], n);
}

function pennySlots(picks: unknown): number | null {
  if (!Array.isArray(picks)) return null;
  const costs = picks.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const id = String((raw as { id?: string }).id ?? "").trim();
    if (!id) return [];
    return [Number((raw as { cost?: number }).cost)];
  });
  if (!costs.length) return null;
  return costs.filter((cost) => cost === 1).length;
}

function bestWeeklyPick(picks: unknown): number | null {
  if (!Array.isArray(picks)) return null;
  let best: number | null = null;
  for (const raw of picks) {
    if (!raw || typeof raw !== "object") continue;
    const id = String((raw as { id?: string }).id ?? "").trim();
    if (!id) continue;
    const score = Number((raw as { score?: number }).score);
    if (!Number.isFinite(score)) continue;
    if (best == null || score > best) best = score;
  }
  return best;
}

async function loadPeople(sql: Sql): Promise<Person[]> {
  const rows = await sql.query<{ id: string; name: string | null; owned: unknown }>(
    `select p.user_id as id, ${NAME_SQL} as name, p.owned
       from player_profiles p
       left join "user" u on u.id = p.user_id`,
  );
  const people: Person[] = [];
  for (const row of rows) {
    const name = String(row.name ?? "");
    if (skipBoardRow(row.id, name) || skipBoardRow(row.id, clipGm(name))) continue;
    people.push({ id: row.id, name: name.trim() || "GM", owned: row.owned });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  return people;
}

async function earlyRows(sql: Sql): Promise<EarlyBirdRow[]> {
  const rows = await sql.query<{ day: string; user_id: string; name: string | null; finished_at: unknown; started_at: unknown }>(
    `select r.day::text as day, r.user_id, ${NAME_SQL} as name, r.finished_at, r.started_at
       from darkness_daily_runs r
       left join player_profiles p on p.user_id = r.user_id
       left join "user" u on u.id = r.user_id
      where r.day >= $1::date and r.status = 'done'`,
    [FEAT_TRACK_FROM],
  );
  const visible: EarlyBirdRow[] = [];
  for (const row of rows) {
    if (skipBoardRow(row.user_id, row.name) || skipBoardRow(row.user_id, clipGm(row.name ?? ""))) continue;
    const at = asTime(row.finished_at) || asTime(row.started_at);
    if (!at) continue;
    visible.push({ day: String(row.day).slice(0, 10), userId: row.user_id, at });
  }
  return visible;
}

async function nightRows(sql: Sql): Promise<EarlyBirdRow[]> {
  const rows = await earlyRows(sql);
  const today = dailyDayStamp();
  return rows.filter((row) => row.day >= today || dailyDayStamp(row.at) === row.day);
}

function fill(people: Person[], value: (id: string) => string): Map<string, string> {
  const out = new Map<string, string>();
  for (const person of people) out.set(person.id, value(person.id));
  return out;
}

async function progressFor(sql: Sql, id: CommishAvatarProgressId, people: Person[]): Promise<Map<string, string>> {
  if (id === "earlybird") {
    const rows = await earlyRows(sql);
    return fill(people, (userId) => `${earlyBirdDayCount(userId, rows)}/${EARLY_BIRD_NEED}`);
  }
  if (id === "nightowl") {
    const rows = await nightRows(sql);
    return fill(people, (userId) => `${nightOwlDayCount(userId, rows)}/${NIGHT_OWL_NEED}`);
  }
  if (id === "coldstreak") {
    const rows = await sql.query<{ user_id: string; day: string; payout_win: boolean | null }>(
      `select r.user_id, r.day::text as day, r.payout_win
         from darkness_daily_runs r
        where r.status = 'done' and r.day >= $1::date`,
      [COLD_STREAK_FROM],
    );
    const by = new Map<string, { day: string; won: boolean }[]>();
    for (const row of rows) {
      const list = by.get(row.user_id) ?? [];
      list.push({ day: String(row.day).slice(0, 10), won: Boolean(row.payout_win) });
      by.set(row.user_id, list);
    }
    return fill(people, (userId) => `${currentColdRun(by.get(userId) ?? [])}/${COLD_STREAK_NEED}`);
  }
  if (id === "lost" || id === "bluestreak" || id === "penny") {
    const rows = await sql.query<{ user_id: string; day: string; year: number | string; week: number | string; picks: unknown }>(
      `select distinct on (r.user_id) r.user_id, r.day::text as day, d.year, d.week, r.picks
         from darkness_daily_runs r
         join darkness_daily_days d on d.day = r.day
        where r.status = 'done'
        order by r.user_id, r.day desc`,
    );
    const last = new Map(rows.map((row) => [row.user_id, row]));
    const today = dailyDayStamp();
    return fill(people, (userId) => {
      const row = last.get(userId);
      if (!row) return "—";
      if (id === "lost") {
        const day = String(row.day).slice(0, 10);
        return String(stampDayGap(day, today));
      }
      if (id === "bluestreak") {
        const picks = Array.isArray(row.picks) ? (row.picks as { id?: string; name?: string; team?: string; slot?: string }[]) : [];
        return `${dailyBestToneCount(picks, Number(row.year), Number(row.week))}/${BLUE_STREAK_NEED}`;
      }
      const n = pennySlots(row.picks);
      return n == null ? "—" : String(n);
    });
  }
  if (id === "thrifty") {
    const daily = await sql.query<{ user_id: string; picks: unknown }>(
      `select user_id, picks
         from darkness_daily_runs
        where status = 'done' and payout_win is true and day >= $1::date`,
      [FEAT_TRACK_FROM],
    );
    const weekly = await sql.query<{ user_id: string; picks: unknown; end_at: unknown }>(
      `select r.user_id, r.picks, w.end_at
         from darkness_weekly_runs r
         join darkness_weekly_weeks w on w.season = r.season and w.week = r.week
        where r.status = 'done' and r.payout_win is true and w.awarded is true`,
    );
    const best = new Map<string, number>();
    const consider = (userId: string, picks: unknown, day: string) => {
      if (!day || day < FEAT_TRACK_FROM) return;
      const cost = lineupCost(picks);
      if (cost == null) return;
      const prev = best.get(userId);
      if (prev == null || cost < prev) best.set(userId, cost);
    };
    for (const row of daily) consider(row.user_id, row.picks, FEAT_TRACK_FROM);
    for (const row of weekly) consider(row.user_id, row.picks, weekAwardDay(row.end_at));
    return fill(people, (userId) => {
      const cost = best.get(userId);
      return cost == null ? "—" : money(cost);
    });
  }
  if (id === "heavyhitter") {
    const rows = await sql.query<{ user_id: string; season: number | string; week: number | string; picks: unknown }>(
      `select r.user_id, r.season, r.week, r.picks
         from darkness_weekly_runs r
         join darkness_weekly_weeks w on w.season = r.season and w.week = r.week
        where w.awarded is true and r.status = 'done' and r.picks is not null`,
    );
    const best = new Map<string, number>();
    for (const row of rows) {
      if (skipHeavyHitterWeek(Number(row.season), Number(row.week))) continue;
      const score = bestWeeklyPick(row.picks);
      if (score == null) continue;
      const prev = best.get(row.user_id);
      if (prev == null || score > prev) best.set(row.user_id, score);
    }
    return fill(people, (userId) => {
      const score = best.get(userId);
      return score == null ? "—" : ppr(score);
    });
  }
  if (id === "silvermedal") {
    const rows = await sql.query<{ day: string; user_id: string; score: number | string }>(
      `select day::text as day, user_id, score
         from darkness_daily_runs
        where status = 'done' and score is not null`,
    );
    const shaped = rows.map((row) => ({
      day: String(row.day).slice(0, 10),
      userId: row.user_id,
      score: Number(row.score) || 0,
    }));
    return fill(people, (userId) => `${silverSecondDayCount(shaped, userId)}/${SILVER_SECOND_NEED}`);
  }
  if (id === "boxaddict") {
    return fill(people, (userId) => {
      const person = people.find((row) => row.id === userId);
      return `${boxPoolOwnedCount(parseOwned(person?.owned))}/${BOX_ADDICT_POOL_NEED}`;
    });
  }
  if (id === "vegas") {
    const rows = await sql.query<{ user_id: string }>(
      `select distinct user_id from darkness_scratch_cards where scratched_at is not null`,
    );
    const hit = new Set(rows.map((row) => row.user_id));
    return fill(people, (userId) => (hit.has(userId) ? "1" : "0"));
  }
  const rows = await sql.query<{ user_id: string }>(
    `select distinct split_part(n.source_key, ':', 2) as user_id
       from darkness_news n
      where n.kind = 'box'
        and n.source_key like 'box:%'
        and to_char(n.created_at at time zone 'America/New_York', 'YYYY-MM-DD') >= $1
        and exists (
          select 1
            from darkness_scratch_cards c
           where c.user_id = split_part(n.source_key, ':', 2)
             and c.scratched_at is not null
             and to_char(c.scratched_at at time zone 'America/New_York', 'YYYY-MM-DD')
               = to_char(n.created_at at time zone 'America/New_York', 'YYYY-MM-DD')
        )`,
    [FEAT_TRACK_FROM],
  );
  const hit = new Set(rows.map((row) => row.user_id));
  return fill(people, (userId) => (hit.has(userId) ? "1" : "0"));
}

export async function commishAvatarProgressHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { id: string };
}): Promise<CommishAvatarProgress> {
  if (context.userId !== COMMISH_SETTINGS_ID) forbidden();
  const spec = COMMISH_AVATAR_PROGRESS.find((row) => row.id === data.id);
  if (!spec || !isCommishAvatarProgressId(data.id)) return { label: "", hint: "", rows: [] };
  const sql = await (await import("@/lib/db")).getSql();
  const people = await loadPeople(sql);
  const progress = await progressFor(sql, spec.id, people);
  return {
    label: spec.label,
    hint: spec.hint,
    rows: people.map((person) => ({
      id: person.id,
      name: person.name,
      progress: progress.get(person.id) ?? "—",
    })),
  };
}
