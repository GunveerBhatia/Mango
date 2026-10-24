// Pure odds math. No network, no React — easy to test and reuse.

/** American odds (-150, +130) → decimal odds (1.667, 2.30). */
export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0;
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

/** The win probability a price implies, including the book's cut (vig). */
export function impliedProbability(american: number): number {
  return american > 0
    ? 100 / (american + 100)
    : Math.abs(american) / (Math.abs(american) + 100);
}

/**
 * Remove the vig from a two-sided market so the two sides add up to 100%.
 * Returns [fairA, fairB, overround] where overround is e.g. 0.045 (4.5% vig).
 */
export function removeVig(americanA: number, americanB: number): [number, number, number] {
  const a = impliedProbability(americanA);
  const b = impliedProbability(americanB);
  const total = a + b;
  return [a / total, b / total, total - 1];
}

/** Text explaining how a price becomes a probability, for tooltips. */
export function impliedMath(american: number): string {
  const p = (impliedProbability(american) * 100).toFixed(1);
  return american > 0
    ? `100 ÷ (${american} + 100) = ${p}%`
    : `${Math.abs(american)} ÷ (${Math.abs(american)} + 100) = ${p}%`;
}

export function formatAmerican(american: number | undefined): string {
  if (american === undefined || !Number.isFinite(american)) return "—";
  return american > 0 ? `+${american}` : `${american}`;
}

export function formatPoint(point: number | undefined, signed = true): string {
  if (point === undefined) return "";
  if (!signed) return `${point}`;
  return point > 0 ? `+${point}` : `${point}`;
}

export function formatPct(p: number | undefined, digits = 0): string {
  if (p === undefined || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

export function parseAmerican(s: string | number | undefined | null): number | undefined {
  if (s === undefined || s === null) return undefined;
  if (typeof s === "number") return Number.isFinite(s) ? s : undefined;
  const t = s.trim().toUpperCase();
  if (t === "EVEN" || t === "EV") return 100;
  const n = Number(t.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}
