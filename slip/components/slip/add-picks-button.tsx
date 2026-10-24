"use client";

import { slipActions } from "@/lib/slip/store";
import type { Leg } from "@/lib/slip/types";

export function AddPicksButton({ legs, stake }: { legs: Leg[]; stake?: number }) {
  return (
    <button
      type="button"
      onClick={() => slipActions.replace(legs, stake)}
      className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg active:opacity-80"
    >
      Add to slip
    </button>
  );
}
