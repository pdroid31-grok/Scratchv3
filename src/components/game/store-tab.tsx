"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star, Sun, Trophy, X } from "lucide-react";
import { BOX_COST, GOLDEN_COST, PRIZE_AVATARS, avatarById } from "@/lib/game/avatars";
import { getShowcase, buyNpl, getNplMine, getNplStock, submitNpl, type NplKind, type NplMineSlot, type NplStock } from "@/lib/game/stats";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [sold, setSold] = useState(false);
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
  const [card, setCard] = useState<"box" | "scratch" | "showcase" | "npl">("box");
  const boxRef = useRef<MysteryBoxHandle>(null);
  const opening = useRef(false);
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void getShowcase()
      .then((next) => {
        if (live) setSold(next.sold);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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
              className="flex h-20 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-[#f8e7a0] px-2 text-bg shadow-[var(--shadow-border)] hover:bg-[#ecd56a]"
              onClick={() => setUnlocksOpen(true)}
            >
              <Sun className="size-6 text-bg" />
              <span className="font-display text-xs font-semibold uppercase tracking-wider">Unlocks</span>
            </button>
            <button
              type="button"
              className="flex h-20 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-[#d4e8ff] px-2 text-bg shadow-[var(--shadow-border)] hover:bg-[#b9d7f7]"
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

      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["box", "Mystery Box"],
            ["scratch", "Scratch Ticket"],
            ["showcase", "Showcase"],
            ["npl", "NPL"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={card === id ? "default" : "secondary"}
            className="h-auto min-h-11 whitespace-normal px-1 text-center font-display text-[11px] uppercase leading-tight tracking-wider"
            onClick={() => setCard(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {card === "box" ? (
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
      ) : null}

      {card === "scratch" ? <ScratchCard /> : null}

      {card === "showcase" ? (
      <section className="w-full rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Showcase</p>
        <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">
          Golden <span className="text-muted">1/1</span>
        </h2>
        <img
          src={golden.src}
          alt={golden.name}
          className="mx-auto mt-4 aspect-square w-full max-w-56 rounded-xl object-cover shadow-[var(--shadow-border)]"
        />
        {shopNote ? <p className="mt-3 text-sm text-muted">{shopNote}</p> : null}
        {sold ? (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="mt-5 w-full font-display uppercase tracking-wider"
            disabled
          >
            Sold out
          </Button>
        ) : guest ? (
          <Button asChild size="lg" className="mt-5 w-full font-display uppercase tracking-wider">
            <Link to="/login">Sign in</Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            variant={sold ? "secondary" : "default"}
            className="mt-5 w-full font-display uppercase tracking-wider"
            disabled={busy || sold || hasGolden || coins < GOLDEN_COST}
            onClick={async () => {
              if (busy || sold || hasGolden) return;
              setBusy(true);
              setShopNote(null);
              const result = await buyGolden();
              setBusy(false);
              if (!result) {
                setShopNote("Could not buy Golden. Try again.");
                return;
              }
              if (!result.ok) {
                if (result.reason === "sold") {
                  setSold(true);
                  return;
                }
                setShopNote(result.reason === "owned" ? "You already own Golden." : `Need $${GOLDEN_COST}.`);
                return;
              }
              setSold(true);
            }}
          >
            {sold ? "Sold out" : hasGolden ? "Owned" : busy ? "Buying…" : `Buy · $${GOLDEN_COST}`}
          </Button>
        )}
      </section>
      ) : null}

      {card === "npl" ? <NplCard guest={guest} coins={guest ? 0 : coins} /> : null}
    </div>
  );
}

function NplCard({ guest, coins }: { guest: boolean; coins: number }) {
  const load = useProfile((s) => s.load);
  const [stock, setStock] = useState<NplStock | null>(null);
  const [slots, setSlots] = useState<NplMineSlot[]>([]);
  const [form, setForm] = useState<NplMineSlot | null>(null);
  const [draft, setDraft] = useState({ name: "", logo: "", colors: "", firstName: "", lastName: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimer.current == null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const refresh = useCallback(async () => {
    if (guest) {
      setStock(await getNplStock());
      setSlots([]);
      return;
    }
    const next = await getNplMine({ data: {} });
    setStock(next);
    setSlots(next.slots);
  }, [guest]);

  useEffect(() => {
    let live = true;
    void refresh().catch(() => {
      if (live) setStock(null);
    });
    return () => {
      live = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!form) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setForm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]);

  function openForm(slot: NplMineSlot) {
    if (guest) return;
    setDraft({
      name: slot.name,
      logo: slot.logo,
      colors: slot.colors,
      firstName: slot.firstName,
      lastName: slot.lastName,
    });
    setForm(slot);
  }

  async function buy(kind: NplKind) {
    if (guest || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await buyNpl({ data: { kind } });
      if (!result.ok) {
        setNote(result.reason === "sold" ? "SOLD OUT" : result.reason === "broke" ? "Not enough." : "Could not buy.");
        await refresh();
        return;
      }
      await load();
      const next = await getNplMine({ data: {} });
      setStock(next);
      setSlots(next.slots);
      const slot = next.slots.find((row) => row.id === result.id);
      if (slot) openForm(slot);
    } catch {
      setNote("Could not buy.");
    } finally {
      setBusy(false);
    }
  }

  function startHold(kind: NplKind, left: number, cost: number) {
    return (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (guest || busy || left <= 0 || coins < cost) return;
      if (event.pointerType === "mouse") event.preventDefault();
      clearHold();
      window.addEventListener("scroll", clearHold, { capture: true, once: true });
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        void buy(kind);
      }, 1000);
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || guest || busy) return;
    const empty = form.kind === "team" ? !draft.name.trim() || !draft.logo.trim() || !draft.colors.trim() : !draft.firstName.trim() || !draft.lastName.trim();
    if (empty) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await submitNpl({ data: { id: form.id, ...draft } });
      if (!result.ok) {
        setNote(result.reason === "empty" ? "Empty does not submit." : "Already submitted.");
        return;
      }
      setForm(null);
      await refresh();
    } catch {
      setNote("Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  const teamLeft = stock?.teamLeft ?? null;
  const playerLeft = stock?.playerLeft ?? null;
  const teamCost = stock?.teamCost ?? 100;
  const playerCost = stock?.playerCost ?? 20;

  function offer(kind: NplKind, title: string, left: number | null, cost: number) {
    const soldOut = left === 0;
    return (
      <div className="flex min-w-0 flex-col rounded-lg bg-bg p-3 shadow-[var(--shadow-border)]">
        <div className="flex aspect-square items-center justify-center rounded-md bg-surface text-[11px] font-semibold uppercase tracking-wider text-muted">
          Placeholder
        </div>
        <p className="mt-3 font-display text-sm font-semibold uppercase leading-tight tracking-wide text-fg">{title}</p>
        <p className="mt-1 text-sm text-muted">${cost}</p>
        <p className="text-sm tabular-nums text-muted">{left == null ? "—" : `${left} left`}</p>
        {soldOut ? (
          <Button type="button" size="lg" variant="secondary" className="mt-3 w-full font-display uppercase tracking-wider" disabled>
            SOLD OUT
          </Button>
        ) : guest ? (
          <Button asChild size="lg" className="mt-3 w-full font-display uppercase tracking-wider">
            <Link to="/login">Sign in</Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="mt-3 w-full touch-pan-y font-display uppercase tracking-wider"
            disabled={busy || left == null || coins < cost}
            onPointerDown={startHold(kind, left ?? 0, cost)}
            onPointerUp={clearHold}
            onPointerCancel={clearHold}
            onPointerLeave={clearHold}
          >
            {busy ? "Buying…" : `Hold · $${cost}`}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section className="w-full rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">NPL</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {offer("team", "Name a Team/Logo", teamLeft, teamCost)}
        {offer("player", "Name a Player", playerLeft, playerCost)}
      </div>
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      {guest ? null : (
        <ul className="mt-4 grid gap-2">
          {slots.map((slot) => (
            <li key={slot.id} className="text-sm text-muted">
              {slot.status === "pending" ? <p>waiting for approval</p> : null}
              {slot.status === "approved" ? <p>{slot.note}</p> : null}
              {slot.status === "form" || slot.status === "denied" ? (
                <button type="button" className="text-left text-fg underline" onClick={() => openForm(slot)}>
                  {slot.kind === "team" ? "Name a Team/Logo" : "Name a Player"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {form && !guest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4" role="dialog" aria-modal="true" aria-label={form.kind === "team" ? "Name a Team/Logo" : "Name a Player"}>
          <form className="w-full max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]" onSubmit={(event) => void submit(event)}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">
                {form.kind === "team" ? "Name a Team/Logo" : "Name a Player"}
              </h2>
              <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]" aria-label="Close" onClick={() => setForm(null)}>
                <X className="size-5" strokeWidth={2} />
              </button>
            </div>
            {form.status === "denied" && form.denyReason ? <p className="mt-3 text-sm text-muted">{form.denyReason}</p> : null}
            <div className="mt-4 grid gap-3">
              {form.kind === "team" ? (
                <>
                  <Input aria-label="Name" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} />
                  <Input aria-label="Logo Design" placeholder="Logo Design" value={draft.logo} onChange={(event) => setDraft({ ...draft, logo: event.target.value })} maxLength={80} />
                  <Input aria-label="Colors" placeholder="Colors" value={draft.colors} onChange={(event) => setDraft({ ...draft, colors: event.target.value })} maxLength={80} />
                </>
              ) : (
                <>
                  <Input aria-label="First name" placeholder="First name" value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} maxLength={80} />
                  <Input aria-label="Last name" placeholder="Last name" value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} maxLength={80} />
                </>
              )}
              <Button type="submit" size="lg" className="font-display uppercase tracking-wider" disabled={busy}>
                Submit
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
