import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  floorDailyScore,
  prizeFromRoll,
  scratchCountsDay,
  scratchFromTotal,
  scratchKey,
  scratchPercent,
  scratchTotalFromRuns,
  SCRATCH_BANK_START,
  SCRATCH_NEED,
} from "./scratch";
import { BOX_ONLY_IDS, justUnlockedScratchLook, starScratchRungs, starScratchRungsCrossed, STAR_SCRATCH_POINTS } from "./avatars";

describe("scratch bank", () => {
  it("1080 becomes 1 card and 80 leftover", () => {
    assert.equal(SCRATCH_NEED, 1000);
    assert.deepEqual(scratchFromTotal(1080), { cards: 1, bank: 80 });
    assert.deepEqual(scratchFromTotal(0), { cards: 0, bank: 0 });
    assert.deepEqual(scratchFromTotal(999), { cards: 0, bank: 999 });
    assert.deepEqual(scratchFromTotal(2000), { cards: 2, bank: 0 });
    assert.deepEqual(scratchFromTotal(2470), { cards: 2, bank: 470 });
    assert.equal(scratchPercent(847), "84.7%");
    assert.equal(scratchPercent(80), "8.0%");
  });

  it("floors a submitted daily score", () => {
    assert.equal(floorDailyScore(139.6), 139);
    assert.equal(floorDailyScore(0), 0);
    assert.equal(floorDailyScore(-4), 0);
  });

  it("ignores dailies before 2026-09-15 ET", () => {
    assert.equal(SCRATCH_BANK_START, "2026-09-15");
    assert.equal(scratchCountsDay("2026-09-14"), false);
    assert.equal(scratchCountsDay("2026-09-15"), true);
    const historic = scratchTotalFromRuns([
      { day: "2026-09-02", score: 139.6 },
      { day: "2026-09-14", score: 2470 },
      { day: "2026-09-14", score: 1000 },
    ]);
    assert.equal(historic, 0);
    assert.deepEqual(scratchFromTotal(historic), { cards: 0, bank: 0 });
  });

  it("banks 0 until a Daily on or after the cutoff", () => {
    const untilToday = scratchTotalFromRuns([
      { day: "2026-09-02", score: 2000 },
      { day: "2026-09-08", score: 1080 },
    ]);
    assert.deepEqual(scratchFromTotal(untilToday), { cards: 0, bank: 0 });
    const withToday = scratchTotalFromRuns([
      { day: "2026-09-14", score: 2470 },
      { day: "2026-09-15", score: 139.6 },
    ]);
    assert.equal(withToday, 139);
    assert.deepEqual(scratchFromTotal(withToday), { cards: 0, bank: 139 });
  });

  it("fills scratch points on empty star rungs only", () => {
    assert.equal(STAR_SCRATCH_POINTS, 100);
    assert.deepEqual(starScratchRungs().slice(0, 5), [12, 18, 21, 24, 27]);
    assert.equal(starScratchRungs().includes(15), false);
    assert.equal(starScratchRungs().includes(20), false);
    assert.equal(starScratchRungs().includes(25), false);
    assert.equal(starScratchRungs().includes(50), false);
    assert.equal(starScratchRungs().includes(75), false);
    assert.equal(starScratchRungs().includes(100), false);
    assert.equal(starScratchRungs().at(-1), 99);
    assert.deepEqual(starScratchRungsCrossed(11, 12), [12]);
    assert.deepEqual(starScratchRungsCrossed(40, 40), []);
    assert.deepEqual(starScratchRungsCrossed(17, 19), [18]);
    assert.deepEqual(starScratchRungsCrossed(99, 101), []);
  });

  it("mints only from post-cutoff scores", () => {
    const total = scratchTotalFromRuns([
      { day: "2026-09-02", score: 2000 },
      { day: "2026-09-15", score: 1080 },
    ]);
    assert.deepEqual(scratchFromTotal(total), { cards: 1, bank: 80 });
  });
});

describe("scratch roll", () => {
  it("uses the 1–100 weight table", () => {
    assert.equal(prizeFromRoll(1).key, "nothing");
    assert.equal(prizeFromRoll(10).key, "nothing");
    assert.equal(prizeFromRoll(10).avatar, "crypepe");
    assert.equal(prizeFromRoll(11).key, "coins1");
    assert.equal(prizeFromRoll(40).coins, 1);
    assert.equal(prizeFromRoll(41).key, "coins2");
    assert.equal(prizeFromRoll(65).coins, 2);
    assert.equal(prizeFromRoll(66).key, "star");
    assert.equal(prizeFromRoll(85).stars, 1);
    assert.equal(prizeFromRoll(86).key, "coins3");
    assert.equal(prizeFromRoll(95).coins, 3);
    assert.equal(prizeFromRoll(96).key, "combo");
    assert.equal(prizeFromRoll(99).coins, 1);
    assert.equal(prizeFromRoll(99).stars, 1);
    assert.equal(prizeFromRoll(100).key, "joker");
    assert.equal(prizeFromRoll(100).avatar, "joker");
    assert.equal(prizeFromRoll(0).key, "nothing");
    for (let n = 1; n <= 100; n += 1) {
      const look = prizeFromRoll(n).avatar;
      if (look) assert.equal((BOX_ONLY_IDS as readonly string[]).includes(look), false, look);
    }
    const counts = new Map<string, number>();
    for (let n = 1; n <= 100; n += 1) {
      const key = prizeFromRoll(n).key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.get("nothing"), 10);
    assert.equal(counts.get("coins1"), 30);
    assert.equal(counts.get("coins2"), 25);
    assert.equal(counts.get("star"), 20);
    assert.equal(counts.get("coins3"), 10);
    assert.equal(counts.get("combo"), 4);
    assert.equal(counts.get("joker"), 1);
  });

  it("keys a payout per card", () => {
    assert.equal(scratchKey(12), "scratch:12");
  });

  it("auto-equips cry/joker only on first unlock", () => {
    assert.equal(prizeFromRoll(10).avatar, "crypepe");
    assert.equal(prizeFromRoll(100).avatar, "joker");
    assert.equal(justUnlockedScratchLook(["poor"], ["poor", "crypepe"]), "crypepe");
    assert.equal(justUnlockedScratchLook(["poor", "crypepe"], ["poor", "crypepe"]), null);
    assert.equal(justUnlockedScratchLook(["poor"], ["poor", "joker"]), "joker");
    assert.equal(justUnlockedScratchLook(["poor", "joker"], ["poor", "joker"]), null);
  });
});
