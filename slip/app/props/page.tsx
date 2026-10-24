import { connection } from "next/server";
import { Suspense } from "react";
import { PlayerSearch } from "@/components/props/player-search";
import { getPropsIndex } from "@/lib/props";

async function Index() {
  await connection();
  const games = await getPropsIndex("nba");
  if (!games) return <p className="py-10 text-center text-sm text-muted">No data yet. Try again in a few minutes.</p>;
  if (games.length === 0)
    return <p className="py-10 text-center text-sm text-muted">No games left today, so there are no props to research.</p>;
  return (
    <>
      <PlayerSearch games={games} />
      <p className="mt-6 text-[11px] text-faint">Rosters and injuries: ESPN</p>
    </>
  );
}

export default function PropsPage() {
  return (
    <main className="pt-6">
      <h1 className="text-3xl font-bold tracking-tight">Props</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Pick a player playing today.</p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        <Index />
      </Suspense>
    </main>
  );
}
