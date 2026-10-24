// Builds game view models by combining schedule, odds, rest, injuries and the model.

import { gameBets } from "./bets";
import { safe } from "./http";
import { getLeague, type LeagueConfig, type LeagueId } from "./leagues";
import { buildMarket, type BookQuote } from "./markets";
import { EDGE_THRESHOLD, modelGame, type GameModel } from "./model";
import { explainGameBets } from "./explain";
import { getScoreboard, getSummary, seasonYearFor, type EspnGame } from "./providers/espn";
import { getInjuries, INJURY_SOURCE } from "./providers/injuries";
import { findEvent, getOddsFeed, hasOddsApiKey, quotesForEvent, type OddsFeed } from "./providers/odds-api";
import { getTeamOutlook, type TeamOutlook } from "./team-context";
import type { BetOption, Game, Injury } from "./types";

export interface GamesResult {
  day: string | null;
  games: Game[];
  sources: { schedule: string; odds: string; injuries: string };
  /** Plain-English notes about missing or degraded data. */
  notices: string[];
  oddsCreditsRemaining?: string;
  /** Full context per game (outlooks, model) for building picks on the server. */
  assembled: AssembledGame[];
}

export interface AssembledGame {
  game: Game;
  away: TeamOutlook;
  home: TeamOutlook;
  model: GameModel | null;
  oddsEventId?: string;
  venueCity?: string;
}

export async function assembleGame(
  league: LeagueConfig,
  g: EspnGame,
  injuries: Injury[],
  feed: OddsFeed | null,
): Promise<AssembledGame> {
  const ev = feed ? findEvent(feed.events, g.away.nickname, g.home.nickname, g.startTime) : undefined;
  const fromFeed = ev && ev.bookmakers.length > 0 ? quotesForEvent(ev) : null;
  const q: { moneyline: BookQuote[]; spread: BookQuote[]; total: BookQuote[] } =
    fromFeed ??
    (g.odds
      ? { moneyline: [g.odds.moneyline], spread: [g.odds.spread], total: [g.odds.total] }
      : { moneyline: [], spread: [], total: [] });

  const [away, home, summary] = await Promise.all([
    getTeamOutlook(league, g.away.id, g.startTime, false, injuries, g.away.leaders),
    getTeamOutlook(league, g.home.id, g.startTime, true, injuries, g.home.leaders),
    g.status.state === "pre" ? safe(() => getSummary(league.espnPath, g.id)) : Promise.resolve(null),
  ]);

  const markets = {
    moneyline: buildMarket("moneyline", [g.away.abbr, g.home.abbr], q.moneyline),
    spread: buildMarket("spread", [g.away.abbr, g.home.abbr], q.spread),
    total: buildMarket("total", ["Over", "Under"], q.total),
  };
  const bpiHomeWin = summary?.predictor?.home;
  // Edges only make sense before tip-off.
  const model = g.status.state === "pre" ? modelGame(away, home, bpiHomeWin) : null;
  const hasOdds = q.moneyline.length + q.spread.length + q.total.length > 0;

  const game: Game = {
    id: g.id,
    league: league.id,
    startTime: g.startTime,
    status: g.status,
    away: { ...g.away, tags: away.tags },
    home: { ...g.home, tags: home.tags },
    markets,
    oddsSource: hasOdds
      ? fromFeed
        ? { name: "The Odds API", bookCount: ev!.bookmakers.length, fetchedAt: feed?.fetchedAt }
        : { name: `${g.odds?.provider ?? "ESPN"} via ESPN`, bookCount: 1 }
      : undefined,
    bets: gameBets(g.id, markets, model),
    bpiHomeWin,
    modelHomeWin: model?.homeWin,
    modelHomeMargin: model?.homeMargin,
    modelTotal: model?.expectedTotal,
  };
  explainGameBets(game, away, home, model, seasonYearFor(g.startTime));
  return { game, away, home, model, oddsEventId: ev?.id, venueCity: g.venueCity ?? summary?.venueCity };
}

async function loadShared(league: LeagueConfig) {
  return Promise.all([
    safe(() => getInjuries(league)),
    hasOddsApiKey() ? safe(() => getOddsFeed(league.oddsApiSport)) : Promise.resolve(null),
  ]);
}

function oddsNotices(feed: OddsFeed | null): string[] {
  if (!hasOddsApiKey()) return ["Add an ODDS_API_KEY to compare prices across every sportsbook."];
  if (!feed) return ["The Odds API didn't respond — showing a single book from ESPN instead."];
  return [];
}

export async function getTodaysGames(leagueId: LeagueId = "nba"): Promise<GamesResult> {
  const league = getLeague(leagueId);
  const [board, [injuries, feed]] = await Promise.all([safe(() => getScoreboard(league.espnPath)), loadShared(league)]);

  const sources = {
    schedule: "ESPN",
    odds: feed ? "The Odds API" : "ESPN (single book)",
    injuries: INJURY_SOURCE,
  };
  if (!board) {
    return {
      day: null,
      games: [],
      sources,
      notices: ["Couldn't reach the schedule source. Try again in a few minutes."],
      assembled: [],
    };
  }
  const notices = oddsNotices(feed);
  if (!injuries) notices.push("Injury report unavailable right now — injury tags are hidden.");

  const games = await Promise.all(board.games.map((g) => assembleGame(league, g, injuries ?? [], feed)));
  return {
    day: board.day,
    games: games.map((a) => a.game),
    sources,
    notices,
    oddsCreditsRemaining: feed?.remaining,
    assembled: games,
  };
}

/** Every bet on the board that clears the edge threshold, best first. */
export function edgeBets(games: Game[]): { game: Game; bet: BetOption }[] {
  return games
    .filter((g) => g.status.state === "pre")
    .flatMap((game) => Object.values(game.bets).map((bet) => ({ game, bet })))
    .filter(({ bet }) => (bet.edge ?? 0) >= EDGE_THRESHOLD)
    .sort((a, b) => (b.bet.edge ?? 0) - (a.bet.edge ?? 0));
}

/** One game by ESPN id: from today's board if it's there, else from its summary. */
export async function getGame(
  id: string,
  leagueId: LeagueId = "nba",
): Promise<(AssembledGame & { injuries: Injury[]; sources: GamesResult["sources"] }) | null> {
  const league = getLeague(leagueId);
  const [board, [injuries, feed]] = await Promise.all([safe(() => getScoreboard(league.espnPath)), loadShared(league)]);
  let g: EspnGame | undefined = board?.games.find((x) => x.id === id);
  if (!g) {
    const s = await safe(() => getSummary(league.espnPath, id));
    const a = s?.teams.find((t) => !t.home);
    const h = s?.teams.find((t) => t.home);
    if (!s || !a || !h || !s.startTime) return null;
    const team = (t: typeof a) => ({ ...t, leaders: [] });
    g = {
      id,
      startTime: s.startTime,
      status: s.status,
      away: team(a),
      home: team(h),
      odds: s.odds,
      venueCity: s.venueCity,
    };
  }
  const assembled = await assembleGame(league, g, injuries ?? [], feed);
  return {
    ...assembled,
    injuries: injuries ?? [],
    sources: { schedule: "ESPN", odds: assembled.game.oddsSource?.name ?? "none", injuries: INJURY_SOURCE },
  };
}
