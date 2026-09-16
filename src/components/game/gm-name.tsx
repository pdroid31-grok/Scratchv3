"use client";

import { Link } from "@tanstack/react-router";
import { avatarById } from "@/lib/game/avatars";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function GmName({
  seat,
  you = false,
  size = "sm",
  flow = false,
  link = true,
  className,
  nameClassName,
}: {
  seat: Seat;
  you?: boolean;
  size?: "sm" | "md" | "lg";
  /** Sit in a sentence so the name reads with the words around it. */
  flow?: boolean;
  link?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const names = useGame((s) => s.names);
  const avatars = useGame((s) => s.avatars);
  const userIds = useGame((s) => s.userIds);
  const name = names[seat] || "GM";
  const src = avatarById(avatars?.[seat] ?? "poor").src;
  const userId = userIds?.[seat] ?? null;
  const face = size === "lg" ? "size-11" : size === "md" ? "size-9" : "size-7";

  const inner = flow ? (
    <span className={cn("whitespace-nowrap", className)}>
      <img
        src={src}
        alt=""
        className="mr-1 inline-block size-[1.15em] translate-y-[-0.12em] rounded-sm object-cover align-baseline shadow-[var(--shadow-border)]"
      />
      <span className={cn("font-medium text-fg", nameClassName)}>{name}</span>
      {you ? <span className="ml-1 text-xs font-medium tracking-wide text-subtle">You</span> : null}
    </span>
  ) : (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <img
        src={src}
        alt=""
        className={cn("shrink-0 rounded-md object-cover shadow-[var(--shadow-border)]", face)}
      />
      <span className={cn("truncate", nameClassName)}>
        {name}
        {you ? <span className="ml-1 text-xs font-medium tracking-wide text-subtle">You</span> : null}
      </span>
    </span>
  );

  if (!link || !userId) return inner;
  return (
    <Link to="/player/$id" params={{ id: userId }} className="min-w-0 hover:underline">
      {inner}
    </Link>
  );
}
