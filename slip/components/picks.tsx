import { HowEdgesWork } from "./edge-banner";
import { Sheet } from "./sheet";
import { PickStake } from "./slip/pick-stake";
import { WhyList } from "./why-list";
import { EDGE_THRESHOLD } from "@/lib/model";
import { formatAmerican, formatPct } from "@/lib/odds-math";
import type { TodaysPicks } from "@/lib/picks";
import { money, riskLabel } from "@/lib/slip/math";

export function Picks({ picks, anyUpcoming }: { picks: TodaysPicks; anyUpcoming: boolean }) {
  if (!anyUpcoming) return null;

  if (picks.parlays.length === 0) {
    return (
      <section className="mb-4 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold">No bet today</p>
            <p className="mt-1 text-sm text-muted">
              Not enough bets beat the book by {EDGE_THRESHOLD * 100}%+ to build a parlay. Skipping days like this
              protects your bankroll.
            </p>
          </div>
          <HowEdgesWork id="how-edge-none" />
        </div>
        <p className="mt-3 text-[11px] text-faint">{picks.propsNote}</p>
      </section>
    );
  }

  const hasValue = picks.parlays.some((p) => p.id === "value");
  return (
    <section className="mb-5">
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold">Picks for you</h2>
        <HowEdgesWork id="how-edge-picks" />
      </div>
      <p className="mb-3 px-1 text-xs text-muted">
        {hasValue
          ? "Swipe for more. Riskier picks get smaller suggested bets."
          : `No bet beats the book by ${EDGE_THRESHOLD * 100}%+ today, so these are sized small on purpose. Swipe for more.`}
      </p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {picks.parlays.map((p) => (
          <article
            key={p.id}
            className={`w-[85%] shrink-0 snap-center rounded-2xl border bg-card p-4 ${p.id === "value" ? "border-good/40" : "border-line"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.title}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{riskLabel(p.estHit)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{formatAmerican(p.american)}</p>
                <p className="text-xs tabular-nums text-muted">pays {p.multiplier.toFixed(p.multiplier < 10 ? 1 : 0)}x</p>
              </div>
            </div>
            <p className="mb-3 text-xs text-muted">{p.blurb}</p>

            <ul className="mb-3 divide-y divide-line rounded-xl bg-black/20">
              {p.legs.map((l) => (
                <li key={l.leg.id}>
                  <Sheet
                    id={`why-${p.id}-${l.leg.id.replace(/[^a-z0-9]/gi, "")}`}
                    title={l.leg.label}
                    triggerClassName="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/5"
                    trigger={
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-fg">{l.leg.label}</span>
                          <span className="block truncate text-xs text-muted">
                            {l.leg.matchup} · {formatAmerican(l.leg.american)} {l.leg.book}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-fg">{formatPct(l.estProb)}</span>
                          <span className="block text-[11px] text-muted underline">Why?</span>
                        </span>
                      </>
                    }
                  >
                    <WhyList why={l.why} />
                  </Sheet>
                </li>
              ))}
            </ul>

            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[11px] text-muted">Our hit %</p>
                <p className="font-semibold tabular-nums">{formatPct(p.estHit)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Book&apos;s</p>
                <p className="font-semibold tabular-nums">{formatPct(p.impliedHit)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Avg. result per $10</p>
                <p className={`font-semibold tabular-nums ${p.ev10 >= 0 ? "text-good" : "text-bad"}`}>{money(p.ev10, true)}</p>
              </div>
            </div>
            <PickStake legs={p.legs.map((l) => l.leg)} hit={p.estHit} multiplier={p.multiplier} />
          </article>
        ))}
      </div>
      <p className="mt-2 px-1 text-[11px] text-faint">
        One leg per game, so legs don&apos;t move together. Tap a leg to see the numbers behind it. {picks.propsNote}
      </p>
    </section>
  );
}
