"use client";

import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { avatarById } from "@/lib/game/avatars";
import { useProfile } from "@/lib/game/profile-store";
import { cn } from "@/lib/utils";

export function AuthBar({
  className,
  onProfile,
}: {
  className?: string;
  onProfile?: () => void;
}) {
  const { user, isPending } = useCurrentUserState();
  const avatarId = useProfile((s) => s.avatarId);
  const displayName = useProfile((s) => s.displayName);
  const pepe = avatarById(avatarId);

  if (isPending) {
    return <div className={cn("h-11 w-28 animate-pulse rounded-md bg-surface-2", className)} />;
  }

  if (!user) {
    return (
      <div className={cn("flex items-center justify-end gap-2", className)}>
        {onProfile ? (
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg hover:bg-surface-2"
            onClick={onProfile}
          >
            <User className="size-4" strokeWidth={2} />
            Profile
          </button>
        ) : null}
        <Link
          to="/login"
          className="inline-flex h-11 min-h-11 items-center rounded-md bg-surface-2 px-4 text-sm font-medium text-fg shadow-[var(--shadow-border)] hover:bg-surface-2/80"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const label = displayName || user.displayName || user.primaryEmail || "GM";
  const face = (
    <>
      <img
        src={pepe.src}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full object-cover"
        style={{ width: 32, height: 32, borderRadius: 9999, objectFit: "cover" }}
      />
      <span className="max-w-28 truncate text-sm font-medium text-fg">{label}</span>
    </>
  );

  return (
    <div className={cn("flex items-center justify-end gap-1.5", className)}>
      {onProfile ? (
        <>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg hover:bg-surface-2"
            onClick={onProfile}
          >
            <User className="size-4" strokeWidth={2} />
            Profile
          </button>
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
            onClick={onProfile}
            aria-label={label}
          >
            {face}
          </button>
        </>
      ) : (
        <span className="flex min-w-0 items-center gap-2">{face}</span>
      )}
    </div>
  );
}

export function useGmPrefill(): string {
  const { user, isPending } = useCurrentUserState();
  const displayName = useProfile((s) => s.displayName);
  const loaded = useProfile((s) => s.loaded);
  if (isPending) return "";
  if (user && !loaded) return "";
  const raw = displayName || user?.displayName || "";
  return raw.trim().slice(0, 16);
}
