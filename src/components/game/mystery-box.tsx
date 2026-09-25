"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { avatarById, type AvatarId } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { cn } from "@/lib/utils";

export type MysteryBoxHandle = {
  kick: () => void;
  stop: () => void;
};

const CLIP_MS = 5200;
const REDUCED_MS = 1100;
const HOLD_MS = 400;
const CLIP_SRC = "/mystery-roll.webp";

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const MysteryBox = forwardRef<
  MysteryBoxHandle,
  {
    owned?: readonly string[];
    prize: AvatarId | null;
    spinning: boolean;
    onSpinEnd: () => void;
    onResult?: (open: boolean) => void;
    onProfile?: () => void;
  }
>(function MysteryBox({ prize, spinning, onSpinEnd, onResult, onProfile }, ref) {
  const pick = useProfile((s) => s.pick);
  const won = prize ? avatarById(prize) : null;
  const endRef = useRef(onSpinEnd);
  const resultRef = useRef(onResult);
  endRef.current = onSpinEnd;
  resultRef.current = onResult;

  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const rollingRef = useRef(false);
  const finished = useRef(false);

  const [armed, setArmed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [result, setResult] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    rollingRef.current = false;
    setReveal(true);
    setResult(true);
    setArmed(false);
    resultRef.current?.(true);
    endRef.current();
  }

  function playClip() {
    if (rollingRef.current) return;
    rollingRef.current = true;
    finished.current = false;
    startedAt.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    setArmed(true);
    setResult(false);
    setReveal(false);
    resultRef.current?.(false);
    if (prefersReduced()) {
      setClipUrl(null);
      return;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (blobRef.current) {
      urlRef.current = URL.createObjectURL(blobRef.current);
      setClipUrl(urlRef.current);
      return;
    }
    setClipUrl(`${CLIP_SRC}?t=${startedAt.current}`);
  }

  function halt() {
    finished.current = false;
    rollingRef.current = false;
    startedAt.current = 0;
    setArmed(false);
    setReveal(false);
    setResult(false);
    setClipUrl(null);
    resultRef.current?.(false);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  useImperativeHandle(ref, () => ({
    kick: playClip,
    stop: halt,
  }));

  useEffect(() => {
    let gone = false;
    const preload = new Image();
    preload.src = CLIP_SRC;
    fetch(CLIP_SRC)
      .then((res) => (res.ok ? res.blob() : Promise.reject()))
      .then((blob) => {
        if (gone) return;
        blobRef.current = blob.type.includes("webp") ? blob : new Blob([blob], { type: "image/webp" });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!spinning || !prize || finished.current) return;
    if (!rollingRef.current) playClip();
    const clip = prefersReduced() ? REDUCED_MS : CLIP_MS;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = startedAt.current ? Math.max(0, now - startedAt.current) : 0;
    const remain = Math.max(0, clip - elapsed);
    const showOnChest = window.setTimeout(() => setReveal(true), remain);
    const showCard = window.setTimeout(finish, remain + HOLD_MS);
    const failsafe = window.setTimeout(finish, remain + HOLD_MS + 1200);
    return () => {
      window.clearTimeout(showOnChest);
      window.clearTimeout(showCard);
      window.clearTimeout(failsafe);
    };
  }, [spinning, prize]);

  function dismiss() {
    halt();
    endRef.current();
  }

  async function equipPrize() {
    if (prize) await pick(prize);
    dismiss();
  }

  const rolling = (armed || spinning) && !result;

  return (
    <div className="mystery-stage mx-auto mt-5 w-full max-w-md">
      <div className={cn("mystery-scene", rolling && "is-spinning", Boolean(clipUrl) && "is-live", result && "hidden")}>
        <img src="/mystery-roll-poster.jpg" alt="" className="mystery-still" draggable={false} />
        {rolling && clipUrl ? (
          <img src={clipUrl} alt="" className="mystery-roll" draggable={false} />
        ) : null}
        {won ? (
          <div className={cn("mystery-prize", reveal && "is-on")}>
            <img src={won.src} alt="" />
          </div>
        ) : null}
      </div>
      {result && won ? (
        <div className="mystery-result">
          <button type="button" className="mystery-result-x" onClick={dismiss} aria-label="Close">
            ×
          </button>
          <img src={won.src} alt="" className="mystery-result-face" />
          <p className="mystery-result-name">{won.name}</p>
          <button
            type="button"
            className="mt-3 inline-flex h-11 min-h-11 w-full items-center justify-center rounded-md bg-accent px-5 font-display text-sm font-semibold uppercase tracking-wider text-accent-fg"
            onClick={() => void equipPrize()}
          >
            Equip new character
          </button>
          <button
            type="button"
            className="mt-2 inline-flex h-11 min-h-11 w-full items-center justify-center rounded-md bg-surface-2 px-5 font-display text-sm font-semibold uppercase tracking-wider text-fg"
            onClick={dismiss}
          >
            Stay as current character
          </button>
          {onProfile ? (
            <button
              type="button"
              className="mt-3 text-xs text-muted underline-offset-2 hover:underline"
              onClick={() => {
                dismiss();
                onProfile();
              }}
            >
              Go to Profile to change at a later time
            </button>
          ) : (
            <Link
              to="/"
              search={{ tab: "profile" }}
              className="mt-3 text-xs text-muted underline-offset-2 hover:underline"
              onClick={dismiss}
            >
              Go to Profile to change at a later time
            </Link>
          )}
        </div>
      ) : null}
      {result && won ? null : spinning || armed ? (
        <p className="mt-3 text-sm text-muted">Opening…</p>
      ) : null}
    </div>
  );
});
