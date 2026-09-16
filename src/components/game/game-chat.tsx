"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { avatarById } from "@/lib/game/avatars";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

export function GameChat() {
  const mode = useGame((s) => s.mode);
  const phase = useGame((s) => s.phase);
  const chat = useGame((s) => s.chat) ?? [];
  const names = useGame((s) => s.names);
  const avatars = useGame((s) => s.avatars);
  const mySeat = useGame((s) => s.mySeat);
  const sendChat = useGame((s) => s.sendChat);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState(0);
  const [keyboard, setKeyboard] = useState(0);
  const booted = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      setSeen(chat.length);
    }
  }, [chat.length]);

  useEffect(() => {
    if (open) {
      setSeen(chat.length);
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [open, chat.length]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [open]);

  if (mode !== "online" || phase === "setup") return null;

  const unread = open ? 0 : Math.max(0, chat.length - seen);
  const mine = mySeat ?? 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto w-full max-w-lg px-3"
      style={{
        bottom: keyboard,
        paddingBottom: keyboard > 0 ? 8 : "max(0.75rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {open ? (
        <div className="pointer-events-auto overflow-hidden rounded-xl bg-surface/95 shadow-[var(--shadow-border)]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-turf">Live chat</p>
            <button
              type="button"
              aria-label="Close chat"
              className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
          <ol className="grid max-h-44 gap-2 overflow-y-auto px-3 py-2">
            {chat.map((line, i) => {
                const self = line.seat === mine;
                return (
                  <li key={`${line.at}-${i}`} className={cn("flex gap-2", self && "flex-row-reverse")}>
                    <img
                      src={avatarById(avatars?.[line.seat] ?? "poor").src}
                      alt=""
                      className="mt-0.5 size-6 shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]"
                    />
                    <div className={cn("min-w-0 max-w-[80%]", self && "text-right")}>
                      <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-subtle">
                        {names[line.seat] || "GM"}
                      </p>
                      <p className="text-sm leading-snug text-fg">{line.text}</p>
                    </div>
                  </li>
                );
              })
            }
            <div ref={bottom} />
          </ol>
          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendChat(draft);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={120}
              placeholder="Message"
              enterKeyHint="send"
              autoCapitalize="sentences"
              className="h-11 min-h-11 min-w-0 flex-1 rounded-md bg-bg px-3 text-[16px] leading-normal text-fg outline-none ring-1 ring-transparent placeholder:text-subtle focus:ring-accent/40"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim()}
              className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto ml-auto flex h-11 items-center gap-2 rounded-full bg-surface/95 px-3.5 font-display text-xs font-semibold uppercase tracking-wider text-fg shadow-[var(--shadow-border)]"
        >
          <MessageCircle className="size-4 text-accent" />
          Chat
          {unread > 0 ? (
            <span className="rounded-full bg-accent px-1.5 font-display text-[10px] tabular-nums text-accent-fg">
              {unread}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
