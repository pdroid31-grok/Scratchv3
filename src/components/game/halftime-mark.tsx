"use client";

import { Banknote, CircleSlash, Dices, Trophy, type LucideIcon } from "lucide-react";
import { pickedPrize, prizeTone, type Prize } from "@/lib/game/halftime";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function prizeIcon(prize: Prize): LucideIcon {
  if (prize.kind === "reroll") return Dices;
  if (prize.kind === "points") return Trophy;
  if (prize.kind === "nothing") return CircleSlash;
  return Banknote;
}

export function HalftimeMark({
  seat,
  size = "sm",
}: {
  seat: Seat;
  size?: "sm" | "md";
}) {
  const ht = useGame((s) => s.halftime);
  if (!ht?.applied) return null;
  const prize = pickedPrize(ht, seat);
  if (!prize || prize.kind === "nothing" || prize.kind === "sealed") return null;
  const Icon = prizeIcon(prize);
  const tone = prizeTone(prize);
  return (
    <Icon
      aria-hidden
      className={cn(
        "shrink-0",
        size === "md" ? "size-6" : "size-4",
        tone === "good" && "text-good",
        tone === "bad" && "text-danger",
        tone === "accent" && "text-accent",
        tone === "muted" && "text-muted",
      )}
      strokeWidth={1.75}
    />
  );
}
