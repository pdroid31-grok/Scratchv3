import { teamById } from "@/lib/game/teams";
import type { TeamId } from "@/lib/game/types";

export function TeamMarks({
  player,
}: {
  player: { team: TeamId; teams?: TeamId[] };
  size?: number;
}) {
  const team = teamById(player.team);
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      <span className="size-2.5 rounded-full" style={{ backgroundColor: team.primary }} />
      <span className="size-2.5 rounded-full" style={{ backgroundColor: team.secondary }} />
    </span>
  );
}
