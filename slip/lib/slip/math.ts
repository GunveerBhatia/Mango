// Pure slip math. No React, no storage — tested in lib/__tests__/slip.test.ts.

import { americanToDecimal, decimalToAmerican, impliedProbability } from "../odds-math";
import type { BetKind } from "../types";
import { LOW_HIT_WARNING, MAX_STAKE_PCT, type Leg, type SavedLeg, type SavedSlip, type Settings } from "./types";

const product = (xs: number[]) => xs.reduce((p, x) => p * x, 1);

export interface SlipNumbers {
  decimal: number;
  american: number;
  /** Product of each price's implied probability (what the book charges for). */
  impliedHit: number;
  /** Product of our best estimate per leg (model blend, else vig-free market). */
  estHit: number;
  /** True when every leg had a model estimate. */
  allModeled: boolean;
}

export function slipNumbers(legs: Leg[]): SlipNumbers {
  const decimal = product(legs.map((l) => americanToDecimal(l.american)));
  return {
    decimal,
    american: decimalToAmerican(decimal),
    impliedHit: product(legs.map((l) => l.impliedProb)),
    estHit: product(legs.map(bestProb)),
    allModeled: legs.length > 0 && legs.every((l) => l.estProb !== undefined),
  };
}

export const bestProb = (l: Leg) => l.estProb ?? l.fairProb ?? l.impliedProb;

/**
 * Expected value each leg adds (negative = costs you), in dollars for `stake`.
 * Leg k's effect = stake × Π(m_i, i<k) × (m_k − 1), where m = prob × decimal.
 */
export function evByLeg(legs: Leg[], stake: number): number[] {
  let running = 1;
  return legs.map((l) => {
    const m = bestProb(l) * americanToDecimal(l.american);
    const delta = stake * running * (m - 1);
    running *= m;
    return delta;
  });
}

export function totalEv(legs: Leg[], stake: number): number {
  return stake * (product(legs.map((l) => bestProb(l) * americanToDecimal(l.american))) - 1);
}

export interface StakeAdvice {
  suggested: number;
  max: number;
  reason: string;
}

export function stakeAdvice(settings: Settings, legs: Leg[]): StakeAdvice | null {
  const bankroll = settings.bankroll;
  if (!bankroll || bankroll <= 0) return null;
  const max = round2(bankroll * MAX_STAKE_PCT);
  if (settings.stakeMode === "flat") {
    const s = round2((bankroll * settings.flatPct) / 100);
    return { suggested: Math.min(s, max), max, reason: `${settings.flatPct}% of your $${fmt(bankroll)} bankroll` };
  }
  const { decimal, estHit } = slipNumbers(legs);
  const b = decimal - 1;
  const full = b > 0 ? (b * estHit - (1 - estHit)) / b : 0;
  if (full <= 0) {
    return { suggested: 0, max, reason: "Kelly says $0: by our estimate this slip has no edge" };
  }
  const s = round2(bankroll * full * settings.kellyFraction);
  const capped = Math.min(s, max);
  return {
    suggested: capped,
    max,
    reason: `${Math.round(settings.kellyFraction * 100)}% Kelly${capped < s ? " (capped at 5%)" : ""}`,
  };
}

/** Plain-English warnings about correlated or contradictory legs. */
export function slipWarnings(legs: Leg[], settings: Settings): string[] {
  const out: string[] = [];
  const byGame = new Map<string, Leg[]>();
  for (const l of legs) byGame.set(l.gameId, [...(byGame.get(l.gameId) ?? []), l]);

  for (const group of byGame.values()) {
    if (group.length < 2) continue;
    const m = group[0].matchup;
    const kinds = (k: BetKind) => group.filter((l) => l.kind === k);
    const contradict = group.some((a) =>
      group.some((b) => a !== b && a.kind === b.kind && a.kind !== "prop" && a.side !== b.side),
    );
    if (contradict) out.push(`${m}: two legs bet against each other — at most one can win.`);

    const sides = [...kinds("moneyline"), ...kinds("spread")];
    const sameTeam = sides.some((a) => sides.some((b) => a !== b && a.teamId === b.teamId));
    if (sameTeam)
      out.push(`${m}: moneyline and spread on the same team move together. If one loses, the other usually does too.`);

    const props = kinds("prop");
    const players = new Set(props.map((p) => p.athleteId));
    if (players.size < props.length)
      out.push(`${m}: several props on the same player are correlated (e.g. points and PRA rise together).`);
    if (props.length > 0 && group.length > props.length)
      out.push(`${m}: player props and team bets in the same game are linked — a big scoring night affects both.`);
    if (!contradict && !sameTeam && players.size === props.length && !(props.length > 0 && group.length > props.length))
      out.push(`${m}: same-game legs are correlated, so multiplying their probabilities can mislead.`);
  }

  if (legs.length >= 2) {
    const hit = slipNumbers(legs).impliedHit;
    if (hit < LOW_HIT_WARNING)
      out.push(`Low odds of hitting: about ${Math.round(hit * 100)}% (less than 1 in 4 times).`);
  }
  if (legs.length > settings.maxLegs)
    out.push(`More than ${settings.maxLegs} legs. Every extra leg adds the book's cut again.`);
  return out;
}

/* ---------- Results & record ---------- */

export type SlipResult = "pending" | "won" | "lost" | "push";

export function slipResult(s: SavedSlip): SlipResult {
  if (s.legs.some((l) => l.result === "lost")) return "lost";
  if (s.legs.some((l) => l.result === "pending")) return "pending";
  if (s.legs.every((l) => l.result === "push")) return "push";
  return "won";
}

/** Profit in dollars (negative = loss). Pushed legs drop out of the parlay. Pending → 0. */
export function slipProfit(s: SavedSlip): number {
  const r = slipResult(s);
  if (r === "lost") return -s.stake;
  if (r !== "won") return 0;
  const dec = product(s.legs.filter((l) => l.result === "won").map((l) => americanToDecimal(l.american)));
  return round2(s.stake * (dec - 1));
}

/**
 * Closing line value in percentage points of win probability.
 * Positive = you got a better price than the market closed at.
 * When the line moved (e.g. −4.5 → −5.5), each point is worth roughly 3%.
 */
export function legClv(l: SavedLeg): number | undefined {
  if (l.closingAmerican === undefined) return undefined;
  let clv = impliedProbability(l.closingAmerican) - impliedProbability(l.american);
  if (l.point !== undefined && l.closingPoint !== undefined && l.closingPoint !== l.point) {
    // Higher is better for spreads (+5 beats +4) and unders; lower is better for overs.
    const better = l.kind === "total" && l.side === 0 ? l.closingPoint - l.point : l.point - l.closingPoint;
    clv += better * (l.kind === "prop" ? 0.06 : 0.03);
  }
  return clv;
}

export type RecordCategory = "moneyline" | "spread" | "total" | "prop" | "parlay";

export function slipCategory(s: SavedSlip): RecordCategory {
  return s.legs.length > 1 ? "parlay" : (s.legs[0]?.kind ?? "moneyline");
}

export interface CategoryStats {
  category: RecordCategory;
  bets: number;
  won: number;
  lost: number;
  staked: number;
  profit: number;
  roi: number;
}

export interface LegTypeStats {
  kind: BetKind;
  legs: number;
  hit: number;
  hitRate: number;
  /** Average implied probability of those legs: what you'd hit at break-even. */
  expected: number;
}

export interface RecordStats {
  settled: number;
  pending: number;
  won: number;
  lost: number;
  winRate?: number;
  staked: number;
  profit: number;
  roi?: number;
  units?: number;
  byCategory: CategoryStats[];
  legTypes: LegTypeStats[];
  clv: { count: number; avg?: number; beatRate?: number };
}

export function recordStats(slips: SavedSlip[]): RecordStats {
  const settled = slips.filter((s) => slipResult(s) !== "pending");
  const won = settled.filter((s) => slipResult(s) === "won").length;
  const lost = settled.filter((s) => slipResult(s) === "lost").length;
  const staked = sum(settled.map((s) => s.stake));
  const profit = round2(sum(settled.map(slipProfit)));
  const withUnits = settled.filter((s) => s.unitSize);
  const units = withUnits.length ? sum(withUnits.map((s) => slipProfit(s) / s.unitSize!)) : undefined;

  const cats: RecordCategory[] = ["moneyline", "spread", "total", "prop", "parlay"];
  const byCategory = cats
    .map((category) => {
      const group = settled.filter((s) => slipCategory(s) === category);
      const st = sum(group.map((s) => s.stake));
      const pr = round2(sum(group.map(slipProfit)));
      return {
        category,
        bets: group.length,
        won: group.filter((s) => slipResult(s) === "won").length,
        lost: group.filter((s) => slipResult(s) === "lost").length,
        staked: st,
        profit: pr,
        roi: st > 0 ? pr / st : 0,
      };
    })
    .filter((c) => c.bets > 0);

  const legs = slips.flatMap((s) => s.legs).filter((l) => l.result === "won" || l.result === "lost");
  const kinds: BetKind[] = ["moneyline", "spread", "total", "prop"];
  const legTypes = kinds
    .map((kind) => {
      const ls = legs.filter((l) => l.kind === kind);
      const hit = ls.filter((l) => l.result === "won").length;
      return {
        kind,
        legs: ls.length,
        hit,
        hitRate: ls.length ? hit / ls.length : 0,
        expected: ls.length ? sum(ls.map((l) => l.impliedProb)) / ls.length : 0,
      };
    })
    .filter((k) => k.legs > 0);

  const clvs = slips.flatMap((s) => s.legs).map(legClv).filter((x): x is number => x !== undefined);
  return {
    settled: settled.length,
    pending: slips.length - settled.length,
    won,
    lost,
    winRate: won + lost > 0 ? won / (won + lost) : undefined,
    staked,
    profit,
    roi: staked > 0 ? profit / staked : undefined,
    units: units === undefined ? undefined : Math.round(units * 100) / 100,
    byCategory,
    legTypes,
    clv: {
      count: clvs.length,
      avg: clvs.length ? sum(clvs) / clvs.length : undefined,
      beatRate: clvs.length ? clvs.filter((c) => c > 0).length / clvs.length : undefined,
    },
  };
}

function sum(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0);
}
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
export function money(n: number, signed = false) {
  const s = `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!signed) return n < 0 ? `-${s}` : s;
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}
