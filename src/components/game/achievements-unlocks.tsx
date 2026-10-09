"use client";

import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACHIEVEMENT_UNLOCKS, avatarById, type AvatarId } from "@/lib/game/avatars";
import { getFeatProgress } from "@/lib/game/feat-progress-api";
import { getShowcase, listAchievementOwners } from "@/lib/game/stats";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

/** Sheet order only. Unnamed rows stay after this, in their current order. Joker is not a row. */
const SHEET_ORDER = [
  "crypepe",
  "starpepe",
  "vegas",
  "threeleafclover",
  "boxlunch",
  "banana",
  "crossword",
  "focused",
  "lockedin",
  "silvermedal",
  "rainyday",
  "poop",
  "trending",
  "canceled",
  "easydollar",
  "consistent",
  "hero",
  "robbed",
  "earlybird",
  "lost",
  "nightowl",
  "comebackkid",
  "freefall",
  "musicalchairs",
  "back2back",
  "lumpedup",
  "negative",
  "penny",
  "bluestreak",
  "coldstreak",
  "icecoldstreak",
  "club200",
  "bullseye",
  "doubledonut",
  "tripledonut",
  "quaddonut",
  "thrifty",
  "threeheaded",
  "sniper",
  "heavyhitter",
  "hospital",
  "flash",
  "ironboot",
  "doubletrouble",
  "overhead",
  "mirror",
  "twin",
  "peeping",
  "spotlight",
  "news",
  "boxaddict",
  "thanos",
  "oneone",
  "tinyhunter",
  "hunter",
  "bighunter",
  "advancedhunter",
  "megahunter",
  "alienhunter",
  "gianthunter",
  "titanhunter",
  "ultrahunter",
] as const satisfies readonly AvatarId[];

const PROGRESS_IDS = new Set<string>([
  "crossword",
  "focused",
  "lockedin",
  "rainyday",
  "trending",
  "canceled",
  "easydollar",
  "lumpedup",
  "coldstreak",
  "icecoldstreak",
  "comebackkid",
  "freefall",
  "lost",
  "poop",
  "earlybird",
  "nightowl",
  "silvermedal",
  "thanos",
  "boxaddict",
  "threeleafclover",
  "musicalchairs",
  "consistent",
]);

function sheetRows() {
  const byId = new Map(ACHIEVEMENT_UNLOCKS.map((row) => [row.id, row]));
  const named = new Set<string>(SHEET_ORDER);
  const ordered = SHEET_ORDER.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const rest = ACHIEVEMENT_UNLOCKS.filter((row) => !named.has(row.id) && row.id !== "joker");
  return [...ordered, ...rest];
}

export function AchievementsButton({ className, compact }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button
          type="button"
          className={cn(
            "flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg bg-bg px-2.5 text-fg shadow-[var(--shadow-border)] hover:bg-surface-2",
            className,
          )}
          onClick={() => setOpen(true)}
        >
          <Trophy className="size-4 text-turf" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-wider">Feats</span>
        </button>
      ) : (
        <Button
          type="button"
          size="lg"
          className={cn("w-full bg-fg font-display uppercase tracking-wider text-bg hover:bg-fg/90", className)}
          onClick={() => setOpen(true)}
        >
          <Trophy className="size-4" />
          Achievements
        </Button>
      )}
      {open ? <AchievementsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function AchievementsSheet({ onClose }: { onClose: () => void }) {
  const book = useProfile((s) => s.book);
  const load = useProfile((s) => s.load);
  const { user } = useCurrentUserState();
  const owned = book?.owned ?? ["poor"];
  const achievementIds = new Set<string>(ACHIEVEMENT_UNLOCKS.map((row) => row.id));
  const ownedCount = user
    ? (book?.owned ?? []).filter((id) => achievementIds.has(id)).length
    : 0;
  const [progress, setProgress] = useState<Record<string, string> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [ownersId, setOwnersId] = useState<string | null>(null);
  const [ownerFaces, setOwnerFaces] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let live = true;
    void getShowcase()
      .then((next) => {
        if (live) setRevealed(next.revealed);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void getFeatProgress()
      .then((lines) => {
        if (live) setProgress(lines);
      })
      .catch(() => {
        if (live) setProgress(null);
      });
    return () => {
      live = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!ownersId) {
      setOwnerFaces(null);
      return;
    }
    let live = true;
    setOwnerFaces(null);
    void listAchievementOwners({ data: { id: ownersId } })
      .then((rows) => {
        if (live) setOwnerFaces(rows.map((row) => row.src));
      })
      .catch(() => {
        if (live) setOwnerFaces([]);
      });
    return () => {
      live = false;
    };
  }, [ownersId]);

  useEffect(() => {
    if (!picked && !ownersId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (ownersId) setOwnersId(null);
      else setPicked(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, ownersId]);

  const pickedRow = picked ? sheetRows().find((row) => row.id === picked) : null;

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Achievements"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Store</p>
            <h2 className="mt-1 flex flex-nowrap items-baseline gap-2 whitespace-nowrap font-display text-2xl font-semibold uppercase tracking-wide text-fg">
              Achievements
              <span className="tabular-nums">
                {ownedCount}/{ACHIEVEMENT_UNLOCKS.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted">All obtained Achievements award +50 scratch points.</p>
          </div>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
        <ul className="grid gap-2 overflow-y-auto p-4">
          {sheetRows().map((row) => {
            const avatar = avatarById(row.id);
            const unlocked = owned.includes(row.id);
            const hidden = row.id === "oneone" && !revealed && !unlocked;
            const label = hidden ? "???" : avatar.name;
            const how = hidden ? "?????" : row.how;
            const tappable = Boolean(user) && !unlocked && !hidden && PROGRESS_IDS.has(row.id);
            return (
              <li key={row.id} className="relative">
                {tappable ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg bg-bg px-3 py-2.5 pr-12 text-left shadow-[var(--shadow-border)]"
                    aria-label={`${label} progress`}
                    onClick={() => setPicked(row.id)}
                  >
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-black">
                      <span className="flex size-full items-center justify-center font-display text-2xl font-semibold text-white">
                        ?
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{how}</span>
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2.5 pr-12 shadow-[var(--shadow-border)]">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-black">
                      {unlocked ? (
                        <img src={avatar.src} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center font-display text-2xl font-semibold text-white">
                          ?
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                        {label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{how}</p>
                      {unlocked ? (
                        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-turf">Owned</p>
                      ) : null}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="absolute right-2 top-2 size-7 overflow-hidden rounded-full bg-black shadow-[var(--shadow-border)]"
                  aria-label="Owns this achievement"
                  onClick={() => setOwnersId(row.id)}
                >
                  <img src="/owners-pepe.jpg" alt="" className="size-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
    {pickedRow ? (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label={avatarById(pickedRow.id).name}
        onClick={() => setPicked(null)}
      >
        <section
          className="relative w-full max-w-lg rounded-xl bg-surface px-4 py-5 shadow-[var(--shadow-border)] sm:px-5"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={() => setPicked(null)}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-3 pr-12">
            <span className="relative size-16 shrink-0 overflow-hidden rounded-md bg-black">
              <span className="flex size-full items-center justify-center font-display text-2xl font-semibold text-white">
                ?
              </span>
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-semibold uppercase tracking-wide text-fg">
                {avatarById(pickedRow.id).name}
              </h3>
              <p className="mt-1 text-sm text-muted">{pickedRow.how}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-fg">{progress?.[pickedRow.id] ?? "…"}</p>
        </section>
      </div>
    ) : null}
    {ownersId ? (
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-bg/80 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Owns this achievement"
        onClick={() => setOwnersId(null)}
      >
        <section
          className="relative w-full max-w-lg rounded-xl bg-surface px-4 py-5 shadow-[var(--shadow-border)] sm:px-5"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-bg text-fg shadow-[var(--shadow-border)]"
            aria-label="Close"
            onClick={() => setOwnersId(null)}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
          <h3 className="pr-12 font-display text-lg font-semibold uppercase tracking-wide text-fg">
            Owns this achievement
          </h3>
          {ownerFaces && ownerFaces.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {ownerFaces.map((src, index) => (
                <img key={`${src}-${index}`} src={src} alt="" className="size-12 rounded-full object-cover" />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    ) : null}
    </>
  );
}
