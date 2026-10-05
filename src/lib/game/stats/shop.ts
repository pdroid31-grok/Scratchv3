/** Mystery box, Golden Pepe, Peeping. Move-only from stats.server. */
import { avatarById, pickPrize, BOX_COST, GOLDEN_COST, ONEONE_ID, PEEPING_ID, type AvatarId } from "../avatars";
import type { BoxResult, ShopResult } from "../stats-types";
import { announceFeatUnlocks } from "./feats";
import { settleProfile } from "./profile";

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
}

const GOLDEN_FLAG = "golden-1of1";

async function ensureFeatFlags(sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> }): Promise<void> {
  await sql.query(`
    create table if not exists darkness_feat_flags (
      key text primary key,
      created_at timestamptz not null default now()
    )`);
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
    await sql.query(
      `update player_profiles
       set owned = $1, avatar_id = $2, updated_at = now()
       where user_id = $3`,
      [JSON.stringify(owned), "golden", context.userId],
    );
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
    return { ok: true, coins: next.coins, owned: next.owned, avatarId: "golden" };
}

