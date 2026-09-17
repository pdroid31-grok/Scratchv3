"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { avatarById } from "@/lib/game/avatars";
import { claimScratch, openScratch } from "@/lib/game/scratch-api";
import { SCRATCH_NEED, SCRATCH_WIPE, scratchPercent, type ScratchCardView, type ScratchPrize } from "@/lib/game/scratch";
import { useProfile } from "@/lib/game/profile-store";
import { cn } from "@/lib/utils";

const ODDS: readonly { chance: string; prize: string }[] = [
  { chance: "10%", prize: "Nothing" },
  { chance: "30%", prize: "+$1" },
  { chance: "25%", prize: "+$2" },
  { chance: "20%", prize: "+1 Star" },
  { chance: "10%", prize: "+$3" },
  { chance: "4%", prize: "+$1 and +1 Star" },
  { chance: "1%", prize: "Unlocks New Character" },
];

function OddsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scratch Off Ticket odds"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-surface p-4 pt-14 shadow-[var(--shadow-border)] sm:p-5 sm:pt-14"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-5" strokeWidth={2} />
        </button>
        <ul className="grid gap-2">
          {ODDS.map((row) => (
            <li key={row.prize} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-display font-semibold tabular-nums text-turf">{row.chance}</span>
              <span className="text-right text-fg">{row.prize}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
function PrizeGlyph({ prize, className }: { prize: ScratchPrize; className?: string }) {
  if (prize.avatar) {
    const look = avatarById(prize.avatar);
    return <img src={look.src} alt="" className={cn("size-full rounded-md object-cover", className)} />;
  }
  if (prize.key === "star") {
    return <Star className={cn("size-10 text-turf", className)} fill="currentColor" />;
  }
  if (prize.key === "combo") {
    return (
      <span className={cn("flex items-center gap-1 font-display text-lg font-semibold text-fg", className)}>
        $1
        <Star className="size-5 text-turf" fill="currentColor" />
      </span>
    );
  }
  return <span className={cn("font-display text-2xl font-semibold text-fg", className)}>{prize.label}</span>;
}

function Foil({
  onDone,
}: {
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const finished = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const paintFoil = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const fill = getComputedStyle(canvas).getPropertyValue("--color-foil").trim() || "currentColor";
    const dim = getComputedStyle(canvas).getPropertyValue("--color-foil-dim").trim() || "currentColor";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = dim;
    for (let y = 0; y < height; y += 7) {
      ctx.globalAlpha = 0.18;
      ctx.fillRect(0, y, width, 2);
    }
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? 320;
    const h = parent?.clientHeight ?? 140;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(w * ratio));
    canvas.height = Math.max(1, Math.floor(h * ratio));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    paintFoil();
  }, [paintFoil]);

  function pos(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * canvas.width;
    const y = ((event.clientY - box.top) / box.height) * canvas.height;
    return { x, y };
  }

  function wipe(from: { x: number; y: number } | null, to: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(canvas.width, canvas.height) * 0.14;
    ctx.beginPath();
    if (from) ctx.moveTo(from.x, from.y);
    else ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function wipedShare(): number {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    const step = 16;
    for (let i = 3; i < data.length; i += step) {
      if (data[i]! < 48) clear += 1;
    }
    return clear / (data.length / step);
  }

  function finish() {
    if (finished.current) return;
    finished.current = true;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.opacity = "0";
    onDone();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (finished.current || !drawing.current) return;
    const next = pos(event);
    wipe(last.current, next);
    last.current = next;
    if (wipedShare() >= SCRATCH_WIPE) finish();
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full touch-none rounded-lg transition-opacity duration-[var(--motion-slow)]"
      style={{ opacity: 1 }}
      onPointerDown={(event) => {
        if (finished.current || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        last.current = pos(event);
        wipe(null, last.current);
      }}
      onPointerMove={move}
      onPointerUp={() => {
        drawing.current = false;
        last.current = null;
      }}
      onPointerCancel={() => {
        drawing.current = false;
        last.current = null;
      }}
    />
  );
}

function ScratchPlay({ card, onClose }: { card: ScratchCardView; onClose: () => void }) {
  const applyScratch = useProfile((s) => s.applyScratch);
  const [locked, setLocked] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  const claiming = useRef(false);

  async function reveal() {
    if (claiming.current) return;
    claiming.current = true;
    setLocked(true);
    const result = await claimScratch({ data: { cardId: card.id } });
    if (!result.ok) {
      setClaimed("Already scratched.");
      return;
    }
    applyScratch(result);
    const extra = result.grantedAvatar ? ` · ${avatarById(result.grantedAvatar).name}` : "";
    setClaimed(`${result.prize.label}${extra}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Scratch card"
      onClick={locked ? onClose : undefined}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Scratch</p>
            <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Ticket</h2>
          </div>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
        <div className="grid gap-3 p-4">
          <img src="/scratch-ticket.jpg" alt="" className="w-full rounded-lg object-cover shadow-[var(--shadow-border)]" />
          <div className="relative overflow-hidden rounded-lg bg-bg p-4 shadow-[var(--shadow-border)]">
            <p className="mb-3 text-center text-xs uppercase tracking-[0.2em] text-muted">Prize</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="flex aspect-square items-center justify-center rounded-md bg-surface">
                  <PrizeGlyph prize={card.prize} />
                </div>
              ))}
            </div>
            {locked ? null : <Foil onDone={() => void reveal()} />}
          </div>
          {claimed ? (
            <p className="text-center font-display text-lg font-semibold uppercase tracking-wide text-fg">{claimed}</p>
          ) : (
            <p className="text-center text-sm text-muted">Wipe the foil. Closing keeps this ticket.</p>
          )}
          {claimed ? (
            <Button type="button" size="lg" className="w-full font-display uppercase tracking-wider" onClick={onClose}>
              Done
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ScratchCard() {
  const book = useProfile((s) => s.book);
  const loaded = useProfile((s) => s.loaded);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<ScratchCardView | null>(null);
  const [busy, setBusy] = useState(false);
  const bank = book?.scratchBank ?? 0;
  const ready = book?.scratchReady ?? 0;
  const percent = scratchPercent(bank);

  async function start() {
    if (busy || ready < 1) return;
    setBusy(true);
    const next = await openScratch({ data: {} });
    setBusy(false);
    if (!next) return;
    setCard(next);
    setOpen(true);
  }

  return (
    <>
      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="flex items-center gap-1">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
            Scratch Off Ticket
          </p>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center"
            aria-label="Scratch Off Ticket odds"
            onClick={() => setOddsOpen(true)}
          >
            <span className="flex size-7 items-center justify-center rounded-full border-2 border-fg font-display text-base font-semibold leading-none text-fg">
              ?
            </span>
          </button>
        </div>
        <img
          src="/scratch-ticket.jpg"
          alt=""
          className="mt-3 w-full rounded-lg object-cover shadow-[var(--shadow-border)]"
        />
        <div className="mt-3 min-w-0">
            <p className="font-display text-xl font-semibold uppercase tracking-wide text-fg">
              {loaded ? `${bank} / ${SCRATCH_NEED}` : "—"}
            </p>
            <p className="text-sm text-muted">{loaded ? percent : ""}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-turf"
                style={{ width: `${Math.min(100, (bank / SCRATCH_NEED) * 100)}%` }}
              />
            </div>
        </div>
        {ready > 0 ? (
          <Button
            type="button"
            size="lg"
            className="mt-4 w-full font-display uppercase tracking-wider"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? "Loading…" : ready > 1 ? `Scratch · ${ready} waiting` : "Scratch"}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted">Daily scores fill the ticket. Missed days stay on the bank.</p>
        )}
      </section>
      {oddsOpen ? <OddsHelp onClose={() => setOddsOpen(false)} /> : null}
      {open && card ? (
        <ScratchPlay
          card={card}
          onClose={() => {
            setOpen(false);
            setCard(null);
          }}
        />
      ) : null}
    </>
  );
}
