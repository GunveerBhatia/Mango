import type { BetKind } from "../types";

export interface Leg {
  /** Unique per bet, e.g. "401909853:spread:0" or "401909853:prop:4396971:pts:over". */
  id: string;
  kind: BetKind;
  league: string;
  gameId: string;
  startTime: string;
  /** "MIA @ CHA" */
  matchup: string;
  /** "MIA ML", "CHA +4.5", "Over 228.5", "Naz Reid Over 18.5 PTS" */
  label: string;
  /** 0 = away/over, 1 = home/under. */
  side: 0 | 1;
  /** Team the bet backs (moneyline/spread) or the player's team (props). */
  teamId?: string;
  american: number;
  book: string;
  point?: number;
  impliedProb: number;
  fairProb?: number;
  estProb?: number;
  athleteId?: string;
  athleteName?: string;
  stat?: string;
}

export type LegResult = "pending" | "won" | "lost" | "push";

export interface SavedLeg extends Leg {
  result: LegResult;
  closingAmerican?: number;
  closingPoint?: number;
  /** Final stat or score margin, when auto-checked. */
  actual?: number;
}

export interface SavedSlip {
  id: string;
  createdAt: string;
  legs: SavedLeg[];
  stake: number;
  decimalAtSave: number;
  bankrollAtSave?: number;
  /** 1 unit = 1% of bankroll when the slip was saved. */
  unitSize?: number;
}

export type StakeMode = "flat" | "kelly";

export interface Settings {
  bankroll?: number;
  stakeMode: StakeMode;
  /** Flat stake, % of bankroll (1–3). */
  flatPct: number;
  /** Fraction of full Kelly, e.g. 0.25. */
  kellyFraction: number;
  /** Parlay discipline: max legs in the builder. */
  maxLegs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  stakeMode: "flat",
  flatPct: 1,
  kellyFraction: 0.25,
  maxLegs: 4,
};

/** Hard cap: never stake more than this share of bankroll on one slip. */
export const MAX_STAKE_PCT = 0.05;
export const LOW_HIT_WARNING = 0.25;
