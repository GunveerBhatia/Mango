import type { BetOption, Game } from "../types";
import type { Leg } from "./types";

/** Build a slip leg from a game bet ("moneyline:0", "spread:1", …). Runs on the server. */
export function legFromGameBet(game: Game, key: string): Leg | undefined {
  const bet = game.bets[key];
  if (!bet) return undefined;
  const [kind, idxStr] = key.split(":");
  const side = Number(idxStr) as 0 | 1;
  const teamId = kind === "total" ? undefined : side === 0 ? game.away.id : game.home.id;
  return fromBet(bet, {
    league: game.league,
    gameId: game.id,
    startTime: game.startTime,
    matchup: `${game.away.abbr} @ ${game.home.abbr}`,
    side,
    teamId,
  });
}

export function fromBet(
  bet: BetOption,
  ctx: Pick<Leg, "league" | "gameId" | "startTime" | "matchup" | "side" | "teamId"> &
    Partial<Pick<Leg, "athleteId" | "athleteName" | "stat">>,
): Leg {
  return {
    id: bet.key,
    kind: bet.kind,
    label: bet.label,
    american: bet.price.american,
    book: bet.price.book,
    point: bet.price.point,
    impliedProb: bet.impliedProb,
    fairProb: bet.fairProb,
    estProb: bet.estProb,
    ...ctx,
  };
}
