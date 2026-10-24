// Turns markets + model into bet options with edges.

import { blend, homeCoverProb, overProb, type GameModel } from "./model";
import { formatPoint, impliedProbability } from "./odds-math";
import type { BetOption, Market } from "./types";

export function betOption(
  key: string,
  kind: BetOption["kind"],
  label: string,
  market: Market,
  idx: 0 | 1,
  modelProb: number | undefined,
): BetOption {
  const side = market.sides[idx];
  const impliedProb = impliedProbability(side.best.american);
  const estProb = modelProb === undefined ? undefined : blend(modelProb, side.fairProb);
  return {
    key,
    kind,
    label,
    price: side.best,
    impliedProb,
    fairProb: side.fairProb,
    modelProb,
    estProb,
    edge: estProb === undefined ? undefined : estProb - impliedProb,
  };
}

export function gameBets(
  gameId: string,
  markets: { moneyline?: Market; spread?: Market; total?: Market },
  model: GameModel | null,
): Record<string, BetOption> {
  const out: Record<string, BetOption> = {};
  const { moneyline: ml, spread: sp, total: tot } = markets;
  if (ml) {
    for (const idx of [0, 1] as const) {
      const p = model ? (idx === 1 ? model.homeWin : 1 - model.homeWin) : undefined;
      out[`moneyline:${idx}`] = betOption(`${gameId}:moneyline:${idx}`, "moneyline", `${ml.sides[idx].label} ML`, ml, idx, p);
    }
  }
  if (sp) {
    const homePoint = sp.sides[1].point;
    for (const idx of [0, 1] as const) {
      const cover = model && homePoint !== undefined ? homeCoverProb(model, homePoint) : undefined;
      const p = cover === undefined ? undefined : idx === 1 ? cover : 1 - cover;
      out[`spread:${idx}`] = betOption(
        `${gameId}:spread:${idx}`,
        "spread",
        `${sp.sides[idx].label} ${formatPoint(sp.sides[idx].point)}`,
        sp,
        idx,
        p,
      );
    }
  }
  if (tot) {
    const line = tot.sides[0].point;
    for (const idx of [0, 1] as const) {
      const over = model && line !== undefined ? overProb(model, line) : undefined;
      const p = over === undefined ? undefined : idx === 0 ? over : 1 - over;
      out[`total:${idx}`] = betOption(
        `${gameId}:total:${idx}`,
        "total",
        `${idx === 0 ? "Over" : "Under"} ${formatPoint(line, false)}`,
        tot,
        idx,
        p,
      );
    }
  }
  return out;
}
