import { americanToDecimal, removeVig } from "./odds-math";
import type { Market, MarketKind, MarketSide, Price } from "./types";

/** One book's two-sided quote. Side A = away/over, side B = home/under. */
export interface BookQuote {
  book: string;
  bookKey: string;
  a?: { american: number; point?: number };
  b?: { american: number; point?: number };
}

function mode(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

const byBestPrice = (x: Price, y: Price) => americanToDecimal(y.american) - americanToDecimal(x.american);

/**
 * Turn per-book quotes into one market: pick the most common line, find the
 * best price at that line on each side (line shopping), and compute the
 * vig-free probability averaged across books.
 */
export function buildMarket(
  kind: MarketKind,
  labels: [string, string],
  quotes: BookQuote[],
): Market | undefined {
  const usesPoint = kind !== "moneyline";
  const mainPoint = usesPoint
    ? mode(quotes.flatMap((q) => (q.a?.point !== undefined ? [q.a.point] : [])))
    : undefined;

  const atMain = quotes.filter((q) => !usesPoint || q.a?.point === mainPoint);
  const sideA: Price[] = [];
  const sideB: Price[] = [];
  const fairA: number[] = [];
  const vigs: number[] = [];

  for (const q of atMain) {
    if (q.a) sideA.push({ book: q.book, bookKey: q.bookKey, american: q.a.american, point: q.a.point });
    if (q.b) sideB.push({ book: q.book, bookKey: q.bookKey, american: q.b.american, point: q.b.point });
    if (q.a && q.b) {
      const [fa, , vig] = removeVig(q.a.american, q.b.american);
      fairA.push(fa);
      vigs.push(vig);
    }
  }
  if (sideA.length === 0 || sideB.length === 0) return undefined;

  sideA.sort(byBestPrice);
  sideB.sort(byBestPrice);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
  const fa = avg(fairA);

  const a: MarketSide = { label: labels[0], point: sideA[0].point, best: sideA[0], all: sideA, fairProb: fa };
  const b: MarketSide = {
    label: labels[1],
    point: sideB[0].point,
    best: sideB[0],
    all: sideB,
    fairProb: fa === undefined ? undefined : 1 - fa,
  };
  return { kind, sides: [a, b], avgVig: avg(vigs) };
}
