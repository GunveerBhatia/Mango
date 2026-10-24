// Plain-English "why" bullets for each bet, built from the same numbers the model uses.

import { MODEL_WEIGHT, type GameModel, type PropModel, type PropSample, type PropStat, PROP_SHORT, statValue } from "./model";
import { formatAmerican, formatPct } from "./odds-math";
import type { PlayerGame } from "./providers/espn";
import type { TeamOutlook } from "./team-context";
import type { BetOption, Game } from "./types";

const signed = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

function priceLine(bet: BetOption): string {
  const est = bet.estProb !== undefined ? ` Our estimate: ${formatPct(bet.estProb)}.` : "";
  return `Book: ${formatPct(bet.impliedProb)} to win at ${formatAmerican(bet.price.american)} (${bet.price.book}).${est}`;
}

function formLine(abbr: string, o: TeamOutlook, season: number): string {
  const f = o.last10;
  const lastSeason = o.results.slice(-10).filter((r) => r.season < season).length;
  return `${abbr} last ${f.games}: ${f.wins}-${f.games - f.wins}, ${signed(f.avgMargin)} pts/game${
    lastSeason ? ` (${lastSeason} from last season — rosters may have changed)` : ""
  }.`;
}

export function explainGameBets(
  game: Game,
  away: TeamOutlook,
  home: TeamOutlook,
  model: GameModel | null,
  season: number,
): void {
  const A = game.away.abbr;
  const H = game.home.abbr;
  const outs = [...away.keyInjuries, ...home.keyInjuries].filter((i) => /out|doubt/i.test(i.status));
  const factors = model
    ? [...model.parts]
        .filter((p) => !p.label.startsWith("blended"))
        .sort((x, y) => Math.abs(y.points) - Math.abs(x.points))
        .slice(0, 3)
        .filter((p) => Math.abs(p.points) >= 0.5)
        .map((p) => `${p.label[0].toUpperCase()}${p.label.slice(1)}: ${Math.abs(p.points).toFixed(1)} pts toward ${p.points > 0 ? H : A}.`)
    : [];

  for (const [key, bet] of Object.entries(game.bets)) {
    const [kind, idx] = key.split(":");
    const why = [priceLine(bet)];
    if (model) {
      if (kind === "total") {
        const line = bet.price.point;
        why.push(
          `Model expects ${model.expectedTotal?.toFixed(1) ?? "—"} total points${line !== undefined ? ` vs a line of ${line}` : ""}.`,
        );
        why.push(
          `${A} last 10: ${away.last10.avgFor.toFixed(1)} scored, ${away.last10.avgAgainst.toFixed(1)} allowed. ${H}: ${home.last10.avgFor.toFixed(1)} scored, ${home.last10.avgAgainst.toFixed(1)} allowed.`,
        );
        if (outs.length) why.push(`Key players out (${outs.map((i) => i.name).join(", ")}) usually mean fewer points.`);
      } else {
        const lead = model.homeMargin >= 0 ? H : A;
        why.push(`Model expects ${lead} to win by ${Math.abs(model.homeMargin).toFixed(1)}.`);
        if (kind === "spread" && bet.price.point !== undefined) {
          const team = idx === "0" ? A : H;
          const p = bet.price.point;
          why.push(p < 0 ? `${team} must win by ${Math.ceil(-p)}+ to cover.` : `${team} covers by winning or losing by ${Math.floor(p)} or less.`);
        }
        why.push(...factors);
        why.push(formLine(A, away, season), formLine(H, home, season));
        if (game.bpiHomeWin !== undefined) why.push(`ESPN BPI gives ${H} ${formatPct(game.bpiHomeWin)} to win (60% of our model).`);
        for (const i of outs) why.push(`${i.name} is ${i.status.toLowerCase()}.`);
      }
      why.push(`Final estimate = ${MODEL_WEIGHT * 100}% our model + ${100 - MODEL_WEIGHT * 100}% the market's vig-free odds.`);
    } else {
      why.push("Not enough games yet for our model — showing the market only.");
    }
    bet.why = why;
  }
}

export function explainProp(
  bet: BetOption,
  sample: PropSample,
  model: PropModel | null,
  stat: PropStat,
  line: number,
  side: 0 | 1,
  opponentId: string,
  opponentAbbr: string,
  teamId: string | undefined,
): string[] {
  const s = PROP_SHORT[stat];
  const last = sample.games.slice(-10);
  const over = (g: PlayerGame) => statValue(g, stat) > line;
  const hits = last.filter(over).length;
  const vsOpp = sample.games.filter((g) => g.opponentId === opponentId && (!teamId || g.teamId === teamId));
  const avg = last.length ? last.reduce((a, g) => a + statValue(g, stat), 0) / last.length : 0;
  const why = [priceLine(bet)];
  why.push(`Last ${last.length}: averaging ${avg.toFixed(1)} ${s} vs a line of ${line}.`);
  why.push(
    side === 0
      ? `Went over in ${hits} of ${last.length}.`
      : `Stayed under in ${last.length - hits} of ${last.length}.`,
  );
  if (vsOpp.length) {
    const h = vsOpp.filter(over).length;
    why.push(`vs ${opponentAbbr}: ${side === 0 ? `over ${h}` : `under ${vsOpp.length - h}`} of ${vsOpp.length}.`);
  }
  if (model && model.minutesFactor < 1) why.push(`Minutes are dropping, so the model scales him down ${Math.round((1 - model.minutesFactor) * 100)}%.`);
  if (sample.note) why.push(sample.note);
  why.push(`Final estimate = ${MODEL_WEIGHT * 100}% our model + ${100 - MODEL_WEIGHT * 100}% the market's vig-free odds.`);
  return why;
}
