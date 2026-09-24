/** Mystery box, Golden Pepe, Peeping. Move-only from stats.server. */
import { avatarById, pickPrize, BOX_COST, GOLDEN_COST, PEEPING_ID, type AvatarId } from "../avatars";
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

export async function buyGoldenPepeHandler({ context }: { context: { userId: string } }): Promise<ShopResult> {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const settled = await settleProfile(sql, context.userId);
    if (settled.owned.includes("golden")) {
      return { ok: false, reason: "owned", coins: settled.coins, owned: settled.owned };
    }
    if (settled.coins < GOLDEN_COST) {
      return { ok: false, reason: "broke", coins: settled.coins, owned: settled.owned };
    }
    const owned = [...settled.owned, "golden" as AvatarId];
    await sql.query(
      `update player_profiles
       set owned = $1, avatar_id = $2, updated_at = now()
       where user_id = $3`,
      [JSON.stringify(owned), "golden", context.userId],
    );
    const next = await settleProfile(sql, context.userId);
    return { ok: true, coins: next.coins, owned: next.owned, avatarId: "golden" };
}

