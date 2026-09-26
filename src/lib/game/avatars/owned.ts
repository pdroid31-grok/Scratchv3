import {
  type AvatarId,
  BOX_COST,
  GOLDEN_COST,
  WIN_PAY,
  AVATARS,
  IDS,
  SHIRT_AVATARS,
  STAR_UNLOCKS,
  CRYPEPE_ID,
  JOKER_ID,
  BOX_ADDICT_POOL_NEED,
  STAR_IDS,
  FEAT_IDS,
  ACHIEVEMENT_UNLOCKS,
  PRIZE_AVATARS,
  PRIZE_IDS,
  HUNTER_LADDER,
  ACHIEVEMENT_IDS,
  CLOSET_AVATARS,
} from "../avatars";

/** Distinct owned ids that are in the mystery-box pool. */
export function boxPoolOwnedCount(owned: readonly string[]): number {
  let n = 0;
  const seen = new Set<string>();
  for (const id of owned) {
    if (!PRIZE_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    n += 1;
  }
  return n;
}

export function hitBoxAddict(owned: readonly string[]): boolean {
  return boxPoolOwnedCount(owned) >= BOX_ADDICT_POOL_NEED;
}

/** Next Hunter looks this owned set should gain, in threshold order. A granted Hunter counts toward the next rung. */
export function huntersToGrant(owned: readonly string[]): AvatarId[] {
  const have = new Set(owned);
  let count = 0;
  for (const id of have) {
    if (ACHIEVEMENT_IDS.has(id)) count += 1;
  }
  const out: AvatarId[] = [];
  for (const step of HUNTER_LADDER) {
    if (have.has(step.id)) continue;
    if (count < step.need) break;
    have.add(step.id);
    out.push(step.id);
    count += 1;
  }
  return out;
}

export function isAvatarId(id: string): id is AvatarId {
  return IDS.has(id);
}

export function avatarById(id: string): (typeof AVATARS)[number] {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export function isShirtAvatar(id: string): boolean {
  return SHIRT_AVATARS.some((avatar) => avatar.id === id);
}

export function parseOwned(raw: unknown): AvatarId[] {
  let list: unknown[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const ids = list.filter((id): id is AvatarId => typeof id === "string" && isAvatarId(id));
  if (!ids.includes("poor")) ids.unshift("poor");
  return [...new Set(ids)];
}

export function ownsAvatar(id: string, owned: readonly string[]): boolean {
  if (id === "poor") return true;
  return isAvatarId(id) && owned.includes(id);
}

export function isUnlocked(id: string, owned: readonly string[]): boolean {
  if (id === "holy") return SHIRT_AVATARS.some((avatar) => owned.includes(avatar.id));
  return ownsAvatar(id, owned);
}

export function isStarAvatar(id: string): boolean {
  return STAR_IDS.has(id);
}

export function starNeed(id: string): number {
  return STAR_UNLOCKS.find((row) => row.id === id)?.stars ?? 0;
}

/** One source line for a profile look. Unknown ids return null — do not invent a source. */
export function lookSource(id: string): string | null {
  const star = STAR_UNLOCKS.find((row) => row.id === id);
  if (star) return `From Daily Unlock, ${star.stars} ★`;
  const feat = ACHIEVEMENT_UNLOCKS.find((row) => row.id === id);
  if (feat) return `From Achievement: ${feat.how}`;
  if (PRIZE_AVATARS.some((avatar) => avatar.id === id)) return "From the Mystery Box";
  if (id === CRYPEPE_ID || id === JOKER_ID) return "From a scratch ticket";
  if (id === "poor") return "Starting look";
  if (id === "golden") return "From the Store";
  return null;
}

export function starLooksFor(stars: number): AvatarId[] {
  return STAR_UNLOCKS.filter((row) => stars >= row.stars).map((row) => row.id);
}

export function isFeatAvatar(id: string): boolean {
  return FEAT_IDS.has(id);
}

export function remainingToUnlock(owned: readonly string[]): number {
  return CLOSET_AVATARS.filter(
    (avatar) =>
      avatar.id !== "poor" && !isStarAvatar(avatar.id) && !isFeatAvatar(avatar.id) && !isUnlocked(avatar.id, owned),
  ).length;
}

export function clampAvatar(id: string, owned?: readonly string[]): AvatarId {
  if (!isAvatarId(id)) return "poor";
  if (owned && !ownsAvatar(id, owned)) return "poor";
  return id;
}

export function pickPrize(owned: readonly string[], salt = ""): AvatarId | null {
  const open = PRIZE_AVATARS.filter((avatar) => !owned.includes(avatar.id));
  if (open.length === 0) return null;
  return open[randomIndex(open.length, salt)]!.id;
}

/** Unbiased index. Prefer CSPRNG so cloned serverless isolates cannot share a Math.random sequence. */
function randomIndex(length: number, salt = ""): number {
  if (length <= 1) return 0;
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    return Math.floor(Math.random() * length);
  }
  const mix = (bytes: Uint8Array) => {
    cryptoObj.getRandomValues(bytes);
    if (!salt) return;
    const extra = new TextEncoder().encode(salt);
    for (let i = 0; i < extra.length; i += 1) {
      bytes[i % bytes.length] ^= extra[i]!;
    }
  };
  const bytes = new Uint8Array(4);
  const limit = Math.floor(0x100000000 / length) * length;
  for (let n = 0; n < 12; n += 1) {
    mix(bytes);
    const x = new DataView(bytes.buffer).getUint32(0, false);
    if (x < limit) return x % length;
  }
  mix(bytes);
  return new DataView(bytes.buffer).getUint32(0, false) % length;
}

export function walletBalance(wins: number, owned: readonly string[], credit = 0): number {
  const boxPrizes = owned.filter((id) => id !== "poor" && id !== "golden" && !isStarAvatar(id) && !isFeatAvatar(id)).length;
  const gold = owned.includes("golden") ? GOLDEN_COST : 0;
  return Math.max(0, wins * WIN_PAY - boxPrizes * BOX_COST - gold + Math.floor(credit));
}
