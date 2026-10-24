// Builds the Today's Games view model by combining schedule, odds, rest and injuries.

import { getLeague, type LeagueId } from "./leagues";
import { buildMarket, type BookQuote } from "./markets";
import { getScoreboard, type EspnGame } from "./providers/espn";
import { getInjuries, INJURY_SOURCE } from "./providers/injuries";
import { findEvent, getOddsFeed, hasOddsApiKey, quotesForEvent, type OddsFeed } from "./providers/odds-api";
import { safe } from "./http";
import type { Game, Injury, Tag, TeamSide } from "./types";

export interface GamesResult {
  day: string | null;
  games: Game[];
  sources: { schedule: string; odds: string; injuries: string };
  /** Plain-English notes about missing or degraded data. */
  notices: string[];
  oddsCreditsRemaining?: string;
}

/** YYYY-MM-DD → YYYYMMDD for the day `offset` days away. */
function shiftDay(day: string, offset: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function restTags(teamId: string, prevDays: (EspnGame[] | null)[]): Tag[] {
  // prevDays[0] = yesterday, [1] = two days ago, [2] = three days ago.
  const played = prevDays.map((day) =>
    day ? day.some((g) => g.away.id === teamId || g.home.id === teamId) : false,
  );
  const tags: Tag[] = [];
  if (played[0]) tags.push({ label: "Back-to-back", tone: "bad", detail: "Played last night" });
  const recent = played.filter(Boolean).length;
  if (recent >= 2) tags.push({ label: "3+ in 4 nights", tone: "bad", detail: `${recent + 1} games in 4 nights incl. tonight` });
  return tags;
}

function injuryTags(team: Omit<TeamSide, "tags">, injuries: Injury[], keyCategories: string[]): Tag[] {
  const teamInjuries = injuries.filter((i) => i.teamId === team.id);
  const keyPlayers = team.leaders.filter((l) => keyCategories.includes(l.category));
  const out = new Map<string, Injury>();
  for (const leader of keyPlayers) {
    const hit = teamInjuries.find(
      (i) => (leader.athleteId && i.athleteId === leader.athleteId) || i.name === leader.name,
    );
    if (hit && /out|doubtful/i.test(hit.status)) out.set(hit.name, hit);
  }
  return [...out.values()].map((i) => ({
    label: `Key player out · ${i.name.split(" ").slice(-1)[0]}`,
    tone: "bad" as const,
    detail: `${i.name} (${i.status})`,
  }));
}

function oddsFromFeed(g: EspnGame, feed: OddsFeed | null): { quotes: ReturnType<typeof quotesForEvent>; books: number } | null {
  if (!feed) return null;
  const ev = findEvent(feed.events, g.away.nickname, g.home.nickname, g.startTime);
  if (!ev || ev.bookmakers.length === 0) return null;
  return { quotes: quotesForEvent(ev), books: ev.bookmakers.length };
}

export async function getTodaysGames(leagueId: LeagueId = "nba"): Promise<GamesResult> {
  const league = getLeague(leagueId);
  const notices: string[] = [];

  const [board, injuries, feed] = await Promise.all([
    safe(() => getScoreboard(league.espnPath)),
    safe(() => getInjuries(league)),
    hasOddsApiKey() ? safe(() => getOddsFeed(league.oddsApiSport)) : Promise.resolve(null),
  ]);

  const sources = {
    schedule: "ESPN",
    odds: feed ? "The Odds API" : "ESPN (single book)",
    injuries: INJURY_SOURCE,
  };

  if (!board) {
    notices.push("Couldn't reach the schedule source. Try again in a few minutes.");
    return { day: null, games: [], sources, notices };
  }
  if (!injuries) notices.push("Injury report unavailable right now — injury tags are hidden.");
  if (!hasOddsApiKey()) notices.push("Add an ODDS_API_KEY to compare prices across every sportsbook.");
  else if (!feed) notices.push("The Odds API didn't respond — showing a single book from ESPN instead.");

  const prevDays = await Promise.all(
    [-1, -2, -3].map((o) => safe(() => getScoreboard(league.espnPath, shiftDay(board.day, o)).then((b) => b.games))),
  );

  const games: Game[] = board.games.map((g) => {
    const fromFeed = oddsFromFeed(g, feed);
    const q: { moneyline: BookQuote[]; spread: BookQuote[]; total: BookQuote[] } =
      fromFeed?.quotes ??
      (g.odds
        ? { moneyline: [g.odds.moneyline], spread: [g.odds.spread], total: [g.odds.total] }
        : { moneyline: [], spread: [], total: [] });

    const teamSide = (t: EspnGame["away"], isHome: boolean): TeamSide => ({
      ...t,
      tags: [
        ...(isHome ? [{ label: "Home", tone: "neutral" as const }] : []),
        ...restTags(t.id, prevDays),
        ...injuryTags(t, injuries ?? [], league.keyLeaderCategories),
      ],
    });

    const hasOdds = q.moneyline.length + q.spread.length + q.total.length > 0;
    return {
      id: g.id,
      league: league.id,
      startTime: g.startTime,
      status: g.status,
      away: teamSide(g.away, false),
      home: teamSide(g.home, true),
      markets: {
        moneyline: buildMarket("moneyline", [g.away.abbr, g.home.abbr], q.moneyline),
        spread: buildMarket("spread", [g.away.abbr, g.home.abbr], q.spread),
        total: buildMarket("total", ["Over", "Under"], q.total),
      },
      oddsSource: hasOdds
        ? fromFeed
          ? { name: "The Odds API", bookCount: fromFeed.books, fetchedAt: feed?.fetchedAt }
          : { name: `${g.odds?.provider ?? "ESPN"} via ESPN`, bookCount: 1 }
        : undefined,
    };
  });

  return {
    day: board.day,
    games,
    sources,
    notices,
    oddsCreditsRemaining: feed?.remaining,
  };
}
