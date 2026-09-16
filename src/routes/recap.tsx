import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { RecapCard } from "@/components/game/recap-card";
import { Button } from "@/components/ui/button";
import { decodeRecap, recapCaption, type Recap } from "@/lib/game/recap";

export const Route = createFileRoute("/recap")({
  component: RecapPage,
  ssr: false,
});

function RecapPage() {
  const [recap, setRecap] = useState<Recap | null>(null);

  useEffect(() => {
    const token = window.location.hash.replace(/^#/, "");
    setRecap(token ? decodeRecap(token) : null);
  }, []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-5 py-6 sm:py-8">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-turf">Darkness</p>
      <h1 className="mt-1 font-display text-4xl font-semibold uppercase tracking-tight text-fg">Night recap</h1>
      {recap ? (
        <>
          <p className="mt-2 text-sm text-muted">{recapCaption(recap)}</p>
          <div className="mt-5">
            <RecapCard recap={recap} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">This recap link is missing or broken.</p>
      )}
      <Button asChild size="lg" className="mt-6 font-display uppercase tracking-wider">
        <Link to="/">Play Darkness</Link>
      </Button>
    </main>
  );
}
