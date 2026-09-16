import { TeamMarks } from "@/components/game/team-logo";
import { teamById } from "@/lib/game/teams";
import type { Player, Position } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const POS_LABEL: Record<Position, string> = {
  QB: "Quarterback",
  RB: "Running back",
  WR: "Wide receiver",
  TE: "Tight end",
};

export function positionLabel(slot: Position): string {
  return POS_LABEL[slot];
}

export function PlayerCard({
  player,
  slot,
  className,
  selected = false,
  passed = false,
  onPick,
  pickDisabled = false,
  livePick = false,
}: {
  player: Player;
  slot: Position;
  className?: string;
  selected?: boolean;
  passed?: boolean;
  onPick?: () => void;
  pickDisabled?: boolean;
  livePick?: boolean;
}) {
  const team = teamById(player.team);
  const choosing = livePick || Boolean(onPick);
  const footer = passed
    ? "Passed"
    : selected
      ? choosing
        ? "Picked"
        : "On the block"
      : choosing
        ? onPick
          ? "Tap to pick"
          : "—"
        : "On the block";

  const body = (
    <>
      <div className="h-1.5 w-full" style={{ backgroundColor: team.primary }} />
      <div className="relative px-3 py-4 sm:px-4 sm:py-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-muted">
          {POS_LABEL[slot]}
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold uppercase leading-tight tracking-tight text-fg sm:mt-3 sm:text-2xl">
          {player.name}
        </h2>
        <p className="mt-2 truncate text-xs text-muted sm:text-sm">Career · {player.years}</p>
        <div className="mt-4 flex items-center gap-2">
          <TeamMarks player={player} size={22} />
          <span
            className={cn(
              "text-xs uppercase tracking-[0.18em]",
              selected ? "text-accent" : "text-subtle",
            )}
          >
            {footer}
          </span>
        </div>
      </div>
    </>
  );

  const box = cn(
    "relative w-full overflow-hidden rounded-xl bg-surface/90 text-left shadow-[var(--shadow-border)]",
    onPick &&
      "transition-[box-shadow,transform,opacity] duration-[var(--motion-quick)] ease-[var(--ease-out)] hover:shadow-[var(--shadow-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50",
    selected && "ring-1 ring-accent",
    passed && "opacity-50",
    className,
  );

  if (onPick) {
    return (
      <button type="button" disabled={pickDisabled} onClick={onPick} aria-pressed={selected} className={box}>
        {body}
      </button>
    );
  }

  return <article className={box}>{body}</article>;
}
