"use client";

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import {
  ACHIEVEMENT_UNLOCKS,
  AVATARS,
  CRYPEPE_ID,
  JOKER_ID,
  PRIZE_AVATARS,
  avatarById,
  isFeatAvatar,
  isStarAvatar,
} from "@/lib/game/avatars";
import {
  COMMISH_AVATAR_PROGRESS,
  commishAvatarProgress,
  isCommishAvatarProgressId,
  type CommishAvatarProgress,
  type CommishAvatarProgressId,
} from "@/lib/game/commish";

const FEAT_LOOKS = new Set<string>([...ACHIEVEMENT_UNLOCKS.map((row) => row.id)]);

function isFeatLook(id: string): boolean {
  return isFeatAvatar(id) || FEAT_LOOKS.has(id);
}

function showFeatStar(id: string): boolean {
  if (!isFeatLook(id)) return false;
  if (id === CRYPEPE_ID || id === JOKER_ID) return false;
  if (isStarAvatar(id)) return false;
  if (id === "poor") return false;
  if (PRIZE_AVATARS.some((row) => row.id === id)) return false;
  return true;
}

const ORDERED = [
  ...AVATARS.filter((avatar) => isFeatLook(avatar.id)),
  ...AVATARS.filter((avatar) => !isFeatLook(avatar.id)),
];

export function CommishAvatars() {
  const [open, setOpen] = useState<CommishAvatarProgressId | null>(null);

  return (
    <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
      <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">Avatars</h2>
      <p className="mt-1 text-sm text-muted">Preview only. {AVATARS.length} looks. A star is not a grant.</p>
      <ul className="mt-3 grid max-h-[min(72vh,44rem)] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
        {ORDERED.map((avatar) => {
          const progress = isCommishAvatarProgressId(avatar.id);
          const star = showFeatStar(avatar.id);
          const tile = (
            <>
              <span className="relative block">
                <img
                  src={avatar.src}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover shadow-[var(--shadow-border)]"
                />
                {star ? (
                  <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-bg/90 text-turf shadow-[var(--shadow-border)]">
                    <Star className="size-3 fill-current" aria-hidden />
                  </span>
                ) : null}
              </span>
              <p className="mt-1 truncate text-center font-display text-xs font-semibold uppercase tracking-wide text-fg">
                {avatar.name}
              </p>
            </>
          );
          return (
            <li key={avatar.id} className="min-w-0">
              {progress ? (
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    if (isCommishAvatarProgressId(avatar.id)) setOpen(avatar.id);
                  }}
                >
                  {tile}
                </button>
              ) : (
                tile
              )}
            </li>
          );
        })}
      </ul>
      {open ? <FeatProgressSheet id={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function FeatProgressSheet({ id, onClose }: { id: CommishAvatarProgressId; onClose: () => void }) {
  const spec = COMMISH_AVATAR_PROGRESS.find((row) => row.id === id);
  const look = avatarById(id);
  const [state, setState] = useState<"load" | "ready" | "error">("load");
  const [data, setData] = useState<CommishAvatarProgress | null>(null);

  useEffect(() => {
    let live = true;
    void commishAvatarProgress({ data: { id } })
      .then((next) => {
        if (!live) return;
        setData(next);
        setState("ready");
      })
      .catch(() => {
        if (live) setState("error");
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={spec?.label ?? "Feat progress"}
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={look.src} alt="" className="size-12 shrink-0 rounded-md object-cover" />
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-semibold uppercase tracking-wide text-fg">
                {spec?.label ?? look.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{spec?.hint}</p>
            </div>
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
        <div className="overflow-y-auto p-4">
          {state === "load" ? <p className="text-sm text-muted">Loading…</p> : null}
          {state === "error" ? <p className="text-sm text-muted">Could not load progress.</p> : null}
          {state === "ready" && data ? (
            data.rows.length ? (
              <ul className="grid gap-2">
                {data.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-bg px-3 py-2.5 shadow-[var(--shadow-border)]"
                  >
                    <span className="min-w-0 truncate text-sm text-fg">{row.name}</span>
                    <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-fg">{row.progress}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No players.</p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
