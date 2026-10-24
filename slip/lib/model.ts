// Slip's own probability model. Deliberately simple and transparent.
//
// Sportsbooks are hard to beat, so the raw model is blended with the market's
// vig-free price (MODEL_WEIGHT = how much we trust our model). A bet only gets
// flagged when the blended estimate beats the price you'd actually pay by EDGE_THRESHOLD.

import type { PlayerGame, TeamResult } from "./providers/espn";

export const MODEL_WEIGHT = 0.3;
export const EDGE_THRESHOLD = 0.03;
/** Standard deviation of NBA final margins and totals, in points. */
const MARGIN_SD = 12;
const TOTAL_SD = 18;
const HOME_COURT = 2.5;

/** Standard normal CDF (Abramowitz–Stegun approximation). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Inverse normal CDF (Acklam's approximation), for converting a win % into a margin. */
export function normInv(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q0 = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  if (q0 < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(q0));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (q0 > 1 - 0.02425) return -normInv(1 - q0);
  const q = q0 - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export const blend = (model: number, market: number | undefined) =>
  market === undefined ? model : MODEL_WEIGHT * model + (1 - MODEL_WEIGHT) * market;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export interface TeamForm {
  games: number;
  wins: number;
  avgFor: number;
  avgAgainst: number;
  avgMargin: number;
}

export function form(results: TeamResult[]): TeamForm {
  return {
    games: results.length,
    wins: results.filter((r) => r.won).length,
    avgFor: mean(results.map((r) => r.pointsFor)),
    avgAgainst: mean(results.map((r) => r.pointsAgainst)),
    avgMargin: mean(results.map((r) => r.pointsFor - r.pointsAgainst)),
  };
}

export interface TeamContext {
  last10: TeamForm;
  /** Days since last game: 0 = back-to-back. */
  restDays?: number;
  threeInFour: boolean;
  keyOut: number;
  keyQuestionable: number;
}

export interface GameModel {
  /** Expected home margin (home score − away score). */
  homeMargin: number;
  homeWin: number;
  expectedTotal?: number;
  /** Plain-English pieces of the margin, for the "how" sheet. */
  parts: { label: string; points: number }[];
}

function situational(t: TeamContext): { label: string; points: number }[] {
  const parts: { label: string; points: number }[] = [];
  if (t.restDays === 0) parts.push({ label: "back-to-back", points: -1.5 });
  if (t.threeInFour) parts.push({ label: "3+ in 4 nights", points: -1 });
  const inj = Math.max(-6, -3 * t.keyOut - 1 * t.keyQuestionable);
  if (inj) parts.push({ label: "key injuries", points: inj });
  return parts;
}

/**
 * Margin model: half of the gap in last-10 point differential (regressed,
 * because 10 games is noisy), plus home court, rest and injuries. Optionally
 * blended with ESPN's BPI predictor.
 */
export function modelGame(away: TeamContext, home: TeamContext, bpiHomeWin?: number): GameModel | null {
  if (away.last10.games < 3 || home.last10.games < 3) return null;
  const parts: { label: string; points: number }[] = [
    { label: "recent point differential", points: 0.5 * (home.last10.avgMargin - away.last10.avgMargin) },
    { label: "home court", points: HOME_COURT },
  ];
  for (const p of situational(home)) parts.push({ label: `home ${p.label}`, points: p.points });
  for (const p of situational(away)) parts.push({ label: `away ${p.label}`, points: -p.points });
  let margin = parts.reduce((s, p) => s + p.points, 0);
  if (bpiHomeWin !== undefined) {
    // BPI is a fuller model than ours, so it gets the larger share.
    const bpiMargin = MARGIN_SD * normInv(bpiHomeWin);
    const mixed = 0.6 * bpiMargin + 0.4 * margin;
    parts.push({ label: "blended with ESPN BPI (60/40)", points: mixed - margin });
    margin = mixed;
  }
  const injuriesTotal = -1.5 * (home.keyOut + away.keyOut);
  const expectedTotal =
    (home.last10.avgFor + away.last10.avgAgainst) / 2 + (away.last10.avgFor + home.last10.avgAgainst) / 2 + injuriesTotal;
  return { homeMargin: margin, homeWin: normCdf(margin / MARGIN_SD), expectedTotal, parts };
}

/** P(home covers) for a home spread like +4.5 or −3. */
export const homeCoverProb = (m: GameModel, homePoint: number) => normCdf((m.homeMargin + homePoint) / MARGIN_SD);
export const overProb = (m: GameModel, total: number) =>
  m.expectedTotal === undefined ? undefined : 1 - normCdf((total - m.expectedTotal) / TOTAL_SD);

/* ---------- Player props ---------- */

export type PropStat = "pts" | "reb" | "ast" | "pra" | "threes";

export const PROP_LABELS: Record<PropStat, string> = {
  pts: "Points",
  reb: "Rebounds",
  ast: "Assists",
  pra: "Pts+Reb+Ast",
  threes: "3-Pointers",
};
export const PROP_SHORT: Record<PropStat, string> = { pts: "PTS", reb: "REB", ast: "AST", pra: "PRA", threes: "3PM" };

export function statValue(g: PlayerGame, stat: PropStat): number {
  return stat === "pra" ? g.pts + g.reb + g.ast : g[stat];
}

export interface PropModel {
  mean: number;
  sd: number;
  overProb: number;
  minutesFactor: number;
}

/**
 * Over probability from the last 10 games (normal approximation), scaled down
 * if minutes are dropping. Returns null with fewer than 5 games.
 */
export function modelProp(games: PlayerGame[], stat: PropStat, line: number): PropModel | null {
  const last = games.slice(-10);
  if (last.length < 5) return null;
  const vals = last.map((g) => statValue(g, stat));
  const mu = mean(vals);
  const sd = Math.max(Math.sqrt(mean(vals.map((v) => (v - mu) ** 2))), 1, mu * 0.2);
  const minAll = mean(last.map((g) => g.min));
  const min3 = mean(last.slice(-3).map((g) => g.min));
  const minutesFactor = minAll > 0 && min3 < minAll * 0.85 ? min3 / minAll : 1;
  const adj = mu * minutesFactor;
  return { mean: adj, sd, overProb: 1 - normCdf((line - adj) / sd), minutesFactor };
}
