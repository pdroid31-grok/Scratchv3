"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Settings, Star, X } from "lucide-react";
import { CLOSET_AVATARS, SHIRT_AVATARS, avatarById, isShirtAvatar, isUnlocked, lookSource, ownsAvatar, remainingToUnlock, type AvatarId } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authEnabled, signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookFormats } from "@/components/game/book-slice";
import { AvatarPeek } from "@/components/game/avatar-peek";
import { isBankCommish } from "@/lib/game/stats-shared";
import { isCommishSettingsUser } from "@/lib/game/commish";
import type { CareerBook } from "@/lib/game/stats";
import { cn } from "@/lib/utils";

export function ProfileTab() {
  const { user, isPending } = useCurrentUserState();
  const book = useProfile((s) => s.book);
  const loaded = useProfile((s) => s.loaded);
  const avatarId = useProfile((s) => s.avatarId);
  const displayName = useProfile((s) => s.displayName);
  const pick = useProfile((s) => s.pick);
  const rename = useProfile((s) => s.rename);
  const selected = avatarById(avatarId);
  const wins = book?.wins ?? 0;
  const owned = book?.owned ?? ["poor"];
  const coins = book?.coins ?? 0;
  const dailyStars = book?.dailyStars ?? 0;
  const left = remainingToUnlock(owned);
  const shown = displayName || user?.displayName || "";
  const [draft, setDraft] = useState(shown);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [playerSettings, setPlayerSettings] = useState(false);

  useEffect(() => {
    setDraft(shown);
  }, [shown]);

  if (isPending) {
    return <div className="mt-5 h-64 animate-pulse rounded-xl bg-surface/90" />;
  }

  return (
    <div className="mt-5 grid gap-4">
      {!user ? (
        <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)]">
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Profile</p>
          <p className="mt-1 text-sm text-muted">
            Sign in to keep a book, unlock characters, and pick the one that rides with you.
          </p>
          <Link
            to="/login"
            className="mt-3 inline-flex h-11 min-h-11 items-center rounded-md bg-surface-2 px-4 text-sm font-medium text-fg shadow-[var(--shadow-border)] hover:bg-surface-2/80"
          >
            Sign in
          </Link>
        </section>
      ) : (
        <>
          <section className="relative rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <button
              type="button"
              className="absolute right-4 top-4 inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-muted hover:text-fg sm:right-5 sm:top-5"
              onClick={() => setPlayerSettings(true)}
            >
              Settings
              <Settings className="size-4" aria-hidden />
            </button>
            <div className="flex items-center gap-4 pr-24">
              <AvatarPeek
                src={selected.src}
                alt={selected.name}
                name={selected.name}
                source={lookSource(selected.id)}
                className="size-20 rounded-lg object-cover shadow-[var(--shadow-border)] sm:size-24"
              />
              <div className="min-w-0">
                <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">
                  Profile
                </p>
                <h2 className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="truncate font-display text-2xl font-semibold uppercase tracking-wide text-fg">
                    {shown || "GM"}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2.5 font-display text-2xl font-semibold tabular-nums tracking-wide text-fg">
                    <span>${coins}</span>
                    <span className="inline-flex items-center gap-1 leading-none">
                      <Star className="size-5 text-accent" fill="currentColor" />
                      {dailyStars}
                    </span>
                    {isCommishSettingsUser(user.id) ? (
                      <Link
                        to="/settings"
                        className="font-display text-xs font-semibold uppercase tracking-wider text-muted hover:text-fg"
                      >
                        Settings
                      </Link>
                    ) : null}
                  </span>
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {selected.name}
                  {wins === 1 ? " · 1 win" : ` · ${wins} wins`}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <h2 className="font-display text-2xl font-semibold uppercase tracking-tight text-fg">
              Display Name
            </h2>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const next = draft.trim().slice(0, 16);
                if (!next) return;
                setSaving(true);
                void rename(next).finally(() => setSaving(false));
              }}
            >
              <div className="grid gap-2">
                <Input
                  id="gm-name"
                  name="gm-name"
                  autoComplete="nickname"
                  maxLength={16}
                  placeholder="Your name"
                  aria-label="Display name"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="font-display uppercase tracking-wider"
                disabled={saving || !draft.trim() || draft.trim() === shown}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </form>
          </section>

          <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
            {isBankCommish(shown) ? (
              <PatBookTabs
                loaded={loaded}
                book={book}
                closet={<Closet owned={owned} avatarId={avatarId} user={Boolean(user)} pick={pick} left={left} />}
              />
            ) : (
              <>
                <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Your book</h2>
                {!loaded || !book ? (
                  <p className="mt-3 text-sm text-muted">Loading nights…</p>
                ) : book.games === 0 ? (
                  <p className="mt-3 text-sm text-muted">No nights yet. Finish a match and it lands here.</p>
                ) : (
                  <BookFormats
                    slices={{ total: book.total, auction: book.auction, elimination: book.elimination }}
                    opponents={book.opponentsBy}
                  />
                )}
              </>
            )}
          </section>
        </>
      )}

      {isBankCommish(shown) ? null : (
      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <Closet owned={owned} avatarId={avatarId} user={Boolean(user)} pick={pick} left={left} />
      </section>
      )}
      {user && authEnabled ? (
        <button
          type="button"
          disabled={signingOut}
          className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
          onClick={() => {
            setSigningOut(true);
            void signOut().catch(() => setSigningOut(false));
          }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      ) : null}
      {playerSettings && user ? <PlayerSettings onClose={() => setPlayerSettings(false)} /> : null}
    </div>
  );
}

const NEWS_HIDE_UNLOCKS_KEY = "news-hide-unlocks";

function PlayerSettings({ onClose }: { onClose: () => void }) {
  const [hideUnlocks, setHideUnlocks] = useState(false);

  useEffect(() => {
    try {
      setHideUnlocks(localStorage.getItem(NEWS_HIDE_UNLOCKS_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/90 p-5 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label="Player Settings"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)]"
        aria-label="Back to Profile"
        onClick={onClose}
      >
        <X className="size-5" strokeWidth={2} />
      </button>
      <div
        className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Player Settings</h2>
        <label className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-fg">
          Hide unlocks in News
          <input
            type="checkbox"
            role="switch"
            className="size-4 accent-fg"
            checked={hideUnlocks}
            onChange={(event) => {
              const next = event.target.checked;
              setHideUnlocks(next);
              try {
                localStorage.setItem(NEWS_HIDE_UNLOCKS_KEY, next ? "1" : "0");
              } catch {
                /* private mode */
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

function Closet({
  owned,
  avatarId,
  user,
  pick,
  left,
}: {
  owned: readonly string[];
  avatarId: AvatarId;
  user: boolean;
  pick: (id: AvatarId) => void | Promise<unknown>;
  left: number;
}) {
  const selected = avatarById(avatarId);
  return (
    <>
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">The closet</h2>
      <p className="mt-2 font-display text-xl font-semibold tabular-nums text-fg">
        {left === 0 ? "All unlocked" : `${left} left to unlock`}
      </p>
      <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {CLOSET_AVATARS.filter((avatar) => isUnlocked(avatar.id, owned)).map((avatar) => {
          const shirt = avatar.id === "holy";
          const worn = shirt ? isShirtAvatar(avatarId) : avatar.id === avatarId;
          const shownLook = shirt
            ? worn
              ? selected
              : (SHIRT_AVATARS.find((option) => owned.includes(option.id)) ?? avatar)
            : avatar;
          const active = user && worn;
          return (
            <li key={avatar.id}>
              <div
                className={cn(
                  "flex w-full flex-col overflow-hidden rounded-lg bg-bg text-left shadow-[var(--shadow-border)]",
                  active && "ring-2 ring-accent",
                )}
              >
                <button
                  type="button"
                  disabled={!user}
                  onClick={() => void pick(shirt ? (isShirtAvatar(avatarId) ? avatarId : "holy") : avatar.id)}
                  className={cn(
                    "relative aspect-square w-full overflow-hidden bg-surface-2",
                    user && "hover:opacity-95",
                  )}
                >
                  <img src={shownLook.src} alt="" className="size-full object-cover" />
                </button>
                <span className="px-2 py-2">
                  <span className="block truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                    {shirt ? "Shirt" : avatar.name}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted">
                    {avatar.id === "poor" ? "Starter" : "Owned"}
                  </span>
                  {shirt ? (
                    <span className="mt-2 flex gap-1.5">
                      {SHIRT_AVATARS.filter((option) => ownsAvatar(option.id, owned)).map((option) => {
                        const on = avatarId === option.id;
                        const tone =
                          option.shirt === "red"
                            ? "bg-[#c4122f]"
                            : option.shirt === "blue"
                              ? "bg-[#1d4ed8]"
                              : "bg-white";
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={!user}
                            aria-label={option.name}
                            aria-pressed={on}
                            onClick={() => void pick(option.id)}
                            className={cn(
                              "size-5 rounded-full shadow-[var(--shadow-border)]",
                              tone,
                              on && "ring-2 ring-accent ring-offset-1 ring-offset-bg",
                            )}
                          />
                        );
                      })}
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PatBookTabs({
  loaded,
  book,
  closet,
}: {
  loaded: boolean;
  book: CareerBook | null;
  closet: ReactNode;
}) {
  const [tab, setTab] = useState<"book" | "bank">("book");
  return (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
        {(
          [
            ["book", "Book"],
            ["bank", "Bank"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-11 rounded-md font-display text-xs font-semibold uppercase tracking-wider sm:text-sm",
              tab === id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "bank" ? (
          <BankWatchPanel />
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Your book</h2>
            {!loaded || !book ? (
              <p className="mt-3 text-sm text-muted">Loading nights…</p>
            ) : book.games === 0 ? (
              <p className="mt-3 text-sm text-muted">No nights yet. Finish a match and it lands here.</p>
            ) : (
              <BookFormats
                slices={{ total: book.total, auction: book.auction, elimination: book.elimination }}
                opponents={book.opponentsBy}
              />
            )}
            <div className="mt-6">{closet}</div>
          </>
        )}
      </div>
    </>
  );
}

function BankWatchPanel() {
  const [data, setData] = useState<import("@/lib/game/bank-watch").BankWatch | null | "load">("load");
  useEffect(() => {
    let live = true;
    void import("@/lib/game/bank-watch")
      .then(({ getBankWatch }) => getBankWatch())
      .then((row) => {
        if (live) setData(row);
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, []);
  if (data === "load") return <p className="text-sm text-muted">Loading banks…</p>;
  if (!data) return <p className="text-sm text-muted">Bank watch is locked.</p>;
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Live bank</h2>
        <ul className="mt-3 divide-y divide-border/60">
          {data.banks.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
              <Link
                to="/player/$id"
                params={{ id: row.id }}
                className="min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-fg hover:text-turf"
              >
                {row.name}
              </Link>
              <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-fg">
                ${row.coins}
                <span className="ml-2 text-muted">
                  {row.wins}w
                  {row.stars ? ` · ${row.stars}★` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Recent</h2>
        {data.changes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No bank moves logged yet. Next pay or box will land here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {data.changes.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                    {row.name}
                  </span>
                  <span className="text-xs tabular-nums text-muted">{formatBankWhen(row.at)}</span>
                  {bankReasonLabel(row.reason) ? (
                    <span className="block text-xs text-muted">{bankReasonLabel(row.reason)}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right font-display text-sm font-semibold tabular-nums text-fg">
                  <span className={row.delta >= 0 ? "text-turf" : "text-muted"}>
                    {row.delta >= 0 ? "+" : "−"}${Math.abs(row.delta)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    ${row.before} → ${row.after}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function bankReasonLabel(reason: string | null): string {
  if (reason === "daily_win") return "Daily win";
  if (reason === "daily_score") return "Daily score";
  if (reason === "weekly_win") return "Weekly win";
  if (reason === "weekly_score") return "Weekly over 100";
  if (reason === "scratch") return "Scratch";
  if (reason === "box") return "Mystery Box";
  if (reason === "match") return "Match";
  return "";
}

function formatBankWhen(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(stamp);
}
