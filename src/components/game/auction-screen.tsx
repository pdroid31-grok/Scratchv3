"use client";

import { useEffect, useState } from "react";
import { Ban, Dices, Plus, Shuffle } from "lucide-react";
import { canPickLot, otherSeat, playerAt, type RerollCinematicKind } from "@/lib/game/auction";
import { PlayerCard, positionLabel } from "@/components/game/mystery-card";
import { TeamMarks } from "@/components/game/team-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isOnClock, seatCanReroll, seatCanShuffle, seatMaxBid, useGame } from "@/lib/game/store";
import { GmName } from "@/components/game/gm-name";
import { HalftimeMark } from "@/components/game/halftime-mark";
import { REROLL_COST, SLOT_SHORT, SLOTS, type Roster, type Sale, type Seat, type Slot } from "@/lib/game/types";
import { HALFTIME_AFTER } from "@/lib/game/halftime";
import { cn } from "@/lib/utils";

export function AuctionScreen({ cardFx = null }: { cardFx?: RerollCinematicKind | null }) {
  const state = useGame();
  const lot = state.lots[state.lotIndex];
  const bidder = state.currentBidder;
  const holder = state.bidHolder;
  const cap = lot ? seatMaxBid(state, bidder) : 0;
  const minNext = state.currentBid === 0 ? 1 : state.currentBid + 1;
  const onClock = isOnClock(state);
  const canAct = onClock && !state.busy && !state.acting;
  const opening = state.phase === "bidding" && state.currentBid === 0;
  const canReroll = seatCanReroll(state, bidder) && canAct;
  const waiting = state.mode === "online" && !onClock && state.phase !== "sold";
  const picking = canPickLot(state);
  const picked = state.choice !== null;
  const canCommit = canAct && picked;
  const canRaise = state.phase === "bidding" && cap >= minNext && (opening ? canCommit : canAct);
  const [custom, setCustom] = useState("");
  const [peekSeat, setPeekSeat] = useState<Seat | null>(null);
  const canShuffle = lot ? seatCanShuffle(state, bidder) && canAct : false;

  useEffect(() => {
    setCustom("");
  }, [state.lotIndex, state.currentBid, state.currentBidder, state.choice]);

  useEffect(() => {
    if (state.kind === "elimination") return;
    if (state.phase === "setup" || state.phase === "lobby" || state.phase === "results" || state.phase === "halftime") return;
    if (!lot) state.reset();
  }, [state.phase, lot, state.reset]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useGame.getState();
      if (s.busy || s.acting || !isOnClock(s)) return;
      if (s.phase === "sold" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        s.advanceFromSold();
        return;
      }
      if (s.phase === "unopposed" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        s.claimUnopposed();
        return;
      }
      if (canPickLot(s) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        s.selectChoice(e.key === "ArrowLeft" ? 0 : 1);
        return;
      }
      if (s.phase !== "bidding") return;
      const c = seatMaxBid(s, s.currentBidder);
      const min = s.currentBid === 0 ? 1 : s.currentBid + 1;
      if ((e.key === "p" || e.key === "P" || e.key === "Escape") && s.currentBid > 0) {
        e.preventDefault();
        s.pass();
      } else if (e.key === "1" && c >= min && (s.currentBid > 0 || s.choice !== null)) {
        e.preventDefault();
        s.placeBid(min);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!lot) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center">
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Darkness</p>
      </main>
    );
  }

  const customValue = Number.parseInt(custom, 10);
  const customOk =
    canRaise && Number.isFinite(customValue) && customValue >= minNext && customValue <= cap;

  return (
    <main className="relative z-10 mx-auto flex min-h-full w-full max-w-4xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
            Lot {state.lotIndex + 1} of {state.lots.length}
          </p>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">
            Darkness
          </h1>
          <LotTrack index={state.lotIndex} total={state.lots.length} />
        </div>
        <div className="text-right">
          <TurnHint />
          <button
            type="button"
            className="mt-1 text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
            onClick={state.reset}
          >
            {state.mode === "online" ? "Leave night" : "New auction"}
          </button>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3">
        <GmPanel seat={0} active={bidder === 0} holding={holder === 0} onOpen={() => setPeekSeat(0)} />
        <GmPanel seat={1} active={bidder === 1} holding={holder === 1} onOpen={() => setPeekSeat(1)} />
      </div>

      {state.phase === "sold" && state.lastSale ? (
        <SoldPanel
          sale={state.lastSale}
          onNext={state.advanceFromSold}
          isLast={state.lotIndex + 1 >= state.lots.length}
          isHalftime={state.lotIndex + 1 === HALFTIME_AFTER && state.halftime === null}
          pending={state.acting || state.busy}
        />
      ) : (
        <>
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            {positionLabel(lot.slot)}
            {picking ? " · pick one" : ""}
          </p>
          <div className="grid grid-cols-2 items-stretch gap-2 sm:gap-3">
            {([0, 1] as const).map((index) => {
              const player = playerAt(lot, index);
              const selected = state.choice === index;
              const locked = !picking;
              return (
                <div
                  key={`${state.lotIndex}-${index}-${player.id}`}
                  className={cn(
                    "min-w-0 rounded-xl",
                    selected && cardFx === "upgrade" && "reroll-card-up",
                    selected && cardFx === "bust" && "reroll-card-down",
                  )}
                >
                  <PlayerCard
                    player={player}
                    slot={lot.slot}
                    className="h-full"
                    selected={selected}
                    passed={locked && picked && !selected}
                    onPick={picking && canAct ? () => state.selectChoice(index) : undefined}
                    pickDisabled={!canAct}
                    livePick={picking}
                  />
                </div>
              );
            })}
          </div>

          {picking && canAct ? (
            <div className="mt-3 flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="font-display uppercase tracking-wider"
                disabled={!canShuffle || state.acting || state.busy}
                onClick={() => state.shuffleLot()}
              >
                <Shuffle className="size-4" />
                {state.shuffleUsed?.[bidder]
                  ? "Shuffle used"
                  : `Shuffle both · $${REROLL_COST}`}
              </Button>
              <p className="text-center text-[11px] text-subtle">
                {state.shuffleUsed?.[bidder]
                  ? "That GM already shuffled once this night."
                  : "Once per night, before the opening bid."}
              </p>
            </div>
          ) : null}

          {peekSeat !== null ? (
            <RosterPeek seat={peekSeat} onClose={() => setPeekSeat(null)} />
          ) : null}

          <section className="mt-5 flex flex-1 flex-col">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-subtle">
                  {state.phase === "unopposed"
                    ? "Forced lot"
                    : opening
                      ? "Opening bid"
                      : holder !== null
                        ? `${state.names[holder]} holds`
                        : "Current bid"}
                </p>
                <p className="font-display text-6xl font-semibold tabular-nums leading-none tracking-tight text-fg">
                  {state.phase === "unopposed"
                    ? "$1"
                    : state.currentBid > 0
                      ? `$${state.currentBid}`
                      : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-subtle">On the clock</p>
                <p
                  className={cn(
                    "font-display text-2xl font-semibold uppercase tracking-wide",
                    bidder === 0 ? "text-p1" : "text-p2",
                  )}
                  aria-live="polite"
                >
                  {state.mode === "online" && state.mySeat === bidder ? (
                    <GmName seat={bidder} you nameClassName={bidder === 0 ? "text-p1" : "text-p2"} />
                  ) : (
                    <GmName seat={bidder} nameClassName={bidder === 0 ? "text-p1" : "text-p2"} />
                  )}
                </p>
                <p className="text-xs text-muted">Max legal ${cap}</p>
              </div>
            </div>

            {waiting ? (
              <div className="mt-6 rounded-lg bg-surface-2/80 px-4 py-6 text-center shadow-[var(--shadow-border)]">
                <p className="text-xs uppercase tracking-[0.2em] text-subtle">Waiting</p>
                <p
                  className={cn(
                    "mt-2 font-display text-2xl font-semibold uppercase tracking-wide",
                    bidder === 0 ? "text-p1" : "text-p2",
                  )}
                >
                  {state.names[bidder]}
                </p>
                <p className="mt-2 text-sm text-muted">Their phone has the bid. Yours will move when they do.</p>
              </div>
            ) : state.phase === "unopposed" ? (
              <div className="mt-6 grid gap-3">
                <p className="text-sm text-muted">
                  {state.names[bidder]} is the only GM who still needs a {lot.slot}. Tap a name,
                  then claim for $1
                  {canReroll || state.lotRerolled || state.rerollUsed?.[bidder]
                    ? (state.freeRerolls[bidder] ?? 0) > 0 && !state.lotRerolled
                      ? ", or spend a free reroll — one in ten is a 70"
                      : state.rerollUsed?.[bidder] && !state.lotRerolled
                        ? ""
                        : ", or pay $2 once a night to reroll — one in ten is a 70"
                    : ""}
                  .
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    size="lg"
                    className="w-full font-display text-lg uppercase tracking-wider"
                    disabled={!canCommit}
                    onClick={state.claimUnopposed}
                  >
                    Claim for $1
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full font-display text-lg uppercase tracking-wider"
                    disabled={!canReroll || !picked}
                    onClick={state.rerollUnopposed}
                  >
                    <Dices className="size-4" />
                    {state.lotRerolled || (state.rerollUsed?.[bidder] && (state.freeRerolls[bidder] ?? 0) === 0)
                      ? "Already rerolled"
                      : state.acting && state.phase === "unopposed"
                        ? "Rerolling…"
                        : (state.freeRerolls[bidder] ?? 0) > 0
                          ? "Free reroll"
                          : "Reroll $2"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    className="font-display uppercase tracking-wider"
                    disabled={opening || !canAct}
                    onClick={state.pass}
                  >
                    <Ban className="size-4" />
                    Pass
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="font-display uppercase tracking-wider"
                    disabled={!canRaise}
                    onClick={() => state.placeBid(minNext)}
                  >
                    <Plus className="size-4" />
                    {opening ? "$1" : "+$1"}
                  </Button>
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customOk) state.placeBid(customValue);
                  }}
                >
                  <label className="sr-only" htmlFor="custom-bid">
                    Custom bid
                  </label>
                  <Input
                    id="custom-bid"
                    type="number"
                    min={minNext}
                    max={cap}
                    inputMode="numeric"
                    placeholder={`Custom $${minNext}–$${cap}`}
                    value={custom}
                    disabled={!canRaise}
                    onChange={(e) => setCustom(e.target.value)}
                    className="h-12 min-h-12"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="shrink-0 font-display uppercase tracking-wider"
                    disabled={!customOk}
                  >
                    Raise
                  </Button>
                </form>
              </div>
            )}

            {state.history.length > 0 ? (
              <ol className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
                {state.history.map((event, i) => (
                  <li key={`${event.seat}-${i}`}>
                    <span className={event.seat === 0 ? "text-p1" : "text-p2"}>
                      {state.names[event.seat]}
                    </span>{" "}
                    {event.kind === "pass"
                      ? "passes"
                      : event.kind === "reroll"
                        ? "rerolls $2"
                        : `bids $${event.amount}`}
                  </li>
                ))}
              </ol>
            ) : state.phase === "bidding" && !waiting ? (
              <p className="mt-4 text-xs text-subtle">
                {picked
                  ? "Raise $1 or type a custom bid until one GM folds."
                  : "Tap a name, then open at $1 or type a custom bid."}
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function TurnHint() {
  const state = useGame();
  const bidder = state.currentBidder;
  const onClock = isOnClock(state);

  if (state.phase === "sold") {
    return <p className="text-xs text-subtle">Lot sold</p>;
  }

  if (state.mode === "online") {
    if (onClock) {
      return <p className="text-xs text-fg">Your bid</p>;
    }
    return (
      <p className="text-xs text-subtle">
        Waiting on{" "}
        <GmName
          seat={bidder}
          size="sm"
          className="align-middle"
          nameClassName={bidder === 0 ? "text-p1" : "text-p2"}
        />
      </p>
    );
  }

  return (
    <p className="text-xs text-subtle">
      Pass the device to{" "}
      <GmName
        seat={bidder}
        size="sm"
        className="align-middle"
        nameClassName={bidder === 0 ? "text-p1" : "text-p2"}
      />
    </p>
  );
}

function GmPanel({
  seat,
  active,
  holding,
  onOpen,
}: {
  seat: Seat;
  active: boolean;
  holding: boolean;
  onOpen: () => void;
}) {
  const cash = useGame((s) => s.cash);
  const rosters = useGame((s) => s.rosters);
  const bonus = useGame((s) => s.bonus);
  const freeRerolls = useGame((s) => s.freeRerolls);
  const mySeat = useGame((s) => s.mySeat);
  const mode = useGame((s) => s.mode);
  const tone = seat === 0 ? "text-p1" : "text-p2";
  const ring = seat === 0 ? "ring-p1/40" : "ring-p2/40";
  const you = mode === "online" && mySeat === seat;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "rounded-lg bg-surface/90 px-3 py-3 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]",
        active && `ring-1 ${ring}`,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className={cn(
            "flex min-w-0 items-center gap-1.5 font-display text-lg font-semibold uppercase tracking-wide",
            tone,
          )}
        >
          <GmName seat={seat} you={you} link={false} nameClassName={tone} />
          <HalftimeMark seat={seat} />
        </h2>
        <p className="font-display text-xl font-semibold tabular-nums text-fg">${cash[seat]}</p>
      </div>
      {(bonus[seat] !== 0 || freeRerolls[seat] > 0) && (
        <p className="mt-1 text-xs text-muted">
          {bonus[seat] !== 0 ? `${bonus[seat] > 0 ? "+" : ""}${bonus[seat]} overall` : ""}
          {bonus[seat] !== 0 && freeRerolls[seat] > 0 ? " · " : ""}
          {freeRerolls[seat] > 0 ? `${freeRerolls[seat]} free reroll` : ""}
        </p>
      )}
      <ul className="mt-2 flex flex-wrap gap-1">
        {SLOTS.map((slot) => (
          <SlotChip key={slot} slot={slot} roster={rosters[seat]} />
        ))}
      </ul>
      {holding ? (
        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-accent">High bid</p>
      ) : (
        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-subtle">Tap for names</p>
      )}
    </button>
  );
}

function RosterPeek({ seat, onClose }: { seat: Seat; onClose: () => void }) {
  const roster = useGame((s) => s.rosters[seat]);
  const cash = useGame((s) => s.cash[seat]);
  const bonus = useGame((s) => s.bonus[seat]);
  const tone = seat === 0 ? "text-p1" : "text-p2";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-peek-title"
      onClick={onClose}
    >
      <section
        className="w-full max-w-md overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-5 sm:px-6">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
            Board
          </p>
          <h2 id="roster-peek-title" className={cn("mt-2 flex items-center gap-2 font-display text-3xl font-semibold uppercase tracking-tight", tone)}>
            <GmName seat={seat} size="md" nameClassName={tone} />
            <HalftimeMark seat={seat} size="md" />
          </h2>
          <p className="mt-2 text-sm text-muted">
            ${cash}
            {bonus !== 0 ? ` · ${bonus > 0 ? "+" : ""}${bonus} overall` : ""}
          </p>
          <ul className="mt-4 grid gap-2">
            {SLOTS.map((slot) => {
              const lot = roster[slot];
              return (
                <li key={slot} className="flex items-center gap-3 rounded-md bg-bg px-3 py-3">
                  <span className="w-10 shrink-0 font-display text-xs font-semibold uppercase tracking-wider text-subtle">
                    {SLOT_SHORT[slot]}
                  </span>
                  {lot ? (
                    <>
                      <TeamMarks player={lot.player} size={22} />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-semibold uppercase leading-tight tracking-tight text-fg">
                          {lot.player.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">Career · {lot.player.years}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-subtle">Empty</p>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="mt-5 w-full font-display uppercase tracking-wider"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </section>
    </div>
  );
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function LotTrack({ index, total }: { index: number; total: number }) {
  return (
    <ol className="mt-2 flex max-w-56 gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full",
            i < index && "bg-accent/35",
            i === index && "bg-accent",
            i > index && "bg-surface-2",
          )}
        />
      ))}
    </ol>
  );
}

function SlotChip({ slot, roster }: { slot: Slot; roster: Roster }) {
  const filled = roster[slot];
  return (
    <li
      className={cn(
        "rounded-sm px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider",
        filled ? "bg-surface-2 text-fg" : "text-subtle",
      )}
      title={filled ? filled.player.name : `Need ${SLOT_SHORT[slot]}`}
    >
      {SLOT_SHORT[slot]}
      {filled ? ` · ${lastName(filled.player.name)}` : ""}
    </li>
  );
}

function SoldPanel({
  sale,
  onNext,
  isLast,
  isHalftime,
  pending,
}: {
  sale: Sale;
  onNext: () => void;
  isLast: boolean;
  isHalftime: boolean;
  pending: boolean;
}) {
  const names = useGame((s) => s.names);
  return (
    <section className="flex flex-1 flex-col items-center justify-center rounded-xl bg-surface/90 px-6 py-12 text-center shadow-[var(--shadow-border)]">
      <p className="stamp font-display text-7xl font-semibold uppercase tracking-tight text-accent sm:text-8xl">
        Sold
      </p>
      <p className="mt-6 font-display text-2xl font-semibold uppercase tracking-wide text-fg">
        {sale.lot.player.name}
      </p>
      <p className="mt-2 text-sm text-muted">
        To {names[sale.seat]} · ${sale.price}
        {sale.unopposed ? " · unopposed" : ""}
      </p>
      {!isLast && !isHalftime ? (
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-subtle">
          {names[otherSeat(sale.seat)]} opens next
        </p>
      ) : null}
      {isHalftime ? (
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-subtle">Halftime Mystery Boxes</p>
      ) : null}
      <Button
        size="lg"
        className="mt-8 font-display uppercase tracking-wider"
        disabled={pending}
        onClick={onNext}
      >
        {isLast ? "See who won" : isHalftime ? "Open mystery boxes" : "Next lot"}
      </Button>
    </section>
  );
}
