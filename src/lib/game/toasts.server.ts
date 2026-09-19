/** Server-only celebration toasts. Going forward — do not backfill. */
import { parseOwned, starLooksFor, starNeed, clampAvatar, type AvatarId } from "./avatars";
import { clipGm, isAwardSkippedName, isHiddenBoardId, isHiddenBoardName } from "./stats-shared";
import { clipToastPicks, isToastKind, sortToasts, type ToastItem, type ToastKind, type ToastPayload } from "./toasts";

type Sql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };

export async function ensureToastsTable(sql: Sql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_toasts (
      user_id text not null,
      kind text not null,
      source_key text not null unique,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      seen_at timestamptz
    )`);
  await sql.query(
    "create index if not exists darkness_toasts_unseen_idx on darkness_toasts (user_id, seen_at, created_at)",
  );
}

function skipToastWho(userId?: string | null, name?: string | null): boolean {
  return isHiddenBoardId(userId) || isHiddenBoardName(name) || isAwardSkippedName(name);
}

export async function recordToast(
  sql: Sql,
  input: { userId: string; kind: ToastKind; sourceKey: string; payload: ToastPayload },
): Promise<void> {
  await ensureToastsTable(sql);
  if (skipToastWho(input.userId, input.payload.name)) return;
  await sql.query(
    `insert into darkness_toasts (user_id, kind, source_key, payload)
     values ($1, $2, $3, $4::jsonb)
     on conflict (source_key) do nothing`,
    [input.userId, input.kind, input.sourceKey, JSON.stringify({ ...input.payload, kind: input.kind })],
  );
}

export async function recordToastSafe(
  sql: Sql,
  input: { userId: string; kind: ToastKind; sourceKey: string; payload: ToastPayload },
): Promise<void> {
  try {
    await recordToast(sql, input);
  } catch (err) {
    console.error("[darkness] toast record failed", err);
  }
}

async function toastActor(
  sql: Sql,
  userId: string,
): Promise<{ name: string; avatarId: AvatarId } | null> {
  const rows = await sql.query<{ name: string | null; avatar_id: string | null }>(
    `select coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as name,
            p.avatar_id
       from player_profiles p
       left join "user" u on u.id = p.user_id
      where p.user_id = $1
     limit 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const name = clipGm(row.name ?? "");
  if (skipToastWho(userId, name) || skipToastWho(userId, row.name)) return null;
  return { name, avatarId: clampAvatar(row.avatar_id ?? "poor") };
}

export async function recordDailyWinToast(
  sql: Sql,
  input: { userId: string; day: string; score: number; picks: unknown },
): Promise<void> {
  const actor = await toastActor(sql, input.userId);
  if (!actor) return;
  await recordToastSafe(sql, {
    userId: input.userId,
    kind: "daily_win",
    sourceKey: `daily_win:${input.day}:${input.userId}`,
    payload: {
      kind: "daily_win",
      name: actor.name,
      avatarId: actor.avatarId,
      score: Math.round(input.score * 10) / 10,
      day: input.day,
      picks: clipToastPicks(input.picks),
      coins: 1,
      stars: 1,
    },
  });
  await recordStarJumpToasts(sql, input.userId, 1);
}

export async function recordWeeklyWinToast(
  sql: Sql,
  input: { userId: string; season: number; week: number; score: number; picks: unknown },
): Promise<void> {
  const actor = await toastActor(sql, input.userId);
  if (!actor) return;
  await recordToastSafe(sql, {
    userId: input.userId,
    kind: "weekly_win",
    sourceKey: `weekly_win:${input.season}-W${input.week}:${input.userId}`,
    payload: {
      kind: "weekly_win",
      name: actor.name,
      avatarId: actor.avatarId,
      score: Math.round(input.score * 10) / 10,
      week: input.week,
      season: input.season,
      picks: clipToastPicks(input.picks),
      coins: 2,
      stars: 2,
    },
  });
  await recordStarJumpToasts(sql, input.userId, 2);
}

async function recordStarJumpToasts(sql: Sql, userId: string, gained: number): Promise<void> {
  const { countPayoutStars } = await import("./payouts");
  const after = await countPayoutStars(sql, userId);
  if (after == null) return;
  const before = Math.max(0, after - gained);
  const rows = await sql.query<{ owned: unknown }>(`select owned from player_profiles where user_id = $1`, [userId]);
  const owned = parseOwned(rows[0]?.owned);
  const fresh = starLooksFor(after).filter((id) => !starLooksFor(before).includes(id) && !owned.includes(id));
  for (const id of fresh) {
    const { avatarById } = await import("./avatars");
    const prize = avatarById(id);
    await recordToastSafe(sql, {
      userId,
      kind: "star_unlock",
      sourceKey: `star_unlock:${userId}:${prize.id}`,
      payload: {
        kind: "star_unlock",
        prizeId: prize.id,
        prizeLabel: prize.name,
        starNeed: starNeed(prize.id),
      },
    });
  }
}

export async function recordUnlockToast(
  sql: Sql,
  userId: string,
  prizeId: string,
  from: "stars" | "feats",
): Promise<void> {
  const actor = await toastActor(sql, userId);
  if (!actor) return;
  const { avatarById } = await import("./avatars");
  const prize = avatarById(prizeId);
  const kind: ToastKind = from === "stars" ? "star_unlock" : "feat_unlock";
  await recordToastSafe(sql, {
    userId,
    kind,
    sourceKey: `${kind}:${userId}:${prize.id}`,
    payload: {
      kind,
      prizeId: prize.id,
      prizeLabel: prize.name,
      starNeed: from === "stars" ? starNeed(prize.id) : undefined,
    },
  });
}

function asTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function listUnseenToasts(sql: Sql, userId: string): Promise<ToastItem[]> {
  await ensureToastsTable(sql);
  const rows = await sql.query<{ source_key: string; kind: string; payload: unknown; created_at: Date | string }>(
    `select source_key, kind, payload, created_at
       from darkness_toasts
      where user_id = $1 and seen_at is null
      order by created_at asc`,
    [userId],
  );
  const items: ToastItem[] = [];
  for (const row of rows) {
    if (!isToastKind(row.kind)) continue;
    let payload = row.payload as ToastPayload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload) as ToastPayload;
      } catch {
        continue;
      }
    }
    items.push({
      sourceKey: row.source_key,
      kind: row.kind,
      payload: { ...payload, kind: row.kind, picks: clipToastPicks(payload.picks) },
      createdAt: asTime(row.created_at),
    });
  }
  return sortToasts(items);
}

export async function markToastSeen(sql: Sql, userId: string, sourceKey: string): Promise<void> {
  await ensureToastsTable(sql);
  const key = String(sourceKey ?? "").slice(0, 240);
  if (!key) return;
  await sql.query(
    `update darkness_toasts
        set seen_at = now()
      where user_id = $1 and source_key = $2 and seen_at is null`,
    [userId, key],
  );
}
