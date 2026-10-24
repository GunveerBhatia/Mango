// League-agnostic shapes the UI renders. Providers translate raw API data into these.

export interface Price {
  /** Book display name, e.g. "DraftKings". */
  book: string;
  bookKey: string;
  american: number;
  /** Spread or total line, when relevant. */
  point?: number;
}

export interface MarketSide {
  /** "MIA", "Over", … */
  label: string;
  /** Main line for this side (most common across books). */
  point?: number;
  /** Best price available at the main line. */
  best: Price;
  /** Every book's price at the main line, best first. */
  all: Price[];
  /** Vig-free probability, averaged across books that list both sides. */
  fairProb?: number;
}

export type MarketKind = "moneyline" | "spread" | "total";

export interface Market {
  kind: MarketKind;
  /** [away, home] for moneyline/spread, [over, under] for totals. */
  sides: [MarketSide, MarketSide];
  /** Average vig across books, e.g. 0.045. */
  avgVig?: number;
}

export type TagTone = "neutral" | "bad" | "good";

export interface Tag {
  label: string;
  tone: TagTone;
  detail?: string;
}

export interface TeamLeader {
  athleteId?: string;
  name: string;
  category: string;
  value: string;
}

export interface TeamSide {
  id: string;
  abbr: string;
  name: string;
  /** Nickname only, e.g. "Heat". */
  nickname: string;
  logo?: string;
  record?: string;
  homeRecord?: string;
  roadRecord?: string;
  score?: number;
  leaders: TeamLeader[];
  tags: Tag[];
}

export interface GameStatus {
  state: "pre" | "in" | "post";
  detail: string;
}

export interface OddsSource {
  name: string;
  bookCount: number;
  fetchedAt?: string;
}

export type BetKind = MarketKind | "prop";

/** One bettable side with everything needed to judge it and add it to a slip. */
export interface BetOption {
  key: string;
  kind: BetKind;
  label: string;
  price: Price;
  /** Probability the price implies, vig included — what you actually pay. */
  impliedProb: number;
  /** Market's vig-free probability. */
  fairProb?: number;
  /** Slip's raw model probability, before blending with the market. */
  modelProb?: number;
  /** Blended estimate used for edges. */
  estProb?: number;
  /** estProb − impliedProb. */
  edge?: number;
}

export interface Game {
  id: string;
  league: string;
  startTime: string;
  status: GameStatus;
  away: TeamSide;
  home: TeamSide;
  markets: {
    moneyline?: Market;
    spread?: Market;
    total?: Market;
  };
  oddsSource?: OddsSource;
  /** Keyed "moneyline:0", "spread:1", "total:0"… (0 = away/over). */
  bets: Record<string, BetOption>;
  /** ESPN BPI win probability for the home team, if published. */
  bpiHomeWin?: number;
  modelHomeWin?: number;
  modelHomeMargin?: number;
  modelTotal?: number;
}

export type InjuryStatus = "Out" | "Doubtful" | "Questionable" | "Day-To-Day" | "Probable" | string;

export interface Injury {
  athleteId?: string;
  name: string;
  teamId: string;
  status: InjuryStatus;
  detail?: string;
  date?: string;
}
