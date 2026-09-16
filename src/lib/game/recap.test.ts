import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, startAuction, startElimination, type GameState } from "./engine";
import { legalElimPicks, flushElimDraft } from "./elim";
import { decodeRecap, encodeRecap, recapCaption, recapFromState, recapPath } from "./recap";

function afterHold(state: GameState): GameState {
  return flushElimDraft(state, (state.elim?.pickHoldUntil ?? 0) + 1);
}

function draftAll(state: GameState): GameState {
  let next = state;
  let steps = 0;
  while (next.phase === "draft") {
    if (++steps > 80) throw new Error("draft stuck");
    if (next.elim?.pickHoldUntil) next = afterHold(next);
    if (next.phase !== "draft") break;
    const seat = next.currentBidder;
    const legal = legalElimPicks(next.elim!, next.cash[seat], seat).sort((a, b) => b.cost - a.cost);
    const row = legal[0];
    if (!row) throw new Error("no pick");
    next = applyAction(next, { type: "pickElim", id: row.id }, seat);
  }
  if (next.elim?.pickHoldUntil) next = afterHold(next);
  return next;
}

describe("night recap", () => {
  it("round-trips an auction board through the share token", () => {
    const started = startAuction("Pat", "Ty");
    const recap = recapFromState({
      ...started,
      rosters: [
        { ...started.rosters[0], QB: started.lots[0] ?? null },
        started.rosters[1],
      ],
      cash: [10, 25],
    });
    assert.ok(recap);
    assert.equal(recap.kind, "auction");
    assert.equal(recap.names[0], "Pat");
    const again = decodeRecap(encodeRecap(recap));
    assert.deepEqual(again, recap);
    assert.ok(recapPath(recap).startsWith("/recap#"));
    assert.ok(recapCaption(recap).includes("Pat"));
  });

  it("builds an elimination recap with both drafted teams", () => {
    const done = draftAll(startElimination("Pat", "Ty"));
    const recap = recapFromState({
      ...done,
      elim: { ...done.elim!, weekWins: [3, 1] },
    });
    assert.ok(recap);
    assert.equal(recap.kind, "elimination");
    assert.equal(recap.lines[0].length, 8);
    assert.equal(recap.lines[1].length, 8);
    assert.ok(recap.lines[0].every((row) => row.name && row.name !== "—"));
    const again = decodeRecap(encodeRecap(recap));
    assert.equal(again?.kind, "elimination");
    assert.equal(again?.year, recap.year);
    assert.equal(again?.lines[0][0]?.name, recap.lines[0][0]?.name);
    assert.ok(encodeRecap(recap).length < 2500);
  });

  it("rejects junk tokens", () => {
    assert.equal(decodeRecap(""), null);
    assert.equal(decodeRecap("not-a-recap"), null);
  });
});
