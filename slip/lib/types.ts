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
