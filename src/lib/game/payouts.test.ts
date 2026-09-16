import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookStarsFromPayoutKeys,
  dailyScoreKey,
  dailyWinKey,
  payoutLabel,
  scratchPayoutKey,
  scratchStarsFromPayouts,
  uniqueDailyWinDays,
  uniqueWeeklyWinWeeks,
  weeklyScoreKey,
  weeklyWinKey,
} from "./payouts";

describe("payout keys", () => {
  it("are unique per person and event", () => {
    const a = dailyWinKey("2026-09-05", "u1");
    const b = dailyWinKey("2026-09-05", "u2");
    const c = dailyScoreKey("2026-09-05", "u1");
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.equal(a, "daily_win:2026-09-05:u1");
    assert.equal(weeklyWinKey(2026, 1, "u1"), "weekly_win:2026-W1:u1");
    assert.equal(weeklyScoreKey(2026, 1, "u1"), "weekly_score:2026-W1:u1");
  });

  it("labels the four cash events", () => {
    assert.equal(payoutLabel("daily_win"), "Daily 1st");
    assert.equal(payoutLabel("daily_score"), "Daily over 100");
    assert.equal(payoutLabel("weekly_win"), "Weekly 1st");
    assert.equal(payoutLabel("weekly_score"), "Weekly over 100");
    assert.equal(payoutLabel("scratch"), "Scratch card");
  });

  it("counts unique daily_win days, not duplicate rows", () => {
    assert.equal(uniqueDailyWinDays([]), 0);
    assert.equal(uniqueDailyWinDays(["daily_win:2026-09-12:u1"]), 1);
    assert.equal(
      uniqueDailyWinDays([
        "daily_win:2026-09-08:u1",
        "daily_win:2026-09-08:u1",
        "daily_win:2026-09-12:u1",
      ]),
      2,
    );
    assert.equal(uniqueDailyWinDays(["daily_score:2026-09-12:u1", "weekly_win:2026-W1:u1"]), 0);
  });

  it("counts unique weekly_win weeks at two stars each", () => {
    assert.equal(uniqueWeeklyWinWeeks([]), 0);
    assert.equal(uniqueWeeklyWinWeeks(["weekly_win:2026-W1:u1", "weekly_win:2026-W1:u1"]), 1);
    assert.equal(uniqueWeeklyWinWeeks(["weekly_win:2026-W1:u1", "weekly_win:2026-W2:u1"]), 2);
    assert.equal(uniqueWeeklyWinWeeks(["weekly_score:2026-W1:u1", "daily_win:2026-09-12:u1"]), 0);
    assert.equal(
      bookStarsFromPayoutKeys([
        "daily_win:2026-09-12:u1",
        "daily_win:2026-09-12:u1",
        "weekly_win:2026-W1:u1",
        "weekly_win:2026-W1:u1",
        "weekly_score:2026-W1:u1",
      ]),
      3,
    );
    assert.equal(scratchPayoutKey(9), "scratch:9");
    assert.equal(scratchStarsFromPayouts([{ kind: "scratch", stars: 1 }, { kind: "scratch", stars: 0 }, { kind: "daily_win", stars: 1 }]), 1);
  });
});
