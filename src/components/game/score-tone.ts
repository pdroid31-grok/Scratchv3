import type { WeekScoreTone } from "@/lib/game/elim-data";

export const weekToneClass: Record<WeekScoreTone, string> = {
  bye: "text-muted",
  bad: "text-danger",
  ok: "text-muted",
  good: "text-good",
  best: "text-best",
};

export const weekToneCell: Record<WeekScoreTone, string> = {
  bye: "bg-bg",
  bad: "bg-danger/10",
  ok: "bg-bg",
  good: "bg-good/10",
  best: "bg-best/10",
};
