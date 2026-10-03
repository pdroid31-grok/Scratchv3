"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gavel, Settings, Star, X } from "lucide-react";
import { ACHIEVEMENT_IDS, ACHIEVEMENT_UNLOCKS, CLOSET_AVATARS, SHIRT_AVATARS, STAR_IDS, avatarById, isShirtAvatar, isUnlocked, lookSource, ownsAvatar, remainingToUnlock, type AvatarId } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authEnabled, signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookFormats, bookHasScores } from "@/components/game/book-slice";
import { AchievementsSheet } from "@/components/game/achievements-unlocks";
import { DailyUnlocksSheet } from "@/components/game/daily-unlocks";
import { AvatarPeek } from "@/components/game/avatar-peek";
import { closetGridClass, useClosetCols, writeClosetCols } from "@/components/game/closet-cols";
import { isCommishSettingsUser } from "@/lib/game/commish";
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
  const [signingOut, setSigningOut] = useState(false);
  const [playerSettings, setPlayerSettings] = useState(false);
  const [starsOpen, setStarsOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const featOwned = new Set(owned.filter((id) => ACHIEVEMENT_IDS.has(id))).size;

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
            <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5 sm:right-5 sm:top-5">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-muted hover:text-fg"
                onClick={() => setPlayerSettings(true)}
              >
                Settings
                <Settings className="size-4" aria-hidden />
              </button>
              {isCommishSettingsUser(user.id) ? (
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-muted hover:text-fg"
                >
                  Dev settings
                  <Gavel className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
            <div className={cn("flex items-center gap-4", isCommishSettingsUser(user.id) ? "pr-36" : "pr-24")}>
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
                  <span className="inline-flex shrink-0 items-center gap-2.5 font-display text-2xl font-semibold tabular-nums tracking-wide">
                    <span className="text-[#b8f5c8]">${coins}</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 leading-none"
                      aria-label="Daily Unlocks"
                      onClick={() => setStarsOpen(true)}
                    >
                      <Star className="size-5 text-accent" fill="currentColor" />
                      <span className="text-[#f8e7a0]">{dailyStars}</span>
                    </button>
                    <button
                      type="button"
                      className="text-[#d4e8ff]"
                      aria-label="Achievements"
                      onClick={() => setAchievementsOpen(true)}
                    >
                      {featOwned}/{ACHIEVEMENT_UNLOCKS.length}
                    </button>
                  </span>
                </h2>
                <p className="mt-1 text-sm text-muted">
                  <span className={lookNameTone(selected.id) || undefined}>{selected.name}</span>
                  {wins === 1 ? " · 1 win" : ` · ${wins} wins`}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Your book</h2>
            {!loaded || !book ? (
              <p className="mt-3 text-sm text-muted">Loading nights…</p>
            ) : !bookHasScores(book) ? (
              <p className="mt-3 text-sm text-muted">No nights yet. Finish a match and it lands here.</p>
            ) : (
              <BookFormats
                slices={{ total: book.total, auction: book.auction, elimination: book.elimination }}
                opponents={book.opponentsBy}
                owned={owned}
              />
            )}
          </section>
        </>
      )}

      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <Closet owned={owned} avatarId={avatarId} user={Boolean(user)} pick={pick} left={left} />
      </section>
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
      {playerSettings && user ? (
        <PlayerSettings name={shown} rename={rename} onClose={() => setPlayerSettings(false)} />
      ) : null}
      {starsOpen ? <DailyUnlocksSheet onClose={() => setStarsOpen(false)} /> : null}
      {achievementsOpen ? <AchievementsSheet onClose={() => setAchievementsOpen(false)} /> : null}
    </div>
  );
}

const NEWS_HIDE_UNLOCKS_KEY = "news-hide-unlocks";

function PlayerSettings({
  name,
  rename,
  onClose,
}: {
  name: string;
  rename: (next: string) => void | Promise<unknown>;
  onClose: () => void;
}) {
  const [hideUnlocks, setHideUnlocks] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const closetCols = useClosetCols();

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/90 p-5 pt-16"
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
        className="grid w-full max-w-sm gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">Player Settings</h2>
        <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Profile</h3>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const next = draft.trim().slice(0, 16);
              if (!next) return;
              setSaving(true);
              void Promise.resolve(rename(next)).finally(() => setSaving(false));
            }}
          >
            <Input
              id="gm-name"
              name="gm-name"
              autoComplete="nickname"
              maxLength={16}
              placeholder="Your name"
              aria-label="Display name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <p className="text-xs text-muted">16 characters.</p>
            <Button
              type="submit"
              size="lg"
              className="font-display uppercase tracking-wider"
              disabled={saving || !draft.trim() || draft.trim() === name}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </section>
        <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-fg">News</h3>
          <label className="mt-4 flex items-center justify-between gap-4 text-sm font-medium text-fg">
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
          <p className="mt-1 text-xs text-muted">hides feat / star unlock rows on this device.</p>
        </section>
        <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-fg">Closet</h3>
          <p className="mt-4 text-sm font-medium text-fg">Closet columns</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {([3, 4, 5] as const).map((cols) => (
              <button
                key={cols}
                type="button"
                aria-pressed={closetCols === cols}
                onClick={() => writeClosetCols(cols)}
                className={cn(
                  "h-11 rounded-md font-display text-sm font-semibold uppercase tracking-wider",
                  closetCols === cols ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {cols}x
              </button>
            ))}
          </div>
        </section>
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
  const cols = useClosetCols();
  const selected = avatarById(avatarId);
  return (
    <>
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">The closet</h2>
      <p className="mt-2 font-display text-xl font-semibold tabular-nums text-fg">
        {left === 0 ? "All unlocked" : `${left} left to unlock`}
      </p>
      <ul className={cn("mt-4", closetGridClass(cols))}>
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
                <AvatarPeek
                  src={shownLook.src}
                  alt={shownLook.name}
                  name={shownLook.name}
                  source={lookSource(shownLook.id)}
                  className="size-full object-cover"
                  buttonClassName="relative block aspect-square w-full overflow-hidden bg-surface-2"
                  equip={user}
                  equipped={user && shownLook.id === avatarId}
                  onEquip={user ? () => void pick(shownLook.id) : undefined}
                />
                <span className="px-2 py-2">
                  <span className={`block truncate font-display text-sm font-semibold uppercase tracking-wide ${lookNameTone(avatar.id) || "text-fg"}`}>
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

function lookNameTone(id: string): string {
  if (STAR_IDS.has(id)) return "text-[#f8e7a0]";
  if (ACHIEVEMENT_IDS.has(id)) return "text-[#3b82f6]";
  return "";
}
