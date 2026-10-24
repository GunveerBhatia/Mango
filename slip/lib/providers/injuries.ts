// Injury source. ESPN's public endpoint is the default; to swap in another
// source, write a function with the same signature and point `getInjuries` at it.

import type { LeagueConfig } from "../leagues";
import type { Injury } from "../types";
import { getInjuries as espnInjuries } from "./espn";

export const INJURY_SOURCE = "ESPN";

export async function getInjuries(league: LeagueConfig): Promise<Injury[]> {
  return espnInjuries(league.espnPath);
}
