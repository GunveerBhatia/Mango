// Every league-specific detail lives here. To add a league (NFL, MLB, NHL…),
// add an entry and the rest of the app picks it up.

export type LeagueId = "nba";

export interface LeagueConfig {
  id: LeagueId;
  name: string;
  /** ESPN public API path segment, e.g. "basketball/nba". */
  espnPath: string;
  /** The Odds API sport key, e.g. "basketball_nba". */
  oddsApiSport: string;
  /** Which ESPN team-leader categories count as a "key player". */
  keyLeaderCategories: string[];
}

export const LEAGUES: Record<LeagueId, LeagueConfig> = {
  nba: {
    id: "nba",
    name: "NBA",
    espnPath: "basketball/nba",
    oddsApiSport: "basketball_nba",
    keyLeaderCategories: ["pointsPerGame", "reboundsPerGame", "assistsPerGame"],
  },
};

export const DEFAULT_LEAGUE: LeagueId = "nba";

export function getLeague(id: string | undefined): LeagueConfig {
  return LEAGUES[(id as LeagueId) ?? DEFAULT_LEAGUE] ?? LEAGUES[DEFAULT_LEAGUE];
}
