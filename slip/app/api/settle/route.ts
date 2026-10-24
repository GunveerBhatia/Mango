// Grades saved legs from final scores and fills in closing odds (ESPN's
// DraftKings close). Props get graded from the player's game log; prop
// closing odds aren't available for free, so those are entered by hand.

import { safe } from "@/lib/http";
import { getLeague } from "@/lib/leagues";
import { statValue, type PropStat } from "@/lib/model";
import { getPlayerGames, getSummary, seasonYearFor, type EspnSummary } from "@/lib/providers/espn";
import type { BookQuote } from "@/lib/markets";
import type { LegResult } from "@/lib/slip/types";

interface LegIn {
  id: string;
  kind: "moneyline" | "spread" | "total" | "prop";
  gameId: string;
  side: 0 | 1;
  point?: number;
  athleteId?: string;
  stat?: string;
  startTime: string;
}

export interface LegOut {
  id: string;
  result?: LegResult;
  actual?: number;
  closingAmerican?: number;
  closingPoint?: number;
}

const grade = (diff: number): LegResult => (diff > 0 ? "won" : diff < 0 ? "lost" : "push");

function closing(q: BookQuote | undefined, side: 0 | 1) {
  const s = side === 0 ? q?.a : q?.b;
  return s ? { closingAmerican: s.american, closingPoint: s.point } : {};
}

export async function POST(req: Request) {
  let legs: LegIn[];
  try {
    const body = await req.json();
    legs = Array.isArray(body?.legs) ? body.legs.slice(0, 200) : [];
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const league = getLeague("nba");
  const ids = [...new Set(legs.map((l) => String(l.gameId)).filter((id) => /^\d+$/.test(id)))];
  const summaries = new Map<string, EspnSummary | null>(
    await Promise.all(ids.map(async (id) => [id, await safe(() => getSummary(league.espnPath, id))] as const)),
  );

  const out: LegOut[] = await Promise.all(
    legs.map(async (l): Promise<LegOut> => {
      const s = summaries.get(String(l.gameId));
      if (!s) return { id: l.id };
      const away = s.teams.find((t) => !t.home);
      const home = s.teams.find((t) => t.home);
      const final = s.status.state === "post" && away?.score !== undefined && home?.score !== undefined;
      const res: LegOut = { id: l.id };

      // Before tip-off the line is still moving, so there's no closing price yet.
      if (s.status.state === "pre") return res;
      if (l.kind === "moneyline") Object.assign(res, closing(s.odds?.moneyline, l.side));
      if (l.kind === "spread") Object.assign(res, closing(s.odds?.spread, l.side));
      if (l.kind === "total") Object.assign(res, closing(s.odds?.total, l.side));
      if (!final) return res;

      const [mine, theirs] = l.side === 0 ? [away!.score!, home!.score!] : [home!.score!, away!.score!];
      if (l.kind === "moneyline") {
        res.result = grade(mine - theirs);
        res.actual = mine - theirs;
      } else if (l.kind === "spread" && l.point !== undefined) {
        res.result = grade(mine + l.point - theirs);
        res.actual = mine - theirs;
      } else if (l.kind === "total" && l.point !== undefined) {
        const total = away!.score! + home!.score!;
        res.result = grade(l.side === 0 ? total - l.point : l.point - total);
        res.actual = total;
      } else if (l.kind === "prop" && l.athleteId && l.stat && l.point !== undefined) {
        const season = seasonYearFor(l.startTime);
        const log = await safe(() => getPlayerGames(league.espnPath, l.athleteId!, season, true));
        const row = log?.find((g) => g.eventId === String(l.gameId));
        if (row) {
          const v = statValue(row, l.stat as PropStat);
          res.actual = v;
          res.result = grade(l.side === 0 ? v - l.point : l.point - v);
        } else if (log) {
          // Didn't play: books void the bet.
          res.result = "push";
        }
      }
      return res;
    }),
  );
  return Response.json({ legs: out });
}
