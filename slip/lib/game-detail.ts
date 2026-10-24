// Everything the Game Detail page shows, plus the plain-English "Quick read".

import { edgeBets, getGame, type AssembledGame } from "./games";
import { safe } from "./http";
import { getLeague, type LeagueId } from "./leagues";
import { EDGE_THRESHOLD } from "./model";
import { formatAmerican, formatPct } from "./odds-math";
import { getTeamStats, seasonYearFor, type TeamResult } from "./providers/espn";
import { getRecentResults, type TeamOutlook } from "./team-context";
import type { Game, Injury, TeamSide } from "./types";

export interface Split {
  label: string;
  games: number;
  wins: number;
  losses: number;
  avgMargin: number;
}

export interface SeasonSplits {
  season: string;
  home: Split;
  road: Split;
}

export interface Ratings {
  games: number;
  pace?: number;
  offRating?: number;
  defRating?: number;
  ppg: number;
  oppPpg?: number;
}

export interface TeamDetail {
  team: TeamSide;
  outlook: TeamOutlook;
  injuries: Injury[];
  splits: SeasonSplits[];
  ratings: Ratings | null;
}

export interface GameDetail extends AssembledGame {
  away_: TeamDetail;
  home_: TeamDetail;
  /** Last 10 meetings, from the home team's side, newest first. */
  h2h: TeamResult[];
  quickRead: string[];
  sources: { schedule: string; odds: string; injuries: string };
}

const seasonLabel = (y: number) => `${y - 1}-${String(y).slice(2)}`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function split(label: string, rs: TeamResult[]): Split {
  const wins = rs.filter((r) => r.won).length;
  return {
    label,
    games: rs.length,
    wins,
    losses: rs.length - wins,
    avgMargin: avg(rs.map((r) => r.pointsFor - r.pointsAgainst)),
  };
}

function seasonSplits(results: TeamResult[], current: number): SeasonSplits[] {
  return [current, current - 1]
    .map((y) => {
      const rs = results.filter((r) => r.season === y);
      return { season: seasonLabel(y), home: split("Home", rs.filter((r) => r.home)), road: split("Away", rs.filter((r) => !r.home)) };
    })
    .filter((s) => s.home.games + s.road.games > 0);
}

const injuryRank = (s: string) => (/out/i.test(s) ? 0 : /doubt/i.test(s) ? 1 : /question/i.test(s) ? 2 : 3);

export function restLabel(o: TeamOutlook): string {
  if (o.restDays === undefined) return "No recent games";
  if (o.restDays === 0) return "Back-to-back";
  if (o.restDays > 6) return "Well rested";
  return `${o.restDays} day${o.restDays === 1 ? "" : "s"} rest`;
}

function quickRead(d: Omit<GameDetail, "quickRead">): string[] {
  const cands: { w: number; text: string }[] = [];
  const g = d.game;
  const a = d.away_;
  const h = d.home_;
  const name = (t: TeamDetail) => t.team.nickname || t.team.abbr;

  // Rest
  const aB2b = a.outlook.restDays === 0;
  const hB2b = h.outlook.restDays === 0;
  if (aB2b && hB2b) cands.push({ w: 2, text: "Both teams are on the second night of a back-to-back." });
  else if (aB2b || hB2b) {
    const [tired, fresh] = aB2b ? [a, h] : [h, a];
    cands.push({
      w: 3,
      text: `${name(tired)} on a back-to-back${tired.outlook.threeInFour ? " (3rd game in 4 nights)" : ""}; ${name(fresh)} ${restLabel(fresh.outlook).toLowerCase()}.`,
    });
  }

  // Injuries
  for (const t of [a, h]) {
    const out = t.injuries.filter((i) => /out|doubt/i.test(i.status));
    const q = t.injuries.filter((i) => !/out|doubt/i.test(i.status));
    const keyOut = t.outlook.keyInjuries.filter((i) => /out|doubt/i.test(i.status));
    if (keyOut.length) {
      cands.push({ w: 3.5, text: `${name(t)} without ${keyOut.map((i) => i.name).join(" and ")} — one of their top producers.` });
    } else if (out.length + q.length >= 3) {
      cands.push({ w: 2, text: `${name(t)}: ${out.length} out, ${q.length} questionable or day-to-day.` });
    }
  }

  // Form
  const fa = a.outlook.last10;
  const fh = h.outlook.last10;
  if (fa.games >= 5 && fh.games >= 5 && Math.abs(fa.wins - fh.wins) >= 3) {
    const [hot, cold] = fa.wins > fh.wins ? [a, h] : [h, a];
    const fhot = hot.outlook.last10;
    const fcold = cold.outlook.last10;
    cands.push({
      w: 2,
      text: `${name(hot)} ${fhot.wins}-${fhot.games - fhot.wins} in their last ${fhot.games} (${fhot.avgMargin >= 0 ? "+" : ""}${fhot.avgMargin.toFixed(1)}/game); ${name(cold)} ${fcold.wins}-${fcold.games - fcold.wins}.`,
    });
  }

  // BPI vs market
  const fair = g.markets.moneyline?.sides[1].fairProb;
  if (g.bpiHomeWin !== undefined && fair !== undefined && Math.abs(g.bpiHomeWin - fair) >= 0.05) {
    cands.push({
      w: 2.5,
      text: `ESPN BPI gives ${name(h)} ${formatPct(g.bpiHomeWin)} to win; the market says ${formatPct(fair)}.`,
    });
  }

  // Edge
  const edges = edgeBets([g]);
  if (edges.length) {
    const { bet } = edges[0];
    cands.push({
      w: 4,
      text: `Best edge: ${bet.label} at ${formatAmerican(bet.price.american)} (${bet.price.book}) — est. ${formatPct(bet.estProb)} vs ${formatPct(bet.impliedProb)} implied.`,
    });
  } else if (g.status.state === "pre") {
    cands.push({ w: 1, text: `No bet in this game beats the book by ${EDGE_THRESHOLD * 100}%+.` });
  }

  return cands
    .sort((x, y) => y.w - x.w)
    .slice(0, 3)
    .map((c) => c.text);
}

export async function getGameDetail(id: string, leagueId: LeagueId = "nba"): Promise<GameDetail | null> {
  const league = getLeague(leagueId);
  const base = await getGame(id, leagueId);
  if (!base) return null;
  const { game, away, home, injuries } = base;
  const season = seasonYearFor(game.startTime);

  const [h2hAll, statsA, statsH] = await Promise.all([
    getRecentResults(league, game.home.id, game.startTime, 3),
    safe(() => getTeamStats(league.espnPath, game.away.id)),
    safe(() => getTeamStats(league.espnPath, game.home.id)),
  ]);

  const detail = (team: TeamSide, outlook: TeamOutlook, stats: Awaited<ReturnType<typeof getTeamStats>>): TeamDetail => {
    const cur = outlook.results.filter((r) => r.season === season);
    const oppPpg = cur.length ? avg(cur.map((r) => r.pointsAgainst)) : undefined;
    return {
      team,
      outlook,
      injuries: injuries
        .filter((i) => i.teamId === team.id)
        .sort((x, y) => injuryRank(x.status) - injuryRank(y.status)),
      splits: seasonSplits(outlook.results, season),
      ratings: stats
        ? {
            games: stats.games,
            ppg: stats.ppg,
            oppPpg,
            pace: stats.pace,
            offRating: stats.pace ? (100 * stats.ppg) / stats.pace : undefined,
            defRating: stats.pace && oppPpg !== undefined ? (100 * oppPpg) / stats.pace : undefined,
          }
        : null,
    };
  };

  const partial = {
    ...base,
    away_: detail(game.away, away, statsA),
    home_: detail(game.home, home, statsH),
    h2h: h2hAll.filter((r) => r.opponentId === game.away.id).slice(-10).reverse(),
  };
  return { ...partial, quickRead: quickRead(partial) };
}

export type { Game };
