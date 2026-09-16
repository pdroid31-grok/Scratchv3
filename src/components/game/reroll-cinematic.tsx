"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  consumeRerollFx,
  rerollCinematicKind,
  type RerollCinematicKind,
} from "@/lib/game/auction";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

const UPGRADE_MS = 2800;
const BUST_MS = 3400;

const POOP_STICKERS = ["/pepe-poop-sad.png", "/pepe-poop-smirk.png"] as const;

const BURSTS = [
  { left: 18, top: 22, delay: 0, tone: "good" as const },
  { left: 78, top: 16, delay: 0.12, tone: "gold" as const },
  { left: 50, top: 26, delay: 0.24, tone: "accent" as const },
  { left: 34, top: 14, delay: 0.38, tone: "good" as const },
  { left: 64, top: 30, delay: 0.5, tone: "gold" as const },
];

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function useRerollCinematic() {
  const fx = useGame((s) => s.rerollFx);
  const discardsLen = useGame((s) => s.discards.length);
  const [kind, setKind] = useState<RerollCinematicKind | null>(null);
  const [token, setToken] = useState(0);
  const playedSeq = useRef<number | null>(null);
  const playedDiscards = useRef<number | null>(null);
  const hiddenHold = useRef<{ kind: RerollCinematicKind; seq: number } | null>(null);

  const arm = useCallback((nextKind: RerollCinematicKind, seq: number) => {
    if (isHidden()) {
      hiddenHold.current = { kind: nextKind, seq };
      return;
    }
    hiddenHold.current = null;
    setKind(nextKind);
    setToken(seq);
  }, []);

  const scan = useCallback(
    (freshOnly: boolean) => {
      const state = useGame.getState();
      const primed = playedSeq.current !== null;
      const prevSeq = playedSeq.current ?? 0;
      const decided = consumeRerollFx(prevSeq, state.rerollFx, Date.now(), freshOnly || !primed);
      playedSeq.current = decided.seq;

      if (playedDiscards.current === null) {
        playedDiscards.current = state.discards.length;
      } else if (state.discards.length > playedDiscards.current) {
        playedDiscards.current = state.discards.length;
        if (!decided.kind && !state.rerollFx) {
          const last = state.discards[state.discards.length - 1];
          const fromDiscard = last
            ? rerollCinematicKind(last.player.rating, last.kept.rating)
            : null;
          if (fromDiscard) {
            arm(fromDiscard, Date.now());
            return;
          }
        }
      }

      if (decided.kind) arm(decided.kind, decided.seq);
    },
    [arm],
  );

  useEffect(() => {
    scan(false);
  }, [fx, discardsLen, scan]);

  useEffect(() => {
    const wake = () => {
      if (isHidden()) return;
      const held = hiddenHold.current;
      if (held) {
        const still = consumeRerollFx(held.seq - 1, useGame.getState().rerollFx, Date.now(), true);
        hiddenHold.current = null;
        if (still.kind) {
          setKind(still.kind);
          setToken(still.seq);
          return;
        }
      }
      scan(true);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [scan]);

  useEffect(() => {
    if (!kind) return;
    if (isHidden()) return;
    const ms = kind === "upgrade" ? UPGRADE_MS : BUST_MS;
    const id = window.setTimeout(() => setKind(null), ms);
    return () => window.clearTimeout(id);
  }, [kind, token]);

  return { kind, token };
}

export function RerollCinematic({
  kind,
  token,
}: {
  kind: RerollCinematicKind | null;
  token: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!kind || !mounted || typeof document === "undefined") return null;

  const node = (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-0 overflow-hidden",
          kind === "upgrade" ? "z-[80]" : "z-[90]",
        )}
        style={{ zIndex: kind === "upgrade" ? 80 : 90 }}
        aria-hidden
      >
        <div
          className={cn(
            "absolute inset-0 opacity-0",
            kind === "upgrade" ? "reroll-wash-up" : "reroll-wash-down",
          )}
        />
        {kind === "upgrade" ? <Fireworks key={token} /> : <PoopRain key={token} />}
        {kind === "bust" ? <BustStamp key={`stamp-${token}`} /> : null}
      </div>
      <p
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[95] text-center font-display text-lg font-semibold uppercase tracking-[0.18em] text-fg sm:text-xl"
        role="status"
      >
        {kind === "upgrade" ? "Reroll came back better" : "Reroll came back worse"}
      </p>
    </>
  );

  return createPortal(node, document.body);
}

function BustStamp() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <img
        src="/pepe-poop-sad.png"
        alt=""
        draggable={false}
        className="reroll-bust-stamp size-[min(42vw,220px)] object-contain"
      />
    </div>
  );
}

const SPARKS: [number, number, number][] = [
  [232, 235, 230],
  [196, 180, 154],
  [197, 208, 198],
  [125, 154, 122],
  [232, 212, 160],
];

function FireworkBursts() {
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sparks = useMemo(() => {
    const n = reduced ? 10 : 16;
    return BURSTS.flatMap((burst, b) => {
      const items = Array.from({ length: n }, (_, i) => {
        const ang = (Math.PI * 2 * i) / n + b * 0.11;
        const dist = reduced ? 36 + (i % 4) * 8 : 72 + (i % 5) * 18;
        return {
          id: `${b}-${i}`,
          left: burst.left,
          top: burst.top,
          delay: burst.delay + (reduced ? 0 : (i % 4) * 0.03),
          tone: burst.tone,
          sx: Math.cos(ang) * dist,
          sy: Math.sin(ang) * dist,
        };
      });
      return items;
    });
  }, [reduced]);

  return (
    <div className="absolute inset-0">
      {BURSTS.map((burst, i) => (
        <span
          key={`flash-${i}`}
          className={cn("fw-flash", `fw-${burst.tone}`)}
          style={{
            left: `${burst.left}%`,
            top: `${burst.top}%`,
            animationDelay: `${burst.delay}s`,
          }}
        />
      ))}
      {sparks.map((spark) => (
        <span
          key={spark.id}
          className={cn("fw-spark", `fw-${spark.tone}`, reduced && "fw-spark-static")}
          style={{
            left: `${spark.left}%`,
            top: `${spark.top}%`,
            animationDelay: `${spark.delay}s`,
            ["--sx" as string]: `${spark.sx}px`,
            ["--sy" as string]: `${spark.sy}px`,
          }}
        />
      ))}
    </div>
  );
}

function Fireworks() {
  return (
    <>
      <FireworkBursts />
      <FireworkCanvas />
    </>
  );
}

function FireworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let alive = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const fit = () => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    fit();
    window.addEventListener("resize", fit);

    type Spark = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      max: number;
      size: number;
      color: [number, number, number];
    };
    type Rocket = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      ty: number;
      color: [number, number, number];
    };

    const sparks: Spark[] = [];
    const rockets: Rocket[] = [];
    const launches = [0, 0.12, 0.24, 0.38, 0.52];
    let launched = 0;
    let elapsed = 0;
    let last = performance.now();

    const burst = (x: number, y: number, color: [number, number, number]) => {
      const n = 64 + Math.floor(Math.random() * 20);
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.18;
        const spd = 100 + Math.random() * 300;
        const tint = Math.random() > 0.5 ? color : SPARKS[Math.floor(Math.random() * SPARKS.length)]!;
        sparks.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0,
          max: 0.8 + Math.random() * 0.75,
          size: 2 + Math.random() * 3.2,
          color: tint,
        });
      }
    };

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;

      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      while (launched < launches.length && elapsed >= launches[launched]!) {
        const x = w * (0.16 + Math.random() * 0.68);
        const ty = h * (0.14 + Math.random() * 0.24);
        const dur = 0.4 + Math.random() * 0.1;
        const color = SPARKS[launched % SPARKS.length]!;
        rockets.push({
          x,
          y: h + 8,
          vx: ((Math.random() - 0.5) * (w * 0.12)) / dur,
          vy: (ty - (h + 8)) / dur,
          ty,
          color,
        });
        launched += 1;
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const rocket = rockets[i]!;
        rocket.x += rocket.vx * dt;
        rocket.y += rocket.vy * dt;
        ctx.beginPath();
        ctx.fillStyle = `rgb(${rocket.color[0]},${rocket.color[1]},${rocket.color[2]})`;
        ctx.arc(rocket.x, rocket.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rocket.color[0]},${rocket.color[1]},${rocket.color[2]},0.4)`;
        ctx.arc(rocket.x, rocket.y + 10, 1.6, 0, Math.PI * 2);
        ctx.fill();
        if (rocket.y <= rocket.ty) {
          burst(rocket.x, rocket.y, rocket.color);
          rockets.splice(i, 1);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i]!;
        spark.life += dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 380 * dt;
        spark.vx *= Math.exp(-1.1 * dt);
        spark.vy *= Math.exp(-0.35 * dt);
        const u = spark.life / spark.max;
        if (u >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const alpha = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${spark.color[0]},${spark.color[1]},${spark.color[2]},${0.65 * alpha})`;
        ctx.arc(spark.x, spark.y, spark.size * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.arc(spark.x, spark.y, Math.max(1.2, spark.size * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(${spark.color[0]},${spark.color[1]},${spark.color[2]},${alpha})`;
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (elapsed < 2.4 || rockets.length > 0 || sparks.length > 0) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

type Drop = {
  id: number;
  src: string | null;
  glyph: string | null;
  left: number;
  delay: number;
  duration: number;
  size: number;
  dx: number;
  spin: number;
};

function makeDrops(reduced: boolean): Drop[] {
  const n = reduced ? 8 : 34;
  return Array.from({ length: n }, (_, i) => {
    const sticker = POOP_STICKERS[i % POOP_STICKERS.length]!;
    const useEmoji = i % 3 === 0;
    return {
      id: i,
      src: useEmoji ? null : sticker,
      glyph: useEmoji ? "💩" : null,
      left: (i * 37 + 11) % 100,
      delay: reduced ? 0 : (i % 8) * 0.08 + (i % 3) * 0.05,
      duration: reduced ? 0.9 : 2.15 + (i % 7) * 0.16,
      size: reduced ? 44 : 40 + (i % 6) * 10,
      dx: ((i * 13) % 90) - 36,
      spin: (i % 2 === 0 ? 1 : -1) * (140 + (i % 5) * 40),
    };
  });
}

function PoopRain() {
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const drops = useMemo(() => makeDrops(reduced), [reduced]);

  return (
    <div className="absolute inset-0">
      {drops.map((drop) => (
        <span
          key={drop.id}
          className={cn("poop-drop absolute top-0 will-change-transform", reduced && "poop-drop-static")}
          style={{
            left: `${drop.left}%`,
            width: drop.size,
            height: drop.size,
            fontSize: drop.size * 0.86,
            animationDelay: `${drop.delay}s`,
            animationDuration: `${drop.duration}s`,
            ["--dx" as string]: `${drop.dx}px`,
            ["--spin" as string]: `${drop.spin}deg`,
          }}
        >
          {drop.src ? (
            <img src={drop.src} alt="" draggable={false} className="size-full object-contain" />
          ) : (
            drop.glyph
          )}
        </span>
      ))}
    </div>
  );
}
