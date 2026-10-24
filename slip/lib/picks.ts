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
import { ODDS_MIN_CREDITS } from "./cache-config";
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
  id: "value" | "steady" | "boost" | "longshot";
  title: string;
  blurb: string;
  legs: PickLeg[];
  american: number;
  estHit: number;
  impliedHit: number;
  /** Payout multiple, e.g. 41 for +4000. */
  multiplier: number;
  /** Expected profit on a $10 stake, by our estimate. */
  ev10: number;
}

export interface TodaysPicks {
  parlays: PickParlay[];
  /** Why player props were or weren't included. */
  propsNote: string;
}

/** Expected return per $1 by our estimate: above 1 = value, below 1 = paying the book. */
const valueRatio = (c: PickLeg) => c.estProb * americanToDecimal(c.leg.american);
const dec = (c: PickLeg) => americanToDecimal(c.leg.american);
/** Legs much worse than fair aren't worth including in any tier. */
const MIN_VALUE_RATIO = 0.93;
const MAX_LEGS = 4;

function parlay(id: PickParlay["id"], title: string, blurb: string, legs: PickLeg[]): PickParlay {
  const dec = legs.reduce((p, l) => p * americanToDecimal(l.leg.american), 1);
  const estHit = legs.reduce((p, l) => p * l.estProb, 1);
  return {
    id,
    title,
    blurb,
    legs,
    american: decimalToAmerican(dec),
    multiplier: dec,
    estHit,
    impliedHit: legs.reduce((p, l) => p * l.leg.impliedProb, 1),
    ev10: 10 * (estHit * dec - 1),
  };
}

/** Best-first, one leg per game, until the parlay pays `target`x or hits `max` legs. */
function pickDistinct(cands: PickLeg[], max: number, opts: { minHit?: number; target?: number } = {}): PickLeg[] {
  const out: PickLeg[] = [];
  for (const c of cands) {
    if (out.length >= max) break;
    if (opts.target && out.reduce((p, o) => p * dec(o), 1) >= opts.target) break;
    if (out.some((o) => o.leg.gameId === c.leg.gameId)) continue;
    const hit = out.reduce((p, o) => p * o.estProb, c.estProb);
    if (out.length >= 2 && opts.minHit && hit < opts.minHit) continue;
    out.push(c);
  }
  return out;
}

const payout = (legs: PickLeg[]) => legs.reduce((p, l) => p * dec(l), 1);

/**
 * Up to four parlays at different risk levels. Each tier picks the best-value
 * legs (our estimate × payout) in its odds range, one per game.
 */
export function buildParlays(all: PickLeg[]): PickParlay[] {
  const out: PickParlay[] = [];
  const add = (p: PickParlay) => {
    const key = p.legs.map((l) => l.leg.id).sort().join("|");
    if (!out.some((o) => o.legs.map((l) => l.leg.id).sort().join("|") === key)) out.push(p);
  };
  const byValue = [...all].filter((c) => valueRatio(c) >= MIN_VALUE_RATIO).sort((a, b) => valueRatio(b) - valueRatio(a));

  // Value: only when bets genuinely beat their price by 3%+.
  const value = pickDistinct(
    all.filter((c) => c.edge >= EDGE_THRESHOLD).sort((a, b) => b.edge - a.edge),
    3,
    { minHit: 0.25 },
  );
  if (value.length >= 2) add(parlay("value", "Best value", "Every leg beats its price by 3%+ by our estimate.", value));

  // Steady: two likely legs, ~2–3x.
  const steady = pickDistinct(
    byValue.filter((c) => dec(c) <= 2.1 && c.estProb >= 0.5).sort((a, b) => b.estProb + valueRatio(b) - (a.estProb + valueRatio(a))),
    2,
  );
  if (steady.length === 2) add(parlay("steady", "Steady", "Two likely legs. Small payout, best chance to cash.", steady));

  // Boost: ~5–10x from three solid legs.
  const boost = pickDistinct(byValue.filter((c) => dec(c) >= 1.8 && dec(c) <= 3.5), 3, { target: 7 });
  if (boost.length >= 3 && payout(boost) >= 5) add(parlay("boost", "Boost", "A bigger payout from three solid legs.", boost));

  // Long shot: ~20–40x. Leans on underdogs (+120 and up) our model rates fairly,
  // topped up with other solid legs if there aren't enough.
  const dogs = pickDistinct(byValue.filter((c) => dec(c) >= 2.2 && dec(c) <= 6), MAX_LEGS, { target: 30 });
  const longshot =
    payout(dogs) >= 30 || dogs.length >= MAX_LEGS
      ? dogs
      : pickDistinct(
          [...dogs, ...byValue.filter((c) => dec(c) >= 1.85 && dec(c) < 2.2)],
          MAX_LEGS,
          { target: 30 },
        );
  if (longshot.length >= 3 && payout(longshot) >= 15)
    add(parlay("longshot", "Long shot", "Big payout, rarely hits. Fun money only.", longshot));

  return out;
}

function gameCandidates(games: AssembledGame[]): PickLeg[] {
  return games
    .filter((a) => a.game.status.state === "pre")
    .flatMap((a) =>
      Object.entries(a.game.bets).flatMap(([key, bet]) => {
        const leg = legFromGameBet(a.game, key);
        // No model yet (too few games): fall back to the market's vig-free odds.
        const est = bet.estProb ?? bet.fairProb;
        if (!leg || est === undefined) return [];
        return [{ leg, why: bet.why ?? [], edge: est - bet.impliedProb, estProb: est }];
      }),
    );
}

/** AUTO_PROPS: "points" scans points lines only (1 credit/game); "all" scans all five (5 credits/game). */
export function autoPropsMode(): "off" | "points" | "all" {
  const v = (process.env.AUTO_PROPS ?? "off").toLowerCase();
  if (v === "points") return "points";
  if (v === "all" || v === "on") return "all";
  return "off";
}

/** Player props for each game's stat leaders (see AUTO_PROPS in the README). */
async function propCandidates(
  leagueId: LeagueId,
  games: AssembledGame[],
  stats: PropStat[],
): Promise<PickLeg[]> {
  const league = getLeague(leagueId);
  const out: PickLeg[] = [];
  await Promise.all(
    games
      .filter((a) => a.game.status.state === "pre" && a.oddsEventId)
      .map(async (a) => {
        const ev = await safe(() =>
          getEventProps(league.oddsApiSport, a.oddsEventId!, stats.map((st) => PROP_MARKETS[st]), true),
        );
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
              for (const stat of stats) {
                const mk = PROP_MARKETS[stat];
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

export async function getTodaysPicks(
  games: AssembledGame[],
  leagueId: LeagueId = "nba",
  creditsRemaining?: string,
): Promise<TodaysPicks> {
  const cands = gameCandidates(games);
  const mode = autoPropsMode();
  let propsNote: string;
  if (!hasOddsApiKey()) {
    propsNote = "Player props need sportsbook lines: add an ODDS_API_KEY and set AUTO_PROPS=points.";
  } else if (mode === "off") {
    propsNote = "Player props are off to save Odds API credits. Set AUTO_PROPS=points to include them.";
  } else if (creditsRemaining !== undefined && Number(creditsRemaining) < ODDS_MIN_CREDITS) {
    propsNote = `Player props paused: only ${creditsRemaining} Odds API credits left this month.`;
  } else {
    const stats: PropStat[] = mode === "points" ? ["pts"] : ["pts", "reb", "ast", "pra", "threes"];
    cands.push(...(await propCandidates(leagueId, games, stats)));
    propsNote =
      mode === "points"
        ? "Includes points props for each team's top players."
        : "Includes player props for each team's top scorers, rebounders and passers.";
  }
  return { parlays: buildParlays(cands), propsNote };
}
