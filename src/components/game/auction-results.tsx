"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { AuthBar } from "@/components/game/auth-bar";
import { GmName } from "@/components/game/gm-name";
import { ShareResultsButton } from "@/components/game/share-results";
import { TeamMarks } from "@/components/game/team-logo";
import { Button } from "@/components/ui/button";
import {
  AUCTION_REVEAL_STEPS,
  auctionBonusOpen,
  auctionCellOpen,
  auctionExtraSteps,
  auctionRevealDone,
  auctionRunning,
  auctionShown,
  gradeForTotal,
  nightWinner,
  otherSeat,
  rosterTotal,
  stealScore,
} from "@/lib/game/auction";
import { pickedPrize, prizeLabel } from "@/lib/game/halftime";
import { useGame } from "@/lib/game/store";
import { SLOTS, SLOT_SHORT, type Seat, type Slot } from "@/lib/game/types";
import { avatarById } from "@/lib/game/avatars";
import { cn } from "@/lib/utils";

export function AuctionResultsBoard() {
  const names = useGame((s) => s.names);
  const rosters = useGame((s) => s.rosters);
  const cash = useGame((s) => s.cash);
  const bonus = useGame((s) => s.bonus);
  const sales = useGame((s) => s.sales);
  const series = useGame((s) => s.series);
  const nights = useGame((s) => s.nights);
  const halftime = useGame((s) => s.halftime);
  const reset = useGame((s) => s.reset);
  const rematchNight = useGame((s) => s.rematchNight);
  const rematchReady = useGame((s) => s.rematchReady);
  const mode = useGame((s) => s.mode);
  const mySeat = useGame((s) => s.mySeat);
  const acting = useGame((s) => s.acting);
  const busy = useGame((s) => s.busy);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, []);

  const extra = auctionExtraSteps(bonus);
  const shown = auctionShown(startedAt, now, extra);
  const cellsDone = shown >= AUCTION_REVEAL_STEPS;
  const bonusOpen = auctionBonusOpen(shown, bonus);
  const done = auctionRevealDone(shown, bonus);
  const live = !cellsDone && shown > 0 ? shown - 1 : -1;
  const livePos = live >= 0 ? Math.floor(live / 2) : -1;
  const liveSeat: Seat | null = live >= 0 ? ((live % 2) as Seat) : null;
  const running = auctionRunning(rosters, shown);
  const totals: [number, number] = bonusOpen
    ? [running[0] + bonus[0], running[1] + bonus[1]]
    : running;
  const winner = done ? nightWinner(rosters, bonus, cash) : undefined;
  const rematch = rematchReady ?? [false, false];
  const theirSeat: Seat | null = mode === "online" && mySeat !== null ? otherSeat(mySeat) : null;
  const theyReady = theirSeat !== null && rematch[theirSeat];
  const steal =
    sales.length === 0
      ? null
      : sales.reduce((best, sale) =>
          stealScore(sale.lot, sale.price) > stealScore(best.lot, best.price) ? sale : best,
        );
  const liveSlot: Slot | null = livePos >= 0 ? (SLOTS[livePos] ?? null) : null;

  return (
    <main className="elim-board">
      <div className="mx-auto flex h-full w-full max-w-lg min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
              Auction{nights >= 2 ? ` · Series ${series?.[0] ?? 0}–${series?.[1] ?? 0}` : ""}
            </p>
            <h1 className="mt-1 truncate font-display text-xl font-semibold uppercase leading-none tracking-tight text-fg sm:text-2xl">
              {done ? (
                winner === null || winner === undefined ? (
                  "Draw"
                ) : (
                  <GmName seat={winner} size="md" nameClassName="text-fg" />
                )
              ) : (
                "Game center"
              )}
            </h1>
          </div>
          <AuthBar />
        </header>

        <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
          {([0, 1] as const).map((seat) => (
            <div key={seat} className="min-w-0 rounded-lg bg-surface/90 px-2.5 py-1.5 shadow-[var(--shadow-border)]">
              <p className="truncate font-display text-xs font-semibold uppercase tracking-wide text-fg">
                <GmName seat={seat} />
              </p>
              <p
                key={bonusOpen ? "bonus" : "run"}
                className={cn(
                  "mt-0.5 font-display text-3xl leading-none tabular-nums",
                  winner === seat ? "text-good" : winner === 0 || winner === 1 ? "text-danger" : "text-fg",
                  bonusOpen && !done && "score-in",
                )}
              >
                {totals[seat]}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {done
                  ? `${gradeForTotal(rosterTotal(rosters[seat], bonus[seat])).letter} · $${cash[seat]} left`
                  : bonusOpen
                    ? `${bonus[seat] >= 0 ? "+" : ""}${bonus[seat]} overall`
                    : "Tallying"}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-1.5 shrink-0 truncate text-xs text-muted">
          {!cellsDone && liveSeat !== null && liveSlot ? (
            <>
              <span className="font-medium text-fg">{names[liveSeat]}</span>
              {" · "}
              {SLOT_SHORT[liveSlot]}
            </>
          ) : bonusOpen && !done ? (
            "Halftime overall lands."
          ) : cellsDone && !done ? (
            "Halftime overall next."
          ) : done ? (
            winner == null ? (
              "Same grade. Leftover cash could not break it."
            ) : (
              `${names[winner]} wins on best-season grade.`
            )
          ) : (
            "Ratings in the dark until they land."
          )}
        </p>

        <ol className="mt-1.5 grid min-h-0 flex-1 grid-rows-6 gap-1">
          {SLOTS.map((slot, i) => (
            <li
              key={slot}
              className="grid min-h-0 grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1 overflow-hidden rounded-lg bg-surface/90 px-2 py-0.5 shadow-[var(--shadow-border)]"
            >
              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
                {SLOT_SHORT[slot]}
              </p>
              {([0, 1] as const).map((seat) => {
                const lot = rosters[seat][slot];
                const open = auctionCellOpen(shown, i, seat);
                const liveCell = livePos === i && liveSeat === seat;
                return (
                  <div
                    key={seat}
                    className={cn("min-w-0 overflow-hidden rounded-md px-1 py-0.5", liveCell && "ring-1 ring-accent/50")}
                  >
                    <p className="flex min-w-0 items-center gap-1 truncate text-xs text-fg">
                      {lot ? <TeamMarks player={lot.player} /> : null}
                      <span className="truncate">{lot?.player.name ?? "—"}</span>
                    </p>
                    <p
                      key={open ? "open" : "hid"}
                      className={cn(
                        "font-display text-2xl leading-none tabular-nums",
                        open ? "text-fg" : "text-muted",
                        open && !done && "score-in",
                      )}
                    >
                      {open ? (lot ? lot.player.rating : "—") : "—"}
                    </p>
                  </div>
                );
              })}
            </li>
          ))}
        </ol>

        {done ? (
          <div className="relative z-10 mt-1.5 grid shrink-0 gap-1.5">
            {bonusOpen ? (
              <p className={cn("truncate text-center text-xs", done ? "text-muted" : "text-fg")}>
                Halftime {bonus[0] >= 0 ? "+" : ""}
                {bonus[0]} · {bonus[1] >= 0 ? "+" : ""}
                {bonus[1]}
              </p>
            ) : null}
            {steal ? (
              <p className="truncate text-center text-xs text-fg">
                Steal: {steal.lot.player.name} to {names[steal.seat]} for ${steal.price}
              </p>
            ) : null}
            {halftime?.applied ? (
              <p className="truncate text-center text-xs text-muted">
                Halftime: {prizeLabel(pickedPrize(halftime, 0) ?? { kind: "nothing", amount: 0 })}
                {" · "}
                {prizeLabel(pickedPrize(halftime, 1) ?? { kind: "nothing", amount: 0 })}
              </p>
            ) : null}
            {theyReady ? (
              <p className="text-center text-xs text-fg">
                <GmName seat={theirSeat!} className="align-middle" /> wants a rematch.
              </p>
            ) : null}
            <ShareResultsButton />
            <Button
              size="lg"
              className="w-full font-display uppercase tracking-wider"
              disabled={acting || busy}
              onClick={rematchNight}
            >
              <RotateCcw className="size-4" />
              {acting || busy ? "Sending…" : theyReady ? "Join rematch" : "Rematch"}
            </Button>
            <Button variant="secondary" size="lg" className="w-full font-display uppercase tracking-wider" onClick={reset}>
              Leave Match
            </Button>
          </div>
        ) : null}
      </div>
      {done ? <AuctionWinnerBanner winner={winner ?? null} /> : null}
    </main>
  );
}

function AuctionWinnerBanner({ winner }: { winner: Seat | null }) {
  const names = useGame((s) => s.names);
  const avatars = useGame((s) => s.avatars);
  const rosters = useGame((s) => s.rosters);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (winner === null) return;
    const id = window.setTimeout(() => setOpen(true), 1000);
    return () => window.clearTimeout(id);
  }, [winner]);

  if (winner === null || !open) return null;
  const src = avatarById(avatars[winner] ?? "poor").src;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auction-winner-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <div className="px-4 py-5 text-center sm:px-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">Match winner</p>
          <img
            src={src}
            alt=""
            className="mx-auto mt-3 size-20 rounded-lg object-cover shadow-[var(--shadow-border)] sm:size-24"
          />
          <h2
            id="auction-winner-title"
            className="mt-3 font-display text-3xl font-semibold uppercase tracking-tight text-fg"
          >
            {names[winner]}
          </h2>
          <p className="mt-1 text-sm text-muted">Wins the auction</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-3 sm:px-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-subtle">Drafted team</p>
          <ol className="mt-2 grid gap-1">
            {SLOTS.map((slot) => {
              const lot = rosters[winner][slot];
              return (
                <li key={slot} className="flex items-center gap-2 rounded-md bg-bg px-2 py-1.5">
                  <span className="w-8 shrink-0 font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
                    {SLOT_SHORT[slot]}
                  </span>
                  {lot ? (
                    <>
                      <TeamMarks player={lot.player} />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{lot.player.name}</span>
                      <span className="shrink-0 font-display text-xs tabular-nums text-muted">{lot.player.rating}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <Button
            type="button"
            size="lg"
            className="w-full font-display uppercase tracking-wider"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

