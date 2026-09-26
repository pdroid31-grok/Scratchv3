import {
  STAR_UNLOCKS,
  BANANA_ID,
  CRYPEPE_ID,
  JOKER_ID,
  STAR_SCRATCH_FROM,
  STAR_SCRATCH_CAP,
  STAR_SCRATCH_STEP,
} from "../avatars";

export function justUnlockedBanana(before: readonly string[], after: readonly string[]): boolean {
  return !before.includes(BANANA_ID) && after.includes(BANANA_ID);
}

/** First scratch unlock of Sad Crying Pepe or Joker. Already owned is not a first unlock. */
export function justUnlockedScratchLook(
  before: readonly string[],
  after: readonly string[],
): typeof CRYPEPE_ID | typeof JOKER_ID | null {
  if (!before.includes(JOKER_ID) && after.includes(JOKER_ID)) return JOKER_ID;
  if (!before.includes(CRYPEPE_ID) && after.includes(CRYPEPE_ID)) return CRYPEPE_ID;
  return null;
}

export function starScratchRungs(): number[] {
  const taken = new Set<number>(STAR_UNLOCKS.map((row) => row.stars));
  const out: number[] = [];
  for (let n = STAR_SCRATCH_FROM; n <= STAR_SCRATCH_CAP; n += STAR_SCRATCH_STEP) {
    if (!taken.has(n)) out.push(n);
  }
  return out;
}

/** Rungs crossed by this star gain only. Already-passed rungs are not returned. */
export function starScratchRungsCrossed(before: number, after: number): number[] {
  const lo = Math.max(0, Math.floor(Number(before) || 0));
  const hi = Math.min(STAR_SCRATCH_CAP, Math.floor(Number(after) || 0));
  if (hi <= lo) return [];
  return starScratchRungs().filter((n) => n > lo && n <= hi);
}
