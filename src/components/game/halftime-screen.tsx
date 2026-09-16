"use client";

import { useEffect } from "react";
import {
  hasHalftimeBoxes,
  pickedPrize,
  prizeLabel,
  prizeShort,
  prizeTone,
  sealedHalftime,
  type Prize,
} from "@/lib/game/halftime";
import { Button } from "@/components/ui/button";
import { prizeIcon } from "@/components/game/halftime-mark";
import { isOnClock, useGame, type PlayMode } from "@/lib/game/store";
import { GmName } from "@/components/game/gm-name";
import type { Seat } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function HalftimeScreen() {
  const state = useGame();
  const ht = hasHalftimeBoxes(state.halftime) ? state.halftime : sealedHalftime();
  const onClock = isOnClock(state);
  const dealing = state.acting && ht.picks[0] === null && ht.picks[1] === null && !ht.applied;
  const canAct = onClock && !state.busy && !state.acting;
  const applied = Boolean(ht.applied);
  const mySeat = state.mode === "online" ? state.mySeat : null;
  const seats: Seat[] = mySeat === 1 ? [1, 0] : [0, 1];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useGame.getState();
      if (s.phase !== "halftime" || !s.halftime || s.busy || s.acting) return;
      if (s.halftime.applied && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        const seat = s.mySeat;
        if (seat !== null && s.halftime.ready?.[seat]) return;
        s.advanceFromSold();
        return;
      }
      const n = Number(e.key);
      if (n < 1 || n > 4) return;
      const seat: Seat | null =
        s.mode === "online"
          ? s.mySeat
          : s.halftime.picks[0] === null
            ? 0
            : s.halftime.picks[1] === null
              ? 1
              : null;
      if (seat === null) return;
      if (s.halftime.picks[seat] !== null) return;
      e.preventDefault();
      s.pickBox(n - 1, seat);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prize0 = pickedPrize(ht, 0);
  const prize1 = pickedPrize(ht, 1);

  return (
    <main className="elim-board">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
        <header className="shrink-0">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
            Lot 6 of 12 · Halftime
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold uppercase leading-none tracking-tight text-fg">
            Mystery Boxes
          </h1>
          <p className="mt-1 text-xs text-muted">
            One box each. Sealed until both pick. Cash, a free reroll, overall points — or empty.
          </p>
        </header>

        {applied && prize0 && prize1 ? (
          <div className="mt-2 shrink-0">
            <Recap prizes={[prize0, prize1]} loans={state.loans} />
          </div>
        ) : (
          <div className="mt-2 shrink-0">
            <TurnBanner
              dealing={dealing}
              mode={state.mode}
              names={state.names}
              picks={ht.picks}
              mySeat={mySeat}
            />
          </div>
        )}

        <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 gap-2">
          {seats.map((seat) => {
            const mine = mySeat === seat;
            const theirTurn =
              !applied &&
              ht.picks[seat] === null &&
              (state.mode !== "online" || mine) &&
              (state.mode === "online" || (seat === 0 ? true : ht.picks[0] !== null));
            return (
              <SeatBoxes
                key={seat}
                seat={seat}
                mine={mine}
                canPick={canAct && theirTurn}
                active={!applied && theirTurn}
              />
            );
          })}
        </div>

        {applied ? (
          <BackButton
            names={state.names}
            mySeat={mySeat}
            ready={ht.ready ?? [false, false]}
            busy={state.acting || state.busy}
            onBack={state.advanceFromSold}
          />
        ) : null}
      </div>
    </main>
  );
}

function BackButton({
  names,
  mySeat,
  ready,
  busy,
  onBack,
}: {
  names: [string, string];
  mySeat: Seat | null;
  ready: [boolean, boolean];
  busy: boolean;
  onBack: () => void;
}) {
  const other: Seat | null = mySeat === 0 ? 1 : mySeat === 1 ? 0 : null;
  const mineReady = mySeat !== null && ready[mySeat];
  const waitingOn = mineReady && other !== null && !ready[other] ? names[other] : null;
  const label = waitingOn ? `Waiting on ${waitingOn}` : "Back to the board";
  return (
    <Button
      size="lg"
      className="mt-2 w-full shrink-0 font-display uppercase tracking-wider"
      disabled={busy || mineReady}
      onClick={onBack}
    >
      {label}
    </Button>
  );
}

function TurnBanner({
  dealing,
  mode,
  names,
  picks,
  mySeat,
}: {
  dealing: boolean;
  mode: PlayMode;
  names: [string, string];
  picks: [number | null, number | null];
  mySeat: Seat | null;
}) {
  let title = "Tap a box";
  let detail = "You only get one.";
  if (dealing) {
    title = "Dealing";
    detail = "Four sealed boxes each. Hang on.";
  } else if (mode === "online" && mySeat !== null) {
    const other: Seat = mySeat === 0 ? 1 : 0;
    if (picks[mySeat] === null) {
      title = "Your pick";
      detail = picks[other] === null
        ? `Tap one of your four boxes. ${names[other]} has their own four.`
        : `${names[other]} already picked. Your four are still sealed — tap one.`;
    } else if (picks[other] === null) {
      title = `Waiting on ${names[other]}`;
      detail = "Your box is in. It stays sealed until they pick too.";
    } else {
      title = "Opening";
      detail = "Both boxes are in.";
    }
  } else if (picks[0] === null) {
    title = `${names[0]} picks`;
    detail = "Pass the device. Tap one sealed box.";
  } else if (picks[1] === null) {
    title = `${names[1]} picks`;
    detail = "Pass the device. Tap one sealed box.";
  }

  return (
    <section className="rounded-xl bg-surface/90 px-3 py-2 shadow-[var(--shadow-border)]">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-turf">{title}</p>
      <p className="mt-0.5 text-sm text-fg">{detail}</p>
    </section>
  );
}

function Recap({
  prizes,
  loans,
}: {
  prizes: [Prize, Prize];
  loans: { seat: Seat }[];
}) {
  return (
    <ul className="grid w-full grid-cols-2 gap-2">
      {([0, 1] as const).map((seat) => {
        const prize = prizes[seat];
        const tone = prizeTone(prize);
        const Icon = prizeIcon(prize);
        return (
          <li
            key={seat}
            className="flex min-w-0 items-center gap-2 rounded-xl bg-surface/90 px-2.5 py-2 shadow-[var(--shadow-border)]"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2",
                tone === "good" && "text-good",
                tone === "bad" && "text-danger",
                tone === "accent" && "text-accent",
                tone === "muted" && "text-muted",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate font-display text-xs font-semibold uppercase tracking-wide",
                  seat === 0 ? "text-p1" : "text-p2",
                )}
              >
                <GmName seat={seat} nameClassName={seat === 0 ? "text-p1" : "text-p2"} />
              </p>
              <p
                className={cn(
                  "truncate font-display text-sm font-semibold uppercase tracking-tight",
                  tone === "good" && "text-good",
                  tone === "bad" && "text-danger",
                  tone === "accent" && "text-accent",
                  tone === "muted" && "text-muted",
                )}
              >
                {prizeLabel(prize)}
              </p>
              {loans.some((loan) => loan.seat === seat) ? (
                <p className="truncate text-[10px] text-danger">Loan. −10 overall.</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SeatBoxes({
  seat,
  mine,
  canPick,
  active,
}: {
  seat: Seat;
  mine: boolean;
  canPick: boolean;
  active: boolean;
}) {
  const names = useGame((s) => s.names);
  const cash = useGame((s) => s.cash);
  const bonus = useGame((s) => s.bonus);
  const freeRerolls = useGame((s) => s.freeRerolls);
  const htRaw = useGame((s) => s.halftime);
  const pickBox = useGame((s) => s.pickBox);
  const ht = hasHalftimeBoxes(htRaw) ? htRaw : sealedHalftime();
  const tone = seat === 0 ? "text-p1" : "text-p2";
  const ring = seat === 0 ? "ring-p1/40" : "ring-p2/40";
  const pick = ht.picks[seat];
  const revealRest = ht.applied;
  const row = ht.boxes[seat] ?? [];
  const won = revealRest && pick !== null ? pickedPrize(ht, seat) : null;

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl bg-surface/90 p-2.5 shadow-[var(--shadow-border)]",
        active && `ring-1 ${ring}`,
      )}
    >
      <div className="mb-2 flex shrink-0 items-baseline justify-between gap-1">
        <div className="min-w-0">
          <h2 className={cn("truncate font-display text-sm font-semibold uppercase tracking-wide", tone)}>
            {names[seat]}
            {mine ? <span className="ml-1 text-[10px] font-medium tracking-wide text-subtle">You</span> : null}
          </h2>
          <p className="truncate text-[10px] tabular-nums text-subtle">
            ${cash[seat]}
            {bonus[seat] !== 0 ? ` · ${bonus[seat] > 0 ? "+" : ""}${bonus[seat]}` : ""}
            {freeRerolls[seat] > 0 ? ` · ${freeRerolls[seat]} reroll` : ""}
          </p>
        </div>
        <p className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-subtle">
          {won
            ? prizeShort(won)
            : pick !== null
              ? "Picked"
              : canPick
                ? "Your pick"
                : "Sealed"}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5">
        {row.map((prize, index) => {
          const selected = pick === index;
          const open = revealRest && prize.kind !== "sealed";
          const missedOrder =
            revealRest && pick !== index
              ? row.slice(0, index + 1).filter((_, i) => i !== pick).length - 1
              : 0;
          return (
            <MysteryBox
              key={`${seat}-${index}`}
              index={index}
              prize={prize}
              open={open}
              selected={selected}
              pending={selected && prize.kind === "sealed"}
              missedOrder={missedOrder}
              disabled={!canPick}
              onPick={canPick ? () => pickBox(index, seat) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

function MysteryBox({
  index,
  prize,
  open,
  selected,
  pending,
  missedOrder,
  disabled,
  onPick,
}: {
  index: number;
  prize: Prize;
  open: boolean;
  selected: boolean;
  pending: boolean;
  missedOrder: number;
  disabled: boolean;
  onPick?: () => void;
}) {
  const tone = prizeTone(prize);
  const label = prizeShort(prize);
  const Icon = prizeIcon(prize);
  const color =
    tone === "good"
      ? "text-good"
      : tone === "bad"
        ? "text-danger"
        : tone === "accent"
          ? "text-accent"
          : "text-muted";
  const live = Boolean(onPick) && !disabled;

  return (
    <button
      type="button"
      disabled={disabled || !onPick}
      onClick={onPick}
      aria-label={
        open
          ? `Box ${index + 1}, ${prizeLabel(prize)}${selected ? ", yours" : ", left"}`
          : pending
            ? `Box ${index + 1}, picked, still sealed`
            : `Box ${index + 1}, sealed`
      }
      aria-pressed={selected}
      className={cn(
        "group relative min-h-11 w-full overflow-hidden rounded-xl text-left shadow-[var(--shadow-border)]",
        "transition-[box-shadow,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
        live && "ht-scene is-live hover:shadow-[var(--shadow-border-hover)] active:scale-[0.96]",
        selected && "ring-1 ring-accent",
        open && !selected && "opacity-55",
      )}
    >
      {open ? (
        <span
          className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-bg px-2"
          aria-hidden="true"
          style={
            !selected ? { animationDelay: `${0.18 + missedOrder * 0.08}s` } : undefined
          }
        >
          <Icon className={cn("size-5", color, selected && "stamp")} strokeWidth={1.6} />
          <span
            className={cn(
              "mt-1 text-center font-display text-sm font-semibold uppercase leading-none tracking-tight sm:text-lg",
              color,
              selected && "stamp",
            )}
          >
            {label}
          </span>
          <span className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
            {selected ? "Yours" : "Left"}
          </span>
        </span>
      ) : (
        <span
          className="relative flex h-full w-full flex-col items-center justify-center rounded-xl bg-surface-2"
          aria-hidden="true"
        >
          <span className="absolute left-2 top-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">
            {index + 1}
          </span>
          <span className="font-display text-4xl font-semibold leading-none text-fg sm:text-5xl">?</span>
          <span className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {pending ? "Picked" : "Sealed"}
          </span>
        </span>
      )}
    </button>
  );
}
