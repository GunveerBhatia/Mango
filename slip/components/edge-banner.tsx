import Link from "next/link";
import { BetButton } from "./slip/bet-button";
import { Sheet } from "./sheet";
import { EDGE_THRESHOLD, MODEL_WEIGHT } from "@/lib/model";
import { formatAmerican, formatPct } from "@/lib/odds-math";
import { legFromGameBet } from "@/lib/slip/legs";
import type { BetOption, Game } from "@/lib/types";

export function HowEdgesWork({ id }: { id: string }) {
  return (
    <Sheet id={id} title="How the edge is calculated" trigger="How?" triggerClassName="text-xs text-muted underline">
      <div className="space-y-3">
        <p>
          <span className="text-fg">1. Our estimate.</span> A simple model from each team&apos;s last 10 games (point
          differential, points for and against), home court, rest and key injuries — blended 60/40 with ESPN&apos;s BPI
          matchup predictor when ESPN publishes one.
        </p>
        <p>
          <span className="text-fg">2. Respect the market.</span> Sportsbooks are hard to beat, so the model only gets{" "}
          {MODEL_WEIGHT * 100}% of the say. The other {100 - MODEL_WEIGHT * 100}% is the market&apos;s vig-free
          probability.
        </p>
        <p>
          <span className="text-fg">3. Compare to the price.</span> Edge = our estimate − the probability implied by
          the best available price. Only edges of +{EDGE_THRESHOLD * 100}% or more are highlighted.
        </p>
        <p className="text-xs text-faint">
          An edge is an estimate, not a guarantee. Track your closing line value in My Record to see if these edges
          are real.
        </p>
      </div>
    </Sheet>
  );
}

export function EdgeBanner({ edges, anyUpcoming }: { edges: { game: Game; bet: BetOption }[]; anyUpcoming: boolean }) {
  if (!anyUpcoming) return null;
  if (edges.length === 0) {
    return (
      <section className="mb-4 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold">No bet today</p>
            <p className="mt-1 text-sm text-muted">
              No bet beats the book by {EDGE_THRESHOLD * 100}% or more. Skipping days like this protects your bankroll.
            </p>
          </div>
          <HowEdgesWork id="how-edge-none" />
        </div>
      </section>
    );
  }
  return (
    <section className="mb-4 rounded-2xl border border-good/30 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">
          {edges.length} {edges.length === 1 ? "bet clears" : "bets clear"} the {EDGE_THRESHOLD * 100}% edge bar
        </p>
        <HowEdgesWork id="how-edge-some" />
      </div>
      <ul className="space-y-2">
        {edges.slice(0, 5).map(({ game, bet }) => {
          const key = bet.key.split(":").slice(1).join(":");
          return (
            <li key={bet.key} className="grid grid-cols-[1fr_5.5rem] items-center gap-3">
              <Link href={`/game/${game.id}`} className="min-w-0">
                <p className="truncate font-medium">{bet.label}</p>
                <p className="truncate text-xs text-muted">
                  {game.away.abbr} @ {game.home.abbr} · est. {formatPct(bet.estProb)} vs book {formatPct(bet.impliedProb)}
                </p>
              </Link>
              <BetButton
                leg={legFromGameBet(game, key)}
                main={formatAmerican(bet.price.american)}
                edge={bet.edge}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
