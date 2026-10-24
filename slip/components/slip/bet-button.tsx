"use client";

import { EDGE_THRESHOLD } from "@/lib/model";
import { slipActions, useSlip } from "@/lib/slip/store";
import type { Leg } from "@/lib/slip/types";

/** A price you can tap to add to (or remove from) the slip. Shows the edge when it clears 3%. */
export function BetButton({
  leg,
  main,
  sub,
  edge,
  className = "",
}: {
  leg: Leg | undefined;
  main: string;
  sub?: string;
  edge?: number;
  className?: string;
}) {
  const { legs } = useSlip();
  if (!leg) {
    return (
      <div className={`flex h-12 items-center justify-center rounded-xl bg-white/[0.03] text-faint ${className}`}>—</div>
    );
  }
  const selected = legs.some((l) => l.id === leg.id);
  const hasEdge = edge !== undefined && edge >= EDGE_THRESHOLD;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => slipActions.toggle(leg)}
      className={`flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-colors ${
        selected ? "bg-fg text-bg" : "bg-white/5 active:bg-white/10"
      } ${hasEdge && !selected ? "ring-1 ring-good/60" : ""} ${className}`}
    >
      <span className="text-[15px] font-semibold tabular-nums leading-5">{main}</span>
      {hasEdge ? (
        <span className={`text-[10px] font-medium leading-3 tabular-nums ${selected ? "text-bg" : "text-good"}`}>
          Edge +{(edge * 100).toFixed(1)}%
        </span>
      ) : (
        sub && (
          <span className={`max-w-full truncate text-[10px] leading-3 tabular-nums ${selected ? "text-bg/70" : "text-muted"}`}>
            {sub}
          </span>
        )
      )}
    </button>
  );
}
