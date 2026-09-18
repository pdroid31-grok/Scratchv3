"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star, Sun, Trophy } from "lucide-react";
import { BOX_COST, GOLDEN_COST, PRIZE_AVATARS, avatarById } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { MysteryBox, type MysteryBoxHandle } from "@/components/game/mystery-box";
import { ScratchCard } from "@/components/game/scratch-card";
import { DailyUnlocksSheet } from "@/components/game/daily-unlocks";
import { AchievementsSheet } from "@/components/game/achievements-unlocks";
import type { AvatarId } from "@/lib/game/avatars";

export function StoreTab({ onProfile }: { onProfile?: () => void }) {
  const { user, isPending } = useCurrentUserState();
  const book = useProfile((s) => s.book);
  const loaded = useProfile((s) => s.loaded);
  const rollBox = useProfile((s) => s.rollBox);
  const buyGolden = useProfile((s) => s.buyGolden);
  const coins = book?.coins ?? 0;
  const stars = book?.dailyStars ?? 0;
  const owned = book?.owned ?? ["poor"];
  const left = PRIZE_AVATARS.filter((avatar) => !owned.includes(avatar.id)).length;
  const hasGolden = owned.includes("golden");
  const golden = avatarById("golden");
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState<AvatarId | null>(null);
  const [reelOwned, setReelOwned] = useState<readonly string[]>(["poor"]);
  const [note, setNote] = useState<string | null>(null);
  const [shopNote, setShopNote] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [unlocksOpen, setUnlocksOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const boxRef = useRef<MysteryBoxHandle>(null);
  const opening = useRef(false);
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = "/mystery-roll.webp";
    void fetch("/mystery-roll.webp");
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current == null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const finishSpin = useCallback(() => {
    setSpinning(false);
    setBusy(false);
    opening.current = false;
  }, []);

  async function open() {
    if (opening.current || busy || !user) return;
    opening.current = true;
    setBusy(true);
    setNote(null);
    boxRef.current?.kick();
    const snapshot = owned;
    const result = await rollBox();
    if (!result) {
      boxRef.current?.stop();
      opening.current = false;
      setBusy(false);
      setSpinning(false);
      setNote("Could not open the box. Try again.");
      return;
    }
    if (!result.ok) {
      boxRef.current?.stop();
      opening.current = false;
      setBusy(false);
      setSpinning(false);
      setNote(result.reason === "complete" ? "You already own every look." : "Need $3 to open a box.");
      return;
    }
    setReelOwned(snapshot);
    setPrize(result.prize);
    setSpinning(true);
  }

  function startHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    if (opening.current || busy || left === 0 || coins < BOX_COST || !user) return;
    if (event.pointerType === "mouse") event.preventDefault();
    clearHold();
    window.addEventListener("scroll", clearHold, { capture: true, once: true });
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      void open();
    }, 1000);
  }

  if (isPending && !user) {
    return <div className="mt-5 h-64 animate-pulse rounded-xl bg-surface/90" />;
  }

  const guest = !user;

  return (
    <div className="mt-6 grid w-full min-w-0 gap-4">
      <section className="w-full rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Bank</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <h2 className="font-display text-2xl font-semibold uppercase leading-none tracking-wide text-fg">
              ${guest ? 0 : loaded ? coins : "—"}
            </h2>
            <p className="flex items-center gap-1 font-display text-2xl font-semibold tabular-nums leading-none tracking-wide text-fg">
              <Star className="size-[1.15em] shrink-0 text-fg" fill="currentColor" />
              {guest ? 0 : loaded ? stars : "—"}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 justify-center gap-3">
            <button
              type="button"
              className="flex h-20 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-fg px-2 text-bg shadow-[var(--shadow-border)] hover:bg-fg/90"
              onClick={() => setUnlocksOpen(true)}
            >
              <Sun className="size-6 text-bg" />
              <span className="font-display text-xs font-semibold uppercase tracking-wider">Unlocks</span>
            </button>
            <button
              type="button"
              className="flex h-20 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-fg px-2 text-bg shadow-[var(--shadow-border)] hover:bg-fg/90"
              onClick={() => setAchievementsOpen(true)}
            >
              <Trophy className="size-6 text-bg" />
              <span className="text-center font-display text-xs font-semibold uppercase tracking-wider">
                Achievements
              </span>
            </button>
          </div>
        </div>
        {unlocksOpen ? <DailyUnlocksSheet onClose={() => setUnlocksOpen(false)} /> : null}
        {achievementsOpen ? <AchievementsSheet onClose={() => setAchievementsOpen(false)} /> : null}
      </section>

      <section className="w-full rounded-xl bg-surface/90 p-4 text-center shadow-[var(--shadow-border)] sm:p-6">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
          Mystery box
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">
          Unlock New Characters
        </h2>
        <p className="mt-1 text-sm text-muted">
          ${BOX_COST} a roll · {left} remaining to be unlocked
        </p>

        <MysteryBox
          ref={boxRef}
          owned={reelOwned}
          prize={prize}
          spinning={spinning}
          onSpinEnd={finishSpin}
          onResult={setResultOpen}
          onProfile={onProfile}
        />
        {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}

        {resultOpen ? null : guest ? (
          <Button asChild size="lg" className="mt-5 w-full font-display uppercase tracking-wider">
            <Link to="/login">Sign in</Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full touch-pan-y font-display uppercase tracking-wider"
            disabled={busy || left === 0 || coins < BOX_COST}
            onPointerDown={startHold}
            onPointerUp={clearHold}
            onPointerCancel={clearHold}
            onPointerLeave={clearHold}
          >
            {busy ? "Opening…" : left === 0 ? "Sold out" : `Hold to open $${BOX_COST}`}
          </Button>
        )}
      </section>

      <ScratchCard />

      <section className="w-full rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Showcase</p>
        <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Golden</h2>
        <img
          src={golden.src}
          alt={golden.name}
          className="mx-auto mt-4 aspect-square w-full max-w-56 rounded-xl object-cover shadow-[var(--shadow-border)]"
        />
        {shopNote ? <p className="mt-3 text-sm text-muted">{shopNote}</p> : null}
        {guest ? (
          <Button asChild size="lg" className="mt-5 w-full font-display uppercase tracking-wider">
            <Link to="/login">Sign in</Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full font-display uppercase tracking-wider"
            disabled={busy || hasGolden || coins < GOLDEN_COST}
            onClick={async () => {
              if (busy || hasGolden) return;
              setBusy(true);
              setShopNote(null);
              const result = await buyGolden();
              setBusy(false);
              if (!result) {
                setShopNote("Could not buy Golden. Try again.");
                return;
              }
              if (!result.ok) {
                setShopNote(result.reason === "owned" ? "You already own Golden." : `Need $${GOLDEN_COST}.`);
              }
            }}
          >
            {hasGolden ? "Owned" : busy ? "Buying…" : `Buy · $${GOLDEN_COST}`}
          </Button>
        )}
      </section>
    </div>
  );
}
