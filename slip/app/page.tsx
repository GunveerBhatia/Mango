import { Suspense } from "react";
import { connection } from "next/server";
import { GameCard } from "@/components/game-card";
import { Picks } from "@/components/picks";
import { getTodaysGames } from "@/lib/games";
import { getTodaysPicks } from "@/lib/picks";

function formatDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function Games() {
  await connection();
  const { day, games, notices, sources, oddsCreditsRemaining, assembled } = await getTodaysGames("nba");
  const picks = await getTodaysPicks(assembled, "nba");

  return (
    <>
      <p className="mb-5 text-sm text-muted">{day ? formatDay(day) : "Today"}</p>

      {notices.length > 0 && (
        <ul className="mb-4 space-y-1">
          {notices.map((n) => (
            <li key={n} className="text-xs text-faint">
              {n}
            </li>
          ))}
        </ul>
      )}

      <Picks picks={picks} anyUpcoming={games.some((g) => g.status.state === "pre")} />

      {games.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="text-base font-semibold">No games today</p>
          <p className="mt-1 text-sm text-muted">Nothing on the schedule — a free day off from betting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}

      <footer className="mt-8 space-y-1 text-[11px] leading-relaxed text-faint">
        <p>
          Schedule &amp; records: {sources.schedule} · Odds: {sources.odds} · Injuries: {sources.injuries}
        </p>
        <p>Win % is the vig-free probability implied by the odds. Tap it for the math. Tap a price to add it to your slip.</p>
        <p>Edges: Slip&apos;s model (ESPN results, rest, injuries, ESPN BPI) blended with the market.</p>
        {oddsCreditsRemaining && <p>Odds API credits left this month: {oddsCreditsRemaining}</p>}
        <p>Probabilities, not promises. Bet only what you can afford to lose.</p>
      </footer>
    </>
  );
}

function GamesSkeleton() {
  return (
    <div className="space-y-3">
      <div className="mb-5 h-4 w-32 rounded bg-white/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-card" />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="pt-6">
      <h1 className="text-3xl font-bold tracking-tight">Slip</h1>
      <Suspense fallback={<GamesSkeleton />}>
        <Games />
      </Suspense>
    </main>
  );
}
