/** Mystery box, Golden Pepe, Peeping. Move-only from stats.server. */
import { avatarById, pickPrize, BOX_COST, GOLDEN_COST, ONEONE_ID, NPL_ID, PEEPING_ID, type AvatarId } from "../avatars";
import type { BoxResult, ShopResult } from "../stats-types";
import { announceFeatUnlocks } from "./feats";
import { settleProfile, jailAvatarLocked } from "./profile";

export async function grantPeeping(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  const settled = await settleProfile(sql, userId);
  if (settled.owned.includes(PEEPING_ID)) return false;
  const owned = [...settled.owned, PEEPING_ID];
  await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
    JSON.stringify(owned),
    userId,
  ]);
  await announceFeatUnlocks(sql, userId, [PEEPING_ID]);
  try {
    const { maybeGrantHunters } = await import("../board-feats/shop");
    await maybeGrantHunters(sql, userId);
  } catch (err) {
    console.error("[darkness] hunter ladder failed", err);
  }
  return true;
}

export async function openMysteryBoxHandler({ context }: { context: { userId: string } }): Promise<BoxResult> {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    if (!(await claimSpend(sql, context.userId))) {
      const settled = await settleProfile(sql, context.userId);
      return { ok: false, reason: "broke", coins: settled.coins, owned: settled.owned };
    }
    try {
    const settled = await settleProfile(sql, context.userId);
    if (settled.coins < BOX_COST) {
      return { ok: false, reason: "broke", coins: settled.coins, owned: settled.owned };
    }
    const prize = pickPrize(settled.owned, `${context.userId}:${Date.now()}:${settled.owned.length}`);
    if (!prize) {
      return { ok: false, reason: "complete", coins: settled.coins, owned: settled.owned };
    }
    const owned = [...settled.owned, prize];
    await sql.query(
      `update player_profiles
       set owned = $1, box_opens = coalesce(box_opens, 0) + 1, updated_at = now()
       where user_id = $2`,
      [JSON.stringify(owned), context.userId],
    );
    const { recordBankChange } = await import("../bank-watch");
    await recordBankChange(sql, context.userId, settled.coins, settled.coins - BOX_COST, "box");
    const next = await settleProfile(sql, context.userId);
    try {
      const { recordNewsSafe, newsActor } = await import("../news.server");
      const actor = await newsActor(sql, context.userId);
      if (actor) {
        await recordNewsSafe(sql, {
          sourceKey: `box:${context.userId}:${next.owned.length}:${prize}`,
          payload: {
            kind: "box",
            faces: [{ name: actor.name, avatarId: actor.avatarId, userId: context.userId }],
            prizeId: prize,
            prizeLabel: avatarById(prize).name,
          },
        });
      }
    } catch (err) {
      console.error("[darkness] box news failed", err);
    }
    try {
      const { maybeGrantBoxLunch } = await import("../board-feats.server");
      await maybeGrantBoxLunch(sql, context.userId);
    } catch (err) {
      console.error("[darkness] box lunch failed", err);
    }
    return { ok: true, prize, coins: next.coins, owned: next.owned, avatarId: settled.avatarId };
    } finally {
      await releaseSpend(sql, context.userId);
    }
}

const GOLDEN_FLAG = "golden-1of1";

async function ensureFeatFlags(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
}

async function claimSpend(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<boolean> {
  await ensureFeatFlags(sql);
  await sql.query(
    `delete from darkness_feat_flags where key = 'spend:' || $1 and created_at < now() - interval '30 seconds'`,
    [userId],
  );
  const claimed = await sql.query<{ key: string }>(
    `insert into darkness_feat_flags (key) values ('spend:' || $1) on conflict do nothing returning key`,
    [userId],
  );
  return Boolean(claimed[0]);
}

async function releaseSpend(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<void> {
  await sql.query(`delete from darkness_feat_flags where key = 'spend:' || $1`, [userId]);
}

export async function getShowcaseHandler(): Promise<{ sold: boolean; revealed: boolean }> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureFeatFlags(sql);
  const sold = await sql.query<{ key: string }>(`select key from darkness_feat_flags where key = $1`, [GOLDEN_FLAG]);
  const revealed = await sql.query<{ ok: number }>(
    `select 1 as ok from player_profiles where position($1 in owned::text) > 0 limit 1`,
    ['"oneone"'],
  );
  return { sold: Boolean(sold[0]), revealed: Boolean(revealed[0]) };
}

export async function buyGoldenPepeHandler({ context }: { context: { userId: string } }): Promise<ShopResult> {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const settled = await settleProfile(sql, context.userId);
    await ensureFeatFlags(sql);
    const claimed = await sql.query<{ key: string }>(
      `insert into darkness_feat_flags (key) values ($1) on conflict do nothing returning key`,
      [GOLDEN_FLAG],
    );
    if (!claimed[0]) {
      return { ok: false, reason: "sold", coins: settled.coins, owned: settled.owned };
    }
    if (settled.owned.includes("golden")) {
      return { ok: false, reason: "owned", coins: settled.coins, owned: settled.owned };
    }
    if (settled.coins < GOLDEN_COST) {
      await sql.query(`delete from darkness_feat_flags where key = $1`, [GOLDEN_FLAG]);
      return { ok: false, reason: "broke", coins: settled.coins, owned: settled.owned };
    }
    const owned = [...settled.owned, "golden" as AvatarId];
    const jailed = await jailAvatarLocked(sql, context.userId);
    if (jailed) {
      await sql.query(`update player_profiles set owned = $1, updated_at = now() where user_id = $2`, [
        JSON.stringify(owned),
        context.userId,
      ]);
    } else {
      await sql.query(
        `update player_profiles
         set owned = $1, avatar_id = $2, updated_at = now()
         where user_id = $3`,
        [JSON.stringify(owned), "golden", context.userId],
      );
    }
    try {
      const { grantFeat } = await import("../board-feats/grant");
      await grantFeat(sql, context.userId, ONEONE_ID);
    } catch (err) {
      console.error("[darkness] 1/1 grant failed", err);
    }
    try {
      const { grantShowcaseScratch } = await import("../scratch.server");
      await grantShowcaseScratch(sql, context.userId);
    } catch (err) {
      console.error("[darkness] 1/1 scratch failed", err);
    }
    const next = await settleProfile(sql, context.userId);
    return { ok: true, coins: next.coins, owned: next.owned, avatarId: jailed ? next.avatarId : "golden" };
}

const NPL_TEAM_COST = 50;
const NPL_PLAYER_COST = 10;
const NPL_TEAM_CAP = 6;
const NPL_PLAYER_CAP = 20;

type NplSql = { query: <T>(text: string, params?: unknown[]) => Promise<T[]> };
type NplKind = "team" | "player";
type NplStatus = "form" | "pending" | "denied" | "approved";

type NplRow = {
  id: number | string;
  kind: string;
  n: number | string;
  user_id: string;
  status: string;
  name: string | null;
  logo: string | null;
  colors: string | null;
  first_name: string | null;
  last_name: string | null;
  deny_reason: string | null;
  note: string | null;
  buyer: string | null;
};

function nplCost(kind: NplKind): number {
  return kind === "team" ? NPL_TEAM_COST : NPL_PLAYER_COST;
}

function nplCap(kind: NplKind): number {
  return kind === "team" ? NPL_TEAM_CAP : NPL_PLAYER_CAP;
}

function clipNpl(value: unknown, max = 80): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nplKind(value: unknown): NplKind | null {
  return value === "team" || value === "player" ? value : null;
}

function nplStatus(value: string): NplStatus {
  if (value === "pending" || value === "denied" || value === "approved" || value === "form") return value;
  return "form";
}

async function ensureNpl(sql: NplSql): Promise<void> {
  await sql.query(`
    create table if not exists darkness_npl (
      id serial primary key,
      kind text not null,
      n int not null,
      user_id text not null,
      status text not null,
      name text not null default '',
      logo text not null default '',
      colors text not null default '',
      first_name text not null default '',
      last_name text not null default '',
      deny_reason text not null default '',
      note text not null default '',
      created_at timestamptz not null default now()
    )`);
  await sql.query(`create unique index if not exists darkness_npl_kind_n on darkness_npl (kind, n)`);
  await sql.query(`alter table darkness_npl add column if not exists cost int`);
}

export async function nplSpend(sql: NplSql, userId: string): Promise<number> {
  try {
    const rows = await sql.query<{ n: number | string | null }>(
      `select coalesce(sum(coalesce(cost, case kind when 'team' then $2 when 'player' then $3 else 0 end)), 0)::int as n
         from darkness_npl
        where user_id = $1`,
      [userId, NPL_TEAM_COST, NPL_PLAYER_COST],
    );
    return Math.max(0, Math.floor(Number(rows[0]?.n) || 0));
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "42P01") return 0;
    if (code === "42703") {
      await ensureNpl(sql);
      return nplSpend(sql, userId);
    }
    throw err;
  }
}

async function nplLeft(sql: NplSql): Promise<{ teamLeft: number; playerLeft: number }> {
  await ensureNpl(sql);
  const rows = await sql.query<{ kind: string; n: number | string }>(
    `select kind, count(*)::int as n from darkness_npl group by kind`,
  );
  const used = new Map(rows.map((row) => [row.kind, Math.floor(Number(row.n) || 0)]));
  return {
    teamLeft: Math.max(0, NPL_TEAM_CAP - (used.get("team") ?? 0)),
    playerLeft: Math.max(0, NPL_PLAYER_CAP - (used.get("player") ?? 0)),
  };
}

function mineSlot(row: NplRow) {
  return {
    id: Math.floor(Number(row.id) || 0),
    kind: row.kind === "player" ? "player" as const : "team" as const,
    status: nplStatus(row.status),
    name: row.name ?? "",
    logo: row.logo ?? "",
    colors: row.colors ?? "",
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    denyReason: row.deny_reason ?? "",
    note: row.note ?? "",
  };
}

const NPL_MINE_SQL = `select id, kind, n, user_id, status, name, logo, colors, first_name, last_name, deny_reason, note, '' as buyer
  from darkness_npl where user_id = $1 order by id`;

export async function getNplStockHandler(): Promise<{ teamLeft: number; playerLeft: number; teamCost: number; playerCost: number }> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const left = await nplLeft(sql);
  return { ...left, teamCost: NPL_TEAM_COST, playerCost: NPL_PLAYER_COST };
}

export async function getNplMineHandler({ context }: { context: { userId: string } }) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const stock = await getNplStockHandler();
  const rows = await sql.query<NplRow>(NPL_MINE_SQL, [context.userId]);
  return { ...stock, slots: rows.map(mineSlot) };
}

export async function buyNplHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { kind: string };
}): Promise<{ ok: true; id: number; kind: NplKind; coins: number } | { ok: false; reason: "kind" | "sold" | "broke"; coins: number }> {
  const kind = nplKind(data.kind);
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  if (!kind) {
    const settled = await settleProfile(sql, context.userId);
    return { ok: false, reason: "kind", coins: settled.coins };
  }
  await ensureNpl(sql);
  if (!(await claimSpend(sql, context.userId))) {
    const settled = await settleProfile(sql, context.userId);
    return { ok: false, reason: "broke", coins: settled.coins };
  }
  try {
  const settled = await settleProfile(sql, context.userId);
  const cost = nplCost(kind);
  if (settled.coins < cost) return { ok: false, reason: "broke", coins: settled.coins };
  const cap = nplCap(kind);
  let inserted: { id: number | string }[] = [];
  for (let attempt = 0; attempt < 3 && !inserted[0]; attempt += 1) {
    inserted = await sql.query<{ id: number | string }>(
      `with nxt as (
         select coalesce(max(n), 0) + 1 as n
           from darkness_npl
          where kind = $1
       )
       insert into darkness_npl (kind, n, user_id, status, cost)
       select $1, nxt.n, $2, 'form', $4
         from nxt
        where nxt.n <= $3
       on conflict (kind, n) do nothing
       returning id`,
      [kind, context.userId, cap, cost],
    );
  }
  if (!inserted[0]) return { ok: false, reason: "sold", coins: settled.coins };
  try {
    const { grantFeat } = await import("../board-feats/grant");
    await grantFeat(sql, context.userId, NPL_ID);
  } catch (err) {
    console.error("[darkness] npl grant failed", err);
  }
  const next = await settleProfile(sql, context.userId);
  return { ok: true, id: Math.floor(Number(inserted[0].id) || 0), kind, coins: next.coins };
  } finally {
    await releaseSpend(sql, context.userId);
  }
}

export async function submitNplHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { id: number; name: string; logo: string; colors: string; firstName: string; lastName: string };
}): Promise<{ ok: true } | { ok: false; reason: "empty" | "closed" }> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNpl(sql);
  const rows = await sql.query<NplRow>(
    `select id, kind, n, user_id, status, name, logo, colors, first_name, last_name, deny_reason, note, '' as buyer
       from darkness_npl where id = $1 and user_id = $2`,
    [data.id, context.userId],
  );
  const row = rows[0];
  if (!row || (row.status !== "form" && row.status !== "denied")) return { ok: false, reason: "closed" };
  const name = clipNpl(data.name);
  const logo = clipNpl(data.logo);
  const colors = clipNpl(data.colors);
  const firstName = clipNpl(data.firstName);
  const lastName = clipNpl(data.lastName);
  if (row.kind === "team" ? !name || !logo || !colors : !firstName || !lastName) return { ok: false, reason: "empty" };
  const saved = await sql.query<{ id: number | string }>(
    `update darkness_npl
        set status = 'pending', name = $3, logo = $4, colors = $5, first_name = $6, last_name = $7, deny_reason = ''
      where id = $1 and user_id = $2 and status in ('form', 'denied')
      returning id`,
    [data.id, context.userId, name, logo, colors, firstName, lastName],
  );
  if (!saved[0]) return { ok: false, reason: "closed" };
  return { ok: true };
}

async function assertNplCeo(userId: string): Promise<boolean> {
  const { COMMISH_SETTINGS_ID } = await import("../commish-types");
  return userId === COMMISH_SETTINGS_ID;
}

function ceoSlot(row: NplRow) {
  return {
    id: Math.floor(Number(row.id) || 0),
    n: Math.floor(Number(row.n) || 0),
    buyer: clipNpl(row.buyer, 16) || "GM",
    status: nplStatus(row.status),
    name: row.name ?? "",
    logo: row.logo ?? "",
    colors: row.colors ?? "",
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    denyReason: row.deny_reason ?? "",
  };
}

export async function listNplHandler({ context }: { context: { userId: string } }) {
  if (!(await assertNplCeo(context.userId))) return { ok: false as const, reason: "locked" as const };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNpl(sql);
  const rows = await sql.query<NplRow>(
    `select s.id, s.kind, s.n, s.user_id, s.status, s.name, s.logo, s.colors, s.first_name, s.last_name, s.deny_reason, s.note,
            coalesce(nullif(nullif(trim(p.display_name), ''), 'GM'), nullif(trim(u.name), ''), 'GM') as buyer
       from darkness_npl s
       left join player_profiles p on p.user_id = s.user_id
       left join "user" u on u.id = s.user_id
      order by s.kind, s.n`,
  );
  const pad = (kind: NplKind, cap: number) => {
    const mine = rows.filter((row) => row.kind === kind);
    const byN = new Map(mine.map((row) => [Math.floor(Number(row.n) || 0), ceoSlot(row)]));
    return Array.from({ length: cap }, (_, index) => byN.get(index + 1) ?? null);
  };
  return { ok: true as const, teams: pad("team", NPL_TEAM_CAP), players: pad("player", NPL_PLAYER_CAP) };
}

export async function approveNplHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { id: number };
}): Promise<{ ok: true } | { ok: false; reason: "locked" | "closed" }> {
  if (!(await assertNplCeo(context.userId))) return { ok: false, reason: "locked" };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNpl(sql);
  const saved = await sql.query<{ id: number | string; user_id: string }>(
    `update darkness_npl
        set status = 'approved',
            deny_reason = '',
            note = case
              when kind = 'player' then 'Congratulations your submission for the upcoming NPL player has been approved +50 scratch points'
              else 'Congratulations your submission for the upcoming NPL team has been approved +50 scratch points'
            end
      where id = $1 and status = 'pending'
      returning id, user_id`,
    [data.id],
  );
  const row = saved[0];
  if (!row) return { ok: false, reason: "closed" };
  try {
    const { grantNplScratchPoints } = await import("../scratch.server");
    await grantNplScratchPoints(sql, row.user_id, Math.floor(Number(row.id) || 0));
  } catch (err) {
    console.error("[darkness] npl scratch points failed", err);
  }
  return { ok: true };
}

export async function denyNplHandler({
  context,
  data,
}: {
  context: { userId: string };
  data: { id: number; reason: string };
}): Promise<{ ok: true } | { ok: false; reason: "locked" | "empty" | "closed" }> {
  if (!(await assertNplCeo(context.userId))) return { ok: false, reason: "locked" };
  const reason = clipNpl(data.reason, 200);
  if (!reason) return { ok: false, reason: "empty" };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureNpl(sql);
  const saved = await sql.query<{ id: number | string }>(
    `update darkness_npl
        set status = 'denied', deny_reason = $2, note = $2
      where id = $1 and status = 'pending'
      returning id`,
    [data.id, reason],
  );
  if (!saved[0]) return { ok: false, reason: "closed" };
  return { ok: true };
}

