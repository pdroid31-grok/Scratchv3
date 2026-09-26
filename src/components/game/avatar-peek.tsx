"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function AvatarPeek({
  src,
  alt = "",
  name,
  source,
  className,
  buttonClassName,
  equip = false,
  equipped = false,
  onEquip,
}: {
  src: string;
  alt?: string;
  name?: string;
  source?: string | null;
  className?: string;
  buttonClassName?: string;
  equip?: boolean;
  equipped?: boolean;
  onEquip?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={buttonClassName ?? "shrink-0"}
        aria-label={name ? `View ${name}` : "View avatar"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} className={className} />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-5"
          role="dialog"
          aria-modal="true"
          aria-label={name || "Avatar"}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
          {name ? (
            <div className="flex w-full max-w-sm flex-col items-center" onClick={(event) => event.stopPropagation()}>
              <img
                src={src}
                alt={alt}
                className="max-h-[min(80vh,28rem)] w-full rounded-xl object-cover shadow-[var(--shadow-border)]"
              />
              <p className="mt-3 text-center font-display text-lg font-semibold uppercase tracking-wide text-fg">
                {name}
              </p>
              {source ? <p className="mt-1 text-center text-sm text-muted">{source}</p> : null}
              {equip ? (
                <button
                  type="button"
                  disabled={equipped}
                  className="mt-4 inline-flex h-11 min-h-11 w-full items-center justify-center rounded-md bg-fg px-4 font-display text-sm font-semibold uppercase tracking-wider text-bg disabled:opacity-60"
                  onClick={() => {
                    if (equipped) return;
                    onEquip?.();
                    setOpen(false);
                  }}
                >
                  {equipped ? "EQUIPPED" : "EQUIP"}
                </button>
              ) : null}
            </div>
          ) : (
            <img
              src={src}
              alt={alt}
              className="max-h-[min(80vh,28rem)] w-full max-w-sm rounded-xl object-cover shadow-[var(--shadow-border)]"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
