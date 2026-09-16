"use client";

import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

export function WatchBar() {
  const reset = useGame((s) => s.reset);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] p-4">
      <Button
        type="button"
        size="lg"
        className="pointer-events-auto bg-fg/30 font-display uppercase tracking-wider text-fg hover:bg-fg/45"
        onClick={reset}
      >
        <EyeOff className="size-4" />
        Stop viewing
      </Button>
    </div>
  );
}
