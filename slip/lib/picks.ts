// Builds today's suggested parlays from every bet our model can price.
// Rules: never "locks"; only legs where our estimate beats the price; one leg per game
// (same-game legs are correlated); 2–3 legs; every leg carries its reasons.

import { betOption } from "./bets";
import { explainProp } from "./explain";
import type { AssembledGame } from "./games";
import { safe } from "./http";
import { getLeague, type LeagueId } from "./leagues";
import { buildMarket } from "./markets";
import { EDGE_THRESHOLD, PROP_SHORT, modelProp, propSample, type PropStat } from "./model";
import { americanToDecimal, decimalToAmerican } from "./odds-math";
import { getPlayerGames, seasonYearFor } from "./providers/espn";
import { getEventProps, hasOddsApiKey, PROP_MARKETS, propQuotes } from "./providers/odds-api";
import { fromBet, legFromGameBet } from "./slip/legs";
import type { Leg } from "./slip/types";

export interface PickLeg {
  leg: Leg;
  why: string[];
  edge: number;
  estProb: number;
}

export interface PickParlay {
  id: "value" | "safer";
  title: string;
  blurb: string;
  legs: PickLeg[];
  american: number;
  estHit: number;
  impliedHit: number;
  /** Expected profit on a $10 stake, by our estimate. */
  ev10: number;
}

export interface TodaysPicks {
  parlays: PickParlay[];
  /** Why player props were or weren't included. */
  propsNote: string;
}

const SAFER_MIN_EDGE = 0.01;

function parlay(id: PickParlay["id"], title: string, blurb: string, legs: PickLeg[]): PickParlay {
  const dec = legs.reduce((p, l) => p * americanToDecimal(l.leg.american), 1);
  const estHit = legs.reduce((p, l) => p * l.estProb, 1);
  return {
    id,
    title,
    blurb,
    legs,
    american: decimalToAmerican(dec),
    estHit,
    impliedHit: legs.reduce((p, l) => p * l.leg.impliedProb, 1),
    ev10: 10 * (estHit * dec - 1),
  };
}

/** Greedy: best-first, one leg per game, stop at `max` legs. */
function pickDistinct(cands: PickLeg[], max: number, minHit = 0): PickLeg[] {
  const out: PickLeg[] = [];
  for (const c of cands) {
    if (out.length >= max) break;
    if (out.some((o) => o.leg.gameId === c.leg.gameId)) continue;
    const hit = out.reduce((p, o) => p * o.estProb, c.estProb);
    if (out.length >= 2 && hit < minHit) continue;
    out.push(c);
  }
  return out;
}

export function buildParlays(cands: PickLeg[]): PickParlay[] {
  const out: PickParlay[] = [];
  const value = pickDistinct(
    cands.filter((c) => c.edge >= EDGE_THRESHOLD).sort((a, b) => b.edge - a.edge),
    3,
    0.25,
  );
  if (value.length >= 2) {
    out.push(parlay("value", "Best value", "The legs our model rates highest against their price.", value));
  }
  const safer = pickDistinct(
    cands.filter((c) => c.edge >= SAFER_MIN_EDGE).sort((a, b) => b.estProb - a.estProb),
    2,
  );
  const same = value.length === safer.length && safer.every((s) => value.some((v) => v.leg.id === s.leg.id));
  if (safer.length === 2 && !same) {
    out.push(parlay("safer", "Higher hit chance", "The most likely legs where our estimate still beats the price.", safer));
  }
  return out;
}

function gameCandidates(games: AssembledGame[]): PickLeg[] {
  return games
    .filter((a) => a.game.status.state === "pre")
    .flatMap((a) =>
      Object.entries(a.game.bets).flatMap(([key, bet]) => {
        const leg = legFromGameBet(a.game, key);
        if (!leg || bet.estProb === undefined || bet.edge === undefined) return [];
        return [{ leg, why: bet.why ?? [], edge: bet.edge, estProb: bet.estProb }];
      }),
    );
}

/**
 * Player props for each game's stat leaders. Costs 5 Odds API credits per game,
 * so it only runs with AUTO_PROPS=on (see README).
 */
async function propCandidates(leagueId: LeagueId, games: AssembledGame[]): Promise<PickLeg[]> {
  const league = getLeague(leagueId);
  const out: PickLeg[] = [];
  await Promise.all(
    games
      .filter((a) => a.game.status.state === "pre" && a.oddsEventId)
      .map(async (a) => {
        const ev = await safe(() => getEventProps(league.oddsApiSport, a.oddsEventId!));
        if (!ev) return;
        const sides = [
          { team: a.game.away, opp: a.game.home },
          { team: a.game.home, opp: a.game.away },
        ];
        await Promise.all(
          sides.flatMap(({ team, opp }) => {
            const players = new Map(team.leaders.filter((l) => l.athleteId).map((l) => [l.athleteId!, l.name]));
            return [...players].map(async ([athleteId, name]) => {
              const season = seasonYearFor(a.game.startTime);
              const logs = await Promise.all(
                [season - 1, season].map((s) => safe(() => getPlayerGames(league.espnPath, athleteId, s, s === season))),
              );
              const sample = propSample(logs.flatMap((l) => l ?? []), team.id, team.abbr);
              let best: PickLeg | undefined;
              for (const [stat, mk] of Object.entries(PROP_MARKETS) as [PropStat, string][]) {
                const m = buildMarket("total", ["Over", "Under"], propQuotes(ev, mk, name));
                const line = m?.sides[0].point;
                if (!m || line === undefined) continue;
                const model = modelProp(sample.games, stat, line);
                if (!model) continue;
                for (const idx of [0, 1] as const) {
                  const word = idx === 0 ? "Over" : "Under";
                  const bet = betOption(
                    `${a.game.id}:prop:${athleteId}:${stat}:${idx === 0 ? "over" : "under"}`,
                    "prop",
                    `${name} ${word} ${line} ${PROP_SHORT[stat]}`,
                    m,
                    idx,
                    idx === 0 ? model.overProb : 1 - model.overProb,
                  );
                  if (bet.estProb === undefined || bet.edge === undefined) continue;
                  if (best && bet.edge <= best.edge) continue;
                  best = {
                    leg: fromBet(bet, {
                      league: a.game.league,
                      gameId: a.game.id,
                      startTime: a.game.startTime,
                      matchup: `${a.game.away.abbr} @ ${a.game.home.abbr}`,
                      side: idx,
                      teamId: team.id,
                      athleteId,
                      athleteName: name,
                      stat,
                    }),
                    why: explainProp(bet, sample, model, stat, line, idx, opp.id, opp.abbr, team.id),
                    edge: bet.edge,
                    estProb: bet.estProb,
                  };
                }
              }
              if (best) out.push(best);
            });
          }),
        );
      }),
  );
  return out;
}

export async function getTodaysPicks(games: AssembledGame[], leagueId: LeagueId = "nba"): Promise<TodaysPicks> {
  const cands = gameCandidates(games);
  let propsNote: string;
  if (!hasOddsApiKey()) {
    propsNote = "Player props need sportsbook lines: add an ODDS_API_KEY and set AUTO_PROPS=on.";
  } else if (process.env.AUTO_PROPS !== "on") {
    propsNote = "Player props are off to save Odds API credits. Set AUTO_PROPS=on to include them.";
  } else {
    cands.push(...(await propCandidates(leagueId, games)));
    propsNote = "Includes player props for each team's top scorers, rebounders and passers.";
  }
  return { parlays: buildParlays(cands), propsNote };
}
