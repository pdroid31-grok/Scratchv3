"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { ElimStartScreen } from "@/components/game/elim-start-screen";
import { Button } from "@/components/ui/button";
import { AuthBar } from "@/components/game/auth-bar";
import { elimStartOpen } from "@/lib/game/elim";
import { useGame } from "@/lib/game/store";

export function LobbyScreen() {
  const names = useGame((s) => s.names);
  const kind = useGame((s) => s.kind);
  const phase = useGame((s) => s.phase);
  const roomFilled = useGame((s) => s.roomFilled);
  const code = useGame((s) => s.roomCode) ?? "";
  const reset = useGame((s) => s.reset);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  if (elimStartOpen({ phase, kind, names }, roomFilled)) {
    return <ElimStartScreen />;
  }

  function roomLink(): string {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    return url.toString();
  }

  async function copy(kind: "code" | "link") {
    const value = kind === "code" ? code : roomLink();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
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
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
            {kind === "elimination" ? "Elimination lobby" : "Auction Lobby"}
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg">
            Darkness
          </h1>
        </div>
        <AuthBar className="shrink-0" />
      </header>

      <section className="mt-8 rounded-xl bg-surface/90 px-5 py-8 text-center shadow-[var(--shadow-border)]">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-subtle">Send this Code to your Friend</p>
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
      </section>

      <p className="mt-6 text-center text-sm text-muted">Waiting on player to join...</p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="mt-8 w-full font-display uppercase tracking-wider"
        onClick={reset}
      >
        Cancel match
      </Button>
    </main>
  );
}
