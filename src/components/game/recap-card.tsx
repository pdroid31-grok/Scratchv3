import { avatarById } from "@/lib/game/avatars";
import { recapHeadline, recapScoreLabel, type Recap } from "@/lib/game/recap";
import { cn } from "@/lib/utils";

export function RecapCard({ recap }: { recap: Recap }) {
  const rows = Math.max(recap.lines[0].length, recap.lines[1].length);
  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <div className="px-4 py-4 sm:px-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">Darkness</p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-tight text-fg">{recapHeadline(recap)}</h1>
        <p className="mt-1 text-sm text-muted">
          {recap.winner === null ? "Draw" : `${recap.names[recap.winner]} takes the night.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:px-5">
        {([0, 1] as const).map((seat) => {
          const won = recap.winner === seat;
          return (
            <div
              key={seat}
              className={cn("rounded-lg bg-bg px-3 py-3", won && "ring-1 ring-good")}
            >
              <div className="flex items-center gap-2">
                <img
                  src={avatarById(recap.avatars[seat]).src}
                  alt=""
                  className="size-9 rounded-md object-cover shadow-[var(--shadow-border)]"
                />
                <div className="min-w-0">
                  <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
                    {won ? "Winner" : recap.winner === null ? "GM" : "Field"}
                  </p>
                  <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                    {recap.names[seat]}
                  </p>
                </div>
              </div>
              <p className={cn("mt-2 font-display text-3xl font-semibold tabular-nums", won ? "text-good" : recap.winner === null ? "text-fg" : "text-danger")}>
                {recapScoreLabel(recap, seat)}
              </p>
            </div>
          );
        })}
      </div>
      <ol className="border-t border-border">
        {Array.from({ length: rows }, (_, i) => {
          const left = recap.lines[0][i];
          const right = recap.lines[1][i];
          return (
            <li key={i} className="grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 px-4 py-2 sm:px-5">
              <p className="truncate text-sm text-fg">{left?.name ?? "—"}</p>
              <p className="text-center font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
                {left?.slot || right?.slot || ""}
              </p>
              <p className="truncate text-right text-sm text-fg">{right?.name ?? "—"}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
