"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { avatarById } from "@/lib/game/avatars";
import {
  deleteLeagueChat,
  isCeoBoardUser,
  isStevoChatUser,
  listLeagueChat,
  postLeagueChat,
  unreadLeagueChat,
  type LeagueChatLine,
} from "@/lib/game/league-chat";
import { useProfile } from "@/lib/game/profile-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function formatAt(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DailyLeagueChat() {
  const { user } = useCurrentUserState();
  const load = useProfile((s) => s.load);
  const displayName = useProfile((s) => s.displayName);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  useEffect(() => {
    if (!user || isStevoChatUser(user.id, displayName) || isStevoChatUser(user.id, user.displayName)) return;
    if (open) {
      setUnread(0);
      return;
    }
    let live = true;
    const pull = () => {
      void unreadLeagueChat({ data: {} })
        .then((next) => {
          if (live) setUnread(next.unread);
        })
        .catch(() => {
          if (live) setUnread(0);
        });
    };
    pull();
    const id = window.setInterval(pull, 8_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [user, user?.id, displayName, open]);

  if (!user || isStevoChatUser(user.id, displayName) || isStevoChatUser(user.id, user.displayName)) {
    return null;
  }
  const label = unread > 0 ? `Message Board, ${unread} unread` : "Message Board";
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className="relative inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-2"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="size-5" />
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-accent px-1 text-center font-display text-[10px] font-semibold tabular-nums leading-4 text-accent-fg">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <LeagueChatSheet
          isCeo={isCeoBoardUser(user.id)}
          onClose={() => {
            setUnread(0);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function LeagueChatSheet({ onClose, isCeo }: { onClose: () => void; isCeo: boolean }) {
  const [lines, setLines] = useState<LeagueChatLine[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const pull = () => {
      void listLeagueChat({ data: { seen: true } })
        .then((next) => {
          if (!live) return;
          setLines(next);
          setBlocked(false);
        })
        .catch((err: unknown) => {
          if (!live) return;
          const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
          if (status === 403 || String(err).includes("403") || String((err as Error)?.message ?? "").includes("Forbidden")) {
            setBlocked(true);
            setLines([]);
          }
        });
    };
    pull();
    const id = window.setInterval(pull, 8_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines?.length]);

  async function send() {
    const text = draft.trim();
    if (!text || busy || blocked) return;
    setBusy(true);
    try {
      const next = await postLeagueChat({ data: { text } });
      setLines(next);
      setDraft("");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403 || String(err).includes("Forbidden")) setBlocked(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!isCeo || busy) return;
    if (!window.confirm("Delete this message?")) return;
    setBusy(true);
    try {
      const next = await deleteLeagueChat({ data: { id } });
      setLines(next);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403 || String(err).includes("Forbidden")) setBlocked(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Message Board"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-turf">Daily</p>
            <h2 className="mt-1 font-display text-2xl font-semibold uppercase tracking-wide text-fg">Message Board</h2>
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
        <ol className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 py-3">
          {blocked ? (
            <li className="text-sm text-muted">You can’t use the message board.</li>
          ) : lines === null ? (
            <li className="h-24 animate-pulse rounded-md bg-bg" />
          ) : lines.length === 0 ? (
            <li className="text-sm text-muted">No posts yet.</li>
          ) : (
            lines.map((line) => (
              <li key={line.id} className="flex gap-2">
                <img
                  src={avatarById(line.avatarId).src}
                  alt=""
                  className="mt-0.5 size-8 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate font-display text-xs font-semibold uppercase tracking-wide text-fg">
                      {line.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-subtle">{formatAt(line.at)}</span>
                  </p>
                  <p className="text-sm leading-snug text-fg">{line.text}</p>
                  {isCeo ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] uppercase tracking-wider text-muted hover:text-fg"
                      onClick={() => void remove(line.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
          <div ref={bottom} />
        </ol>
        {blocked ? null : (
          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              placeholder="Message"
              enterKeyHint="send"
              autoCapitalize="sentences"
              className="h-11 min-h-11 min-w-0 flex-1 rounded-md bg-bg px-3 text-[16px] leading-normal text-fg outline-none ring-1 ring-transparent placeholder:text-subtle focus:ring-accent/40"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || !draft.trim()}
              className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
