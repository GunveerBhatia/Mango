"use client";

import Link from "next/link";
import { useState } from "react";
import { formatAmerican, formatPct } from "@/lib/odds-math";
import { evByLeg, money, slipNumbers, slipWarnings, stakeAdvice, totalEv } from "@/lib/slip/math";
import { slipActions, useSlip } from "@/lib/slip/store";
import { MAX_STAKE_PCT } from "@/lib/slip/types";

/** The bar above the nav and the slip that slides up from it (PrizePicks-style). */
export function SlipDock() {
  const { legs, open, settings, flash, openedAt } = useSlip();
  const [stakeText, setStakeText] = useState("");
  const [saved, setSaved] = useState(false);

  const n = slipNumbers(legs);
  const advice = stakeAdvice(settings, legs);
  const stake = Number(stakeText) || 0;
  const overMax = advice ? stake > advice.max : false;
  const evs = evByLeg(legs, stake || 10);
  const ev = totalEv(legs, stake || 10);
  const warnings = slipWarnings(legs, settings);
  const started = openedAt !== undefined && legs.some((l) => Date.parse(l.startTime) < openedAt);

  return (
    <>
      {legs.length > 0 && !open && (
        <button
          type="button"
          onClick={() => slipActions.setOpen(true)}
          className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30 mx-auto flex w-[calc(100%-2rem)] max-w-[30rem] items-center justify-between rounded-2xl bg-fg px-4 py-3 text-bg shadow-lg"
        >
          <span className="text-sm font-semibold">
            {legs.length} {legs.length === 1 ? "pick" : "picks"}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatAmerican(n.american)} · {formatPct(n.impliedHit)} to hit
          </span>
          <span className="text-sm font-semibold">View ↑</span>
        </button>
      )}

      {saved && !open && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 mx-auto w-[calc(100%-2rem)] max-w-[30rem] rounded-2xl bg-raised px-4 py-3 text-center text-sm">
          Saved. Mark it won or lost in <Link href="/record" className="underline" onClick={() => setSaved(false)}>My Record</Link>.
        </div>
      )}

      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => slipActions.setOpen(false)}
      />
      <section
        aria-label="Slip"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-raised px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-[transform,visibility] duration-300 ${
          open ? "visible translate-y-0" : "invisible translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your slip</h2>
          <div className="flex gap-1">
            {legs.length > 0 && (
              <button type="button" onClick={slipActions.clear} className="px-3 py-1 text-sm text-muted">
                Clear
              </button>
            )}
            <button type="button" onClick={() => slipActions.setOpen(false)} className="px-3 py-1 text-sm text-muted">
              Close
            </button>
          </div>
        </header>

        {flash && <p className="mb-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{flash}</p>}

        {legs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Tap any price to add it here.</p>
        ) : (
          <>
            <ul className="divide-y divide-line rounded-2xl bg-card">
              {legs.map((l, i) => (
                <li key={l.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.label}</p>
                    <p className="truncate text-xs text-muted">
                      {l.matchup} · {l.book}
                    </p>
                    <p className={`mt-0.5 text-[11px] tabular-nums ${evs[i] >= 0 ? "text-good" : "text-bad"}`}>
                      {evs[i] >= 0 ? "Adds" : "Costs"} {money(Math.abs(evs[i]))} expected value
                      {i > 0 ? " as a parlay leg" : ""}
                    </p>
                  </div>
                  <span className="pt-0.5 font-semibold tabular-nums">{formatAmerican(l.american)}</span>
                  <button
                    type="button"
                    onClick={() => slipActions.remove(l.id)}
                    aria-label={`Remove ${l.label}`}
                    className="-mr-1 px-2 text-lg leading-6 text-faint"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat label="Odds" value={formatAmerican(n.american)} />
              <Stat
                label="Chance to hit"
                value={formatPct(n.impliedHit)}
                sub={n.allModeled ? `Our estimate: ${formatPct(n.estHit)}` : "Book's implied odds"}
              />
            </div>

            <label className="mt-5 block text-xs text-muted" htmlFor="stake">
              Stake
            </label>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-xl bg-card px-3">
                <span className="text-muted">$</span>
                <input
                  id="stake"
                  inputMode="decimal"
                  value={stakeText}
                  onChange={(e) => setStakeText(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0"
                  className="w-full bg-transparent px-1 py-3 text-lg font-semibold tabular-nums outline-none"
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">To win</p>
                <p className="text-lg font-semibold tabular-nums">{money(stake * (n.decimal - 1))}</p>
              </div>
            </div>
            {advice ? (
              <button
                type="button"
                onClick={() => setStakeText(String(advice.suggested))}
                className="mt-2 text-left text-xs text-muted"
              >
                Suggested: <span className="text-fg underline">{money(advice.suggested)}</span> — {advice.reason}. Max{" "}
                {money(advice.max)} (5%).
              </button>
            ) : (
              <p className="mt-2 text-xs text-muted">
                Set your bankroll in <Link href="/record" className="underline" onClick={() => slipActions.setOpen(false)}>My Record</Link> to get stake suggestions.
              </p>
            )}

            <p className={`mt-4 text-sm tabular-nums ${ev >= 0 ? "text-good" : "text-bad"}`}>
              Expected value: {money(ev, true)} on {money(stake || 10)}
              <span className="block text-xs text-muted">
                {n.allModeled ? "Using our estimates." : "Using the market's vig-free odds — the book's cut is the cost."}
              </span>
            </p>

            {warnings.length > 0 && (
              <ul className="mt-4 space-y-2">
                {warnings.map((w) => (
                  <li key={w} className="rounded-xl bg-bad/10 p-3 text-sm text-bad">
                    {w}
                  </li>
                ))}
              </ul>
            )}

            {overMax && (
              <p className="mt-4 text-sm text-bad">
                That&apos;s more than {MAX_STAKE_PCT * 100}% of your bankroll ({money(advice!.max)}). Lower the stake to save.
              </p>
            )}
            {started && <p className="mt-4 text-sm text-bad">A game on this slip has already started.</p>}

            <button
              type="button"
              disabled={stake <= 0 || overMax}
              onClick={() => {
                slipActions.save(stake);
                setStakeText("");
                setSaved(true);
                setTimeout(() => setSaved(false), 4000);
              }}
              className="mt-5 w-full rounded-2xl bg-fg py-4 font-semibold text-bg disabled:opacity-30"
            >
              Save slip
            </button>
            <p className="mt-2 text-center text-[11px] text-faint">
              Saves locally with today&apos;s odds so you can track results and closing line value.
            </p>
          </>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
