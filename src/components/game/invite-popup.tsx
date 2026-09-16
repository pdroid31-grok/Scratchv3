"use client";

import { useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

export function InvitePopup({ onClose }: { onClose: () => void }) {
  const names = useGame((s) => s.names);
  const kind = useGame((s) => s.kind);
  const code = useGame((s) => s.roomCode) ?? "";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  function roomLink(): string {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    return url.toString();
  }

  async function copy(which: "code" | "link") {
    const value = which === "code" ? code : roomLink();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  async function share() {
    const url = roomLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Darkness",
          text: `${names[0]} is hosting a Darkness ${kind === "elimination" ? "Elimination" : "Auction"} night. Code ${code}`,
          url,
        });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await copy("link");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-5">
      <section className="relative w-full max-w-md rounded-xl bg-surface px-5 py-8 text-center shadow-[var(--shadow-border)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Close invite"
        >
          <X className="size-5" />
        </button>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-subtle">
          Send this Code to your Friend
        </p>
        <p className="mt-3 font-display text-6xl font-semibold tracking-[0.2em] text-fg">{code}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => void copy("code")}>
            {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied === "code" ? "Copied" : "Copy code"}
          </Button>
          <Button onClick={() => void share()}>
            <Share2 className="size-4" />
            {copied === "link" ? "Link copied" : "Share link"}
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted">Waiting on player to join...</p>
      </section>
    </div>
  );
}
