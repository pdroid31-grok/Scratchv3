"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { avatarById, AVATARS } from "@/lib/game/avatars";
import {
  clearCommishClaim,
  COMMISH_PASSWORD_NAME,
  heisenbergPasswordStatus,
  isCommishSettingsUser,
  listCommishBooks,
  remapCommishBook,
  setHeisenbergPassword,
  type CommishBook,
  type CommishPasswordStatus,
} from "@/lib/game/commish";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CommishSettingsPage() {
  const { user, isPending } = useCurrentUserState();
  const allowed = isCommishSettingsUser(user?.id);
  const [books, setBooks] = useState<CommishBook[] | null>(null);
  const [emptyId, setEmptyId] = useState("");
  const [bookId, setBookId] = useState("");
  const [clearName, setClearName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState<CommishPasswordStatus | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [tab, setTab] = useState<"tools" | "avatars">("tools");

  async function reload() {
    const next = await listCommishBooks({ data: {} });
    setBooks(next.books);
  }

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void listCommishBooks({ data: {} })
      .then((next) => {
        if (live) setBooks(next.books);
      })
      .catch(() => {
        if (live) setBooks([]);
      });
    void heisenbergPasswordStatus({ data: {} })
      .then((next) => {
        if (live) setPwStatus(next);
      })
      .catch(() => {
        if (live) setPwStatus(null);
      });
    return () => {
      live = false;
    };
  }, [allowed]);

  if (isPending) return <div className="mt-6 h-48 animate-pulse rounded-xl bg-surface/90" />;
  if (!allowed) {
    return (
      <section className="mt-6 rounded-xl bg-surface/90 p-5 shadow-[var(--shadow-border)]">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-fg">No access</h1>
        <p className="mt-2 text-sm text-muted">Settings is locked.</p>
        <Link to="/" search={{ tab: "profile" }} className="mt-4 inline-flex h-11 items-center text-sm text-muted hover:text-fg">
          Back to Profile
        </Link>
      </section>
    );
  }

  const empties = (books ?? []).filter((row) => row.empty);
  const named = (books ?? []).filter((row) => !row.empty);

  return (
    <div className="mt-6 grid gap-4">
      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Commish</p>
        <h1 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Settings</h1>
        <Link to="/" search={{ tab: "profile" }} className="mt-2 inline-flex text-sm text-muted hover:text-fg">
          Back to Profile
        </Link>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="lg"
            variant={tab === "tools" ? "default" : "secondary"}
            className="font-display uppercase tracking-wider"
            onClick={() => setTab("tools")}
          >
            Settings
          </Button>
          <Button
            type="button"
            size="lg"
            variant={tab === "avatars" ? "default" : "secondary"}
            className="font-display uppercase tracking-wider"
            onClick={() => setTab("avatars")}
          >
            Avatars
          </Button>
        </div>
      </section>

      {tab === "avatars" ? (
        <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">Avatars</h2>
          <p className="mt-1 text-sm text-muted">Preview only. {AVATARS.length} looks.</p>
          <ul className="mt-3 grid max-h-[min(72vh,44rem)] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
            {AVATARS.map((avatar) => (
              <li key={avatar.id} className="min-w-0">
                <img
                  src={avatar.src}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover shadow-[var(--shadow-border)]"
                />
                <p className="mt-1 truncate text-center font-display text-xs font-semibold uppercase tracking-wide text-fg">
                  {avatar.name}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>

      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">Books</h2>
        {books === null ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {books.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-2.5">
                <img src={avatarById(row.avatarId).src} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-fg">
                    {row.name} · ${row.coins} · {avatarById(row.avatarId).name}
                  </p>
                  <p className="break-all text-[11px] tabular-nums text-muted">{row.id}</p>
                  {row.claimedBy ? (
                    <p className="mt-0.5 break-all text-[11px] text-subtle">claimed_by {row.claimedBy}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">Remap</h2>
        <p className="mt-1 text-sm text-muted">Empty session → existing book.</p>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-xs uppercase tracking-wider text-subtle">
            Empty session
            <select
              className="h-11 rounded-md bg-bg px-3 text-sm text-fg"
              value={emptyId}
              onChange={(e) => setEmptyId(e.target.value)}
            >
              <option value="">Select…</option>
              {empties.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.id.slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs uppercase tracking-wider text-subtle">
            Existing book
            <select
              className="h-11 rounded-md bg-bg px-3 text-sm text-fg"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
            >
              <option value="">Select…</option>
              {named.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · ${row.coins} · {row.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="lg"
            className="font-display uppercase tracking-wider"
            disabled={busy || !emptyId || !bookId}
            onClick={() => {
              if (!window.confirm("Remap this empty session onto that book?")) return;
              setBusy(true);
              setNote(null);
              void remapCommishBook({ data: { emptyId, bookId } })
                .then((result) => {
                  setNote(result.ok ? "Remapped." : result.reason);
                  if (result.ok) {
                    setEmptyId("");
                    setBookId("");
                    return reload();
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            Remap
          </Button>
        </div>
      </section>

      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">Clear claim</h2>
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!clearName.trim()) return;
            if (!window.confirm(`Clear claimed_by for ${clearName.trim()}?`)) return;
            setBusy(true);
            setNote(null);
            void clearCommishClaim({ data: { name: clearName, confirm: true } })
              .then((result) => {
                setNote(result.ok ? "Claim cleared." : result.reason);
                if (result.ok) {
                  setClearName("");
                  return reload();
                }
              })
              .finally(() => setBusy(false));
          }}
        >
          <Input
            value={clearName}
            onChange={(e) => setClearName(e.target.value)}
            maxLength={16}
            placeholder="Name"
            aria-label="Name to clear"
          />
          <Button type="submit" size="lg" className="font-display uppercase tracking-wider" disabled={busy || !clearName.trim()}>
            Clear claimed_by
          </Button>
        </form>
      </section>

      <section className="rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-fg">{COMMISH_PASSWORD_NAME} password</h2>
        {pwStatus === null ? (
          <p className="mt-3 text-sm text-muted">Checking account…</p>
        ) : pwStatus.kind === "missing" ? (
          <p className="mt-3 text-sm text-muted">No {COMMISH_PASSWORD_NAME} row. Aborted.</p>
        ) : pwStatus.kind === "ambiguous" ? (
          <p className="mt-3 text-sm text-muted">More than one {COMMISH_PASSWORD_NAME} row. Aborted.</p>
        ) : pwStatus.kind === "google" ? (
          <p className="mt-3 text-sm text-muted">Google account — cannot set app password</p>
        ) : (
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pw || pw !== pw2) {
                setNote(pw !== pw2 ? "mismatch" : "length");
                return;
              }
              setBusy(true);
              setNote(null);
              void setHeisenbergPassword({ data: { password: pw, confirm: pw2, userId: pwStatus.userId } })
                .then((result) => {
                  setNote(result.ok ? "Password set." : result.reason);
                  if (result.ok) {
                    setPw("");
                    setPw2("");
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={8}
              maxLength={128}
              placeholder="New password"
              aria-label={`${COMMISH_PASSWORD_NAME} new password`}
            />
            <Input
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={8}
              maxLength={128}
              placeholder="Confirm password"
              aria-label={`${COMMISH_PASSWORD_NAME} confirm password`}
            />
            <Button type="submit" size="lg" className="font-display uppercase tracking-wider" disabled={busy || !pw || !pw2}>
              Set password
            </Button>
          </form>
        )}
      </section>
        </>
      )}
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
