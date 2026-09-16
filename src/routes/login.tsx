import { useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const google = GROK_PROVIDERS.find((p) => p.idp === "google");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!authEnabled) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.trim().split("@")[0] || "GM",
        });
        if (err) throw new Error(err.message ?? "Could not create the account.");
      } else {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(err.message ?? "Email or password did not match.");
      }
      await authClient.getSession().catch(() => undefined);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">
        Career book
      </p>
      <h1 className="mt-2 font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg">
        Sign in
      </h1>
      <p className="mt-3 text-sm text-muted">
        Keep wins, losses, and your high and low nights. Play as a guest anytime.
      </p>

      <section className="mt-8 rounded-xl bg-surface/90 p-4 shadow-[var(--shadow-border)] sm:p-5">
        {authEnabled ? (
          <div className="grid gap-3">
            {google ? (
              <Button
                type="button"
                size="lg"
                className="w-full font-display uppercase tracking-wider"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void signIn(google.providerId, { callbackURL: "/" }).catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : "Google sign-in failed.");
                    setBusy(false);
                  });
                }}
              >
                Continue with Google
              </Button>
            ) : null}

            <p className="text-center text-xs uppercase tracking-[0.18em] text-subtle">or email</p>

            <form className="grid gap-3" onSubmit={(e) => void submitEmail(e)}>
              {mode === "up" ? (
                <div className="grid gap-2">
                  <Label htmlFor="gm-name">GM name</Label>
                  <Input
                    id="gm-name"
                    name="name"
                    autoComplete="nickname"
                    maxLength={16}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex"
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ characters"
                />
              </div>
              {error ? (
                <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-fg">{error}</p>
              ) : null}
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full font-display uppercase tracking-wider"
                disabled={busy}
              >
                {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in with email"}
              </Button>
            </form>

            <button
              type="button"
              className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => {
                setMode(mode === "up" ? "in" : "up");
                setError(null);
              }}
            >
              {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
      </section>

      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/" className="text-fg underline-offset-4 hover:underline">
          Play as a guest
        </Link>
      </p>
    </main>
  );
}
