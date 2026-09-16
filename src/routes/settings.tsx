import { Link, createFileRoute } from "@tanstack/react-router";
import { AuthBar } from "@/components/game/auth-bar";
import { CommishSettingsPage } from "@/components/game/commish-settings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link to="/" className="font-display text-5xl font-semibold uppercase leading-none tracking-tight text-fg sm:text-6xl">
            Darkness
          </Link>
        </div>
        <AuthBar
          className="shrink-0"
          onProfile={() => {
            window.location.href = "/?tab=profile";
          }}
        />
      </header>
      <CommishSettingsPage />
    </main>
  );
}
