"use client";

import { useEffect, useRef, useState } from "react";
import { avatarById } from "@/lib/game/avatars";
import { useRoomViewers } from "@/lib/game/room-viewers";

const BLINK_MS = 2700;

export function ViewingRow() {
  const viewers = useRoomViewers();
  const known = useRef<Set<string> | null>(null);
  const timer = useRef<number | null>(null);
  const [blink, setBlink] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const eyes = viewers.slice(0, 5);
  const extra = Math.max(0, viewers.length - eyes.length);

  useEffect(() => {
    const ids = viewers.map((eye) => eye.userId);
    const prev = known.current;
    known.current = new Set(ids);
    const joined = prev === null ? ids.length > 0 : ids.some((id) => !prev.has(id));
    if (!joined) return;
    setBlink(false);
    const frame = window.requestAnimationFrame(() => setBlink(true));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBlink(false), BLINK_MS);
    return () => window.cancelAnimationFrame(frame);
  }, [viewers]);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!eyes.length) return null;

  return (
    <>
      <span className="uppercase tracking-[0.28em]">Viewing</span>
      {eyes.map((eye) => (
        <img
          key={eye.userId}
          src={avatarById(eye.avatarId).src}
          alt=""
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setHeld(eye.name);
          }}
          onPointerUp={() => setHeld(null)}
          onPointerLeave={() => setHeld(null)}
          onPointerCancel={() => setHeld(null)}
          onLostPointerCapture={() => setHeld(null)}
          className={`size-5 rounded-full object-cover ${blink ? "viewer-blink" : ""}`}
        />
      ))}
      {extra > 0 ? <span className="text-[10px] tabular-nums tracking-normal text-muted">+{extra}</span> : null}
      {held ? (
        <span className="min-w-0 truncate text-[10px] font-semibold normal-case tracking-normal text-fg">{held}</span>
      ) : null}
    </>
  );
}
