"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderRecapPng } from "@/lib/game/recap-art";
import { recapCaption, recapFromState, recapPath, type Recap } from "@/lib/game/recap";
import { useGame } from "@/lib/game/store";

export function ShareResultsButton() {
  const kind = useGame((s) => s.kind);
  const names = useGame((s) => s.names);
  const avatars = useGame((s) => s.avatars);
  const rosters = useGame((s) => s.rosters);
  const bonus = useGame((s) => s.bonus);
  const cash = useGame((s) => s.cash);
  const elim = useGame((s) => s.elim);
  const [status, setStatus] = useState<"idle" | "busy" | "shared" | "copied" | "saved">("idle");

  const recap = recapFromState({ kind, names, avatars, rosters, bonus, cash, elim });
  if (!recap) return null;
  const night = recap;

  async function share() {
    if (status === "busy") return;
    setStatus("busy");
    try {
      const result = await shareRecap(night);
      setStatus(result);
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("idle");
    }
  }

  const label =
    status === "busy"
      ? "Sharing…"
      : status === "copied"
        ? "Link copied"
        : status === "saved"
          ? "Photo saved"
          : status === "shared"
            ? "Shared"
            : "Share results";

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full font-display uppercase tracking-wider"
      disabled={status === "busy"}
      onClick={() => void share()}
    >
      <Share2 className="size-4" />
      {label}
    </Button>
  );
}

async function shareRecap(recap: Recap): Promise<"shared" | "copied" | "saved"> {
  const link = `${window.location.origin}${recapPath(recap)}`;
  const text = recapCaption(recap);
  let file: File | null = null;
  try {
    const blob = await renderRecapPng(recap);
    file = new File([blob], "darkness-night.png", { type: "image/png" });
  } catch {
    file = null;
  }

  if (navigator.share) {
    const data: ShareData = { title: "Darkness", text, url: link };
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ ...data, files: [file] });
        return "shared";
      }
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${link}`);
  } catch {
    /* ignore */
  }
  if (file) {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 2000);
    return "saved";
  }
  return "copied";
}
