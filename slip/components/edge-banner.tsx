import { Sheet } from "./sheet";
import { EDGE_THRESHOLD, MODEL_WEIGHT } from "@/lib/model";

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
