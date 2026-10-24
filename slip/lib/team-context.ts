// Everything we know about a team going into tonight: recent results, rest, injuries.

import type { LeagueConfig } from "./leagues";
import { form, type TeamContext, type TeamForm } from "./model";
import { easternDate, getTeamResults, seasonYearFor, type TeamResult } from "./providers/espn";
import { safe } from "./http";
import type { Injury, Tag, TeamLeader } from "./types";

export interface TeamOutlook extends TeamContext {
  teamId: string;
  /** Completed games before tonight, this season and last, oldest first. */
  results: TeamResult[];
  lastGame?: TeamResult;
  keyInjuries: Injury[];
  tags: Tag[];
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400_000);

export async function getRecentResults(
  league: LeagueConfig,
  teamId: string,
  beforeIso: string,
  seasonsBack = 1,
): Promise<TeamResult[]> {
  const season = seasonYearFor(beforeIso);
  const seasons = Array.from({ length: seasonsBack + 1 }, (_, i) => season - seasonsBack + i);
  const lists = await Promise.all(
    seasons.map((s) => safe(() => getTeamResults(league.espnPath, teamId, s, s === season))),
  );
  const cutoff = Date.parse(beforeIso);
  return lists
    .flatMap((l) => l ?? [])
    .filter((r) => Date.parse(r.date) < cutoff)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export async function getTeamOutlook(
  league: LeagueConfig,
  teamId: string,
  gameIso: string,
  isHome: boolean,
  injuries: Injury[],
  leaders: TeamLeader[],
): Promise<TeamOutlook> {
  const results = await getRecentResults(league, teamId, gameIso);
  const last10: TeamForm = form(results.slice(-10));
  const lastGame = results.at(-1);
  const gameDay = easternDate(gameIso);
  const restDays = lastGame ? dayDiff(gameDay, easternDate(lastGame.date)) - 1 : undefined;
  const inLast3 = results.filter((r) => {
    const d = dayDiff(gameDay, easternDate(r.date));
    return d >= 1 && d <= 3;
  }).length;
  const threeInFour = inLast3 >= 2;

  const teamInj = injuries.filter((i) => i.teamId === teamId);
  const keys = leaders.filter((l) => league.keyLeaderCategories.includes(l.category));
  const keyInjuries = new Map<string, Injury>();
  for (const k of keys) {
    const hit = teamInj.find((i) => (k.athleteId && i.athleteId === k.athleteId) || i.name === k.name);
    if (hit) keyInjuries.set(hit.name, hit);
  }
  const isOut = (i: Injury) => /out|doubtful/i.test(i.status);
  const keyOut = [...keyInjuries.values()].filter(isOut);
  const keyQ = [...keyInjuries.values()].filter((i) => !isOut(i));

  const tags: Tag[] = [];
  if (isHome) tags.push({ label: "Home", tone: "neutral" });
  if (restDays === 0) tags.push({ label: "Back-to-back", tone: "bad", detail: "Played last night" });
  if (threeInFour) tags.push({ label: "3+ in 4 nights", tone: "bad" });
  for (const i of keyOut) {
    tags.push({ label: `Key player out · ${i.name.split(" ").slice(-1)[0]}`, tone: "bad", detail: `${i.name} (${i.status})` });
  }

  return {
    teamId,
    results,
    last10,
    lastGame,
    restDays,
    threeInFour,
    keyOut: keyOut.length,
    keyQuestionable: keyQ.length,
    keyInjuries: [...keyInjuries.values()],
    tags,
  };
}
