"use client";

import Link from "next/link";
import { money, riskStake } from "@/lib/slip/math";
import { useSlip } from "@/lib/slip/store";
import type { Leg } from "@/lib/slip/types";
import { AddPicksButton } from "./add-picks-button";

/** "Bet up to $X" sized to the parlay's risk, plus the add button carrying that stake. */
export function PickStake({ legs, hit, multiplier }: { legs: Leg[]; hit: number; multiplier: number }) {
  const { settings, ready } = useSlip();
  const bankroll = settings.bankroll;
  const max = bankroll ? riskStake(bankroll, hit) : undefined;
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-2 rounded-xl bg-black/20 px-3 py-2.5">
        {!ready ? (
          <span className="text-sm text-muted">…</span>
        ) : max !== undefined ? (
          <>
            <span className="text-sm text-muted">Bet up to</span>
            <span className="text-right">
              <span className="text-lg font-semibold tabular-nums">{money(max)}</span>
              <span className="ml-2 text-xs tabular-nums text-muted">wins {money(max * (multiplier - 1))}</span>
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">
            Bet up to {(5 * hit).toFixed(hit < 0.2 ? 2 : 1)}% of your bankroll.{" "}
            <Link href="/record" className="underline">
              Set it
            </Link>{" "}
            to see dollars.
          </span>
        )}
      </div>
      <AddPicksButton legs={legs} stake={max} />
    </>
  );
}
