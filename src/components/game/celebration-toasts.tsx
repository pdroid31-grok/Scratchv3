"use client";

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { ACHIEVEMENT_UNLOCKS, avatarById } from "@/lib/game/avatars";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatToastDay, listToasts, seenToast, type ToastItem, type ToastPick } from "@/lib/game/toasts-api";
import { Button } from "@/components/ui/button";

function LineupRows({ picks }: { picks: ToastPick[] }) {
  if (!picks.length) return <p className="text-sm text-muted">No lineup saved.</p>;
  return (
    <ol className="grid gap-1.5">
      {picks.map((pick) => (
        <li
          key={pick.slot}
          className="flex items-center gap-3 rounded-md bg-bg px-3 py-2 shadow-[var(--shadow-border)]"
        >
          <span className="w-10 shrink-0 font-display text-xs font-semibold uppercase tracking-wide text-subtle">
            {pick.slot}
          </span>
          <span className="w-8 shrink-0 text-xs tabular-nums text-muted">${pick.cost}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{pick.name}</span>
          <span className="w-12 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-fg">
            {pick.score.toFixed(1)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PayoutMark({ coins, stars }: { coins: number; stars: number }) {
  return (
    <p className="flex shrink-0 items-center gap-2 font-display text-xl font-semibold tabular-nums leading-none tracking-wide text-fg sm:text-2xl">
      <span>+${coins}</span>
      <span className="inline-flex items-center gap-1">
        +{stars}
        <Star className="size-[1.15em] shrink-0 text-fg" fill="currentColor" />
      </span>
    </p>
  );
}

function WinFace({
  name,
  avatarId,
  score,
  coins,
  stars,
}: {
  name?: string;
  avatarId?: string;
  score: number;
  coins: number;
  stars: number;
}) {
  const look = avatarById(avatarId ?? "poor");
  return (
    <div className="mt-3 flex items-center gap-3">
      <img src={look.src} alt="" className="size-12 rounded-lg object-cover shadow-[var(--shadow-border)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">{name}</p>
        <p className="text-sm tabular-nums text-muted">{score.toFixed(1)}</p>
      </div>
      <PayoutMark coins={coins} stars={stars} />
    </div>
  );
}

function featHow(id?: string): string {
  return ACHIEVEMENT_UNLOCKS.find((row) => row.id === id)?.how ?? "";
}

function ToastBody({ item }: { item: ToastItem }) {
  const p = item.payload;
  if (item.kind === "scratch_ready") {
    return (
      <>
        <p className="pr-12 font-display text-xl font-semibold uppercase tracking-wide text-fg">
          Your scratch ticket is ready
        </p>
        <img
          src="/scratch-ticket.jpg?v=2"
          alt=""
          className="mt-4 w-full rounded-lg object-cover shadow-[var(--shadow-border)]"
        />
      </>
    );
  }
  if (item.kind === "daily_win") {
    return (
      <>
        <p className="font-display text-xl font-semibold uppercase tracking-wide text-fg">
          Congrats on winning the Daily Match for {p.day ? formatToastDay(p.day) : "today"}.
        </p>
        <WinFace
          name={p.name}
          avatarId={p.avatarId}
          score={p.score ?? 0}
          coins={p.coins ?? 1}
          stars={p.stars ?? 1}
        />
        <div className="mt-3">
          <LineupRows picks={p.picks ?? []} />
        </div>
      </>
    );
  }
  if (item.kind === "weekly_win") {
    return (
      <>
        <p className="font-display text-xl font-semibold uppercase tracking-wide text-fg">
          Congrats on winning the Weekly Match for Week {p.week ?? ""}.
        </p>
        <WinFace
          name={p.name}
          avatarId={p.avatarId}
          score={p.score ?? 0}
          coins={p.coins ?? 2}
          stars={p.stars ?? 2}
        />
        <div className="mt-3">
          <LineupRows picks={p.picks ?? []} />
        </div>
      </>
    );
  }
  const prize = avatarById(p.prizeId ?? "poor");
  const how = featHow(p.prizeId);
  return (
    <>
      <p className="font-display text-xl font-semibold uppercase tracking-wide text-fg">
        Congrats you unlocked &ldquo;{p.prizeLabel ?? prize.name}&rdquo;.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2">
        <img src={prize.src} alt="" className="size-28 rounded-xl object-cover shadow-[var(--shadow-border)]" />
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-fg">{prize.name}</p>
        {item.kind === "star_unlock" ? (
          <p className="flex items-center justify-center gap-1 text-sm text-muted">
            <span>From obtaining {p.starNeed ?? 0}</span>
            <Star className="size-[1.15em] shrink-0 text-fg" fill="currentColor" />
          </p>
        ) : (
          <p className="text-center text-sm text-muted">
            From Achievement{how ? `: ${how}` : ""}
          </p>
        )}
      </div>
    </>
  );
}

export function CelebrationToasts() {
  const { user, isPending } = useCurrentUserState();
  const [queue, setQueue] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (isPending || !user) {
      setQueue([]);
      return;
    }
    let live = true;
    async function pull() {
      try {
        const rows = await listToasts();
        if (live) setQueue(rows);
      } catch {
        if (live) setQueue([]);
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, isPending]);

  const item = queue[0];

  function dismiss() {
    if (!item) return;
    const key = item.sourceKey;
    setQueue((rows) => rows.filter((row) => row.sourceKey !== key));
    void seenToast({ data: { sourceKey: key } }).catch(() => undefined);
  }

  useEffect(() => {
    if (!item) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && item.kind !== "scratch_ready") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item]);

  if (!user || !item) return null;

  function goScratch() {
    try {
      sessionStorage.setItem("darkness-open-store", "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("darkness-open-store"));
    dismiss();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={item.kind === "scratch_ready" ? "Your scratch ticket is ready" : "Celebration"}
    >
      <section className="relative max-h-[min(88vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-surface px-4 py-5 shadow-[var(--shadow-border)] sm:px-5">
        <button
          type="button"
          className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
          aria-label="Close"
          onClick={dismiss}
        >
          <X className="size-5" strokeWidth={2} />
        </button>
        <div className={item.kind === "scratch_ready" ? "" : "pr-12"}>
          <ToastBody item={item} />
        </div>
        {item.kind === "scratch_ready" ? (
          <Button
            type="button"
            size="lg"
            className="mt-4 w-full font-display uppercase tracking-wider"
            onClick={goScratch}
          >
            Go scratch ticket
          </Button>
        ) : null}
      </section>
    </div>
  );
}
