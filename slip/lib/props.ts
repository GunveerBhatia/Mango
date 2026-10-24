// Data for the Player Props pages.

import { safe } from "./http";
import { getLeague, type LeagueId } from "./leagues";
import { buildMarket } from "./markets";
import type { PropStat } from "./model";
import {
  getAthlete,
  getPlayerGames,
  getRoster,
  getScoreboard,
  seasonYearFor,
  type Athlete,
  type EspnGame,
  type PlayerGame,
  type RosterPlayer,
} from "./providers/espn";
import { getInjuries } from "./providers/injuries";
import { findEvent, getEventProps, getOddsFeed, hasOddsApiKey, PROP_MARKETS, propQuotes } from "./providers/odds-api";
import type { Market } from "./types";

export interface PropsIndexPlayer extends RosterPlayer {
  teamAbbr: string;
  injury?: string;
}

export interface PropsIndexGame {
  id: string;
  startTime: string;
  label: string;
  players: PropsIndexPlayer[];
}

export async function getPropsIndex(leagueId: LeagueId = "nba"): Promise<PropsIndexGame[] | null> {
  const league = getLeague(leagueId);
  const [board, injuries] = await Promise.all([
    safe(() => getScoreboard(league.espnPath)),
    safe(() => getInjuries(league)),
  ]);
  if (!board) return null;
  const upcoming = board.games.filter((g) => g.status.state !== "post");
  return Promise.all(
    upcoming.map(async (g) => {
      const teams = [g.away, g.home];
      const rosters = await Promise.all(teams.map((t) => safe(() => getRoster(league.espnPath, t.id))));
      const players = teams.flatMap((t, i) =>
        (rosters[i] ?? []).map((p) => ({
          ...p,
          teamAbbr: t.abbr,
          injury: injuries?.find((inj) => inj.athleteId === p.id || inj.name === p.name)?.status,
        })),
      );
      return { id: g.id, startTime: g.startTime, label: `${g.away.abbr} @ ${g.home.abbr}`, players };
    }),
  );
}

export interface PlayerPropsData {
  athlete: Athlete;
  /** Tonight's game, if the player's team plays today. */
  game?: {
    id: string;
    startTime: string;
    matchup: string;
    home: boolean;
    opponentId: string;
    opponentAbbr: string;
    started: boolean;
  };
  injury?: string;
  /** Regular-season games, this season and last, oldest first. */
  games: PlayerGame[];
  /** Book lines per stat (over = side 0, under = side 1). */
  markets: Partial<Record<PropStat, Market>>;
  oddsNote: string;
}

export async function getPlayerProps(athleteId: string, leagueId: LeagueId = "nba"): Promise<PlayerPropsData | null> {
  const league = getLeague(leagueId);
  const athlete = await safe(() => getAthlete(league.espnPath, athleteId));
  if (!athlete) return null;

  const [board, injuries] = await Promise.all([
    safe(() => getScoreboard(league.espnPath)),
    safe(() => getInjuries(league)),
  ]);
  const g: EspnGame | undefined = board?.games.find(
    (x) => x.away.id === athlete.teamId || x.home.id === athlete.teamId,
  );
  const season = seasonYearFor(g?.startTime ?? new Date().toISOString());
  const logs = await Promise.all(
    [season - 1, season].map((s) => safe(() => getPlayerGames(league.espnPath, athleteId, s, s === season))),
  );
  const games = logs.flatMap((l) => l ?? []).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  let markets: PlayerPropsData["markets"] = {};
  let oddsNote = "No sportsbook line — set your own below.";
  if (g && hasOddsApiKey()) {
    const feed = await safe(() => getOddsFeed(league.oddsApiSport));
    const ev = feed ? findEvent(feed.events, g.away.nickname, g.home.nickname, g.startTime) : undefined;
    const props = ev ? await safe(() => getEventProps(league.oddsApiSport, ev.id)) : null;
    if (props) {
      for (const [stat, key] of Object.entries(PROP_MARKETS) as [PropStat, string][]) {
        const m = buildMarket("total", ["Over", "Under"], propQuotes(props, key, athlete.name));
        if (m) markets = { ...markets, [stat]: m };
      }
      oddsNote = "Lines: The Odds API";
    } else {
      oddsNote = "Couldn't load sportsbook props right now — set your own line below.";
    }
  } else if (g) {
    oddsNote = "Add an ODDS_API_KEY for sportsbook prop lines. Meanwhile, set your own line.";
  }

  const isHome = g ? g.home.id === athlete.teamId : false;
  const opp = g ? (isHome ? g.away : g.home) : undefined;
  return {
    athlete,
    game:
      g && opp
        ? {
            id: g.id,
            startTime: g.startTime,
            matchup: `${g.away.abbr} @ ${g.home.abbr}`,
            home: isHome,
            opponentId: opp.id,
            opponentAbbr: opp.abbr,
            started: g.status.state !== "pre",
          }
        : undefined,
    injury: injuries?.find((i) => i.athleteId === athleteId || i.name === athlete.name)?.status,
    games,
    markets,
    oddsNote,
  };
}
