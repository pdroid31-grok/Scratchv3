"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useProfile } from "@/lib/game/profile-store";
import { getNamePick } from "@/lib/game/name-pick";
import { setMyName } from "@/lib/game/stats";
import { clipDisplayName, isHiddenBoardName } from "@/lib/game/stats-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** New accounts must save an in-game name before they can use the app. */
export function NamePickGate() {
  const { user, isPending } = useCurrentUserState();
  const loadProfile = useProfile((s) => s.load);
  const userId = user?.id ?? null;
  const [needs, setNeeds] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNeeds(false);
    if (isPending || !userId) return;
    let live = true;
    void getNamePick()
      .then((result) => {
        if (live) setNeeds(result.needsName);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId, isPending]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = clipDisplayName(name);
    if (!next || isHiddenBoardName(next)) {
      setError("Pick a different name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await setMyName({ data: { name: next } });
      if (!saved.displayName) {
        setError("That name is taken. Pick a different name.");
        setBusy(false);
        return;
      }
      setNeeds(false);
      void loadProfile();
    } catch {
      setError("Could not save. Try again.");
    }
    setBusy(false);
  }

  if (!needs) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-pick-title"
    >
      <form
        className="w-full max-w-md rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6"
        onSubmit={(e) => void save(e)}
      >
        <h2
          id="name-pick-title"
          className="font-display text-3xl font-semibold uppercase tracking-tight text-fg"
        >
          Pick your name
        </h2>
        <p className="mt-2 text-sm text-muted">This is the name other players see. 16 characters max.</p>
        <div className="mt-4 grid gap-2">
          <Label htmlFor="name-pick">In-game name</Label>
          <Input
            id="name-pick"
            name="name"
            autoComplete="nickname"
            autoFocus
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
          />
        </div>
        {error ? <p className="mt-3 rounded-md bg-danger/20 px-3 py-2 text-sm text-fg">{error}</p> : null}
        <Button
          type="submit"
          size="lg"
          className="mt-5 w-full font-display uppercase tracking-wider"
          disabled={busy || !clipDisplayName(name)}
        >
          {busy ? "Saving…" : "Save name"}
        </Button>
      </form>
    </div>
  );
}
