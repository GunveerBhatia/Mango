// ESPN's public (unofficial, keyless) site API. Used for the schedule, team
// records, team leaders, injuries, and as a free single-book odds fallback.
// If ESPN changes shape, only this file needs to change.

import { cacheLife } from "next/cache";
import { ESPN_CACHE_SECONDS } from "../cache-config";
import { fetchJson } from "../http";
import { parseAmerican } from "../odds-math";
import type { BookQuote } from "../markets";
import type { GameStatus, Injury, TeamLeader, TeamSide } from "../types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface EspnOdds {
  provider: string;
  moneyline: BookQuote;
  spread: BookQuote;
  total: BookQuote;
}

export interface EspnGame {
  id: string;
  startTime: string;
  status: GameStatus;
  away: Omit<TeamSide, "tags">;
  home: Omit<TeamSide, "tags">;
  odds?: EspnOdds;
}

export interface EspnScoreboard {
  /** League day ESPN considers "today", YYYY-MM-DD. */
  day: string;
  games: EspnGame[];
}

async function fetchScoreboard(espnPath: string, yyyymmdd?: string): Promise<Raw> {
  "use cache";
  cacheLife({ stale: 60, revalidate: ESPN_CACHE_SECONDS, expire: ESPN_CACHE_SECONDS * 6 });
  const q = yyyymmdd ? `?dates=${yyyymmdd}` : "";
  const { data } = await fetchJson<Raw>(`${BASE}/${espnPath}/scoreboard${q}`, "ESPN scoreboard");
  return data;
}

async function fetchInjuries(espnPath: string): Promise<Raw> {
  "use cache";
  cacheLife({ stale: 60, revalidate: ESPN_CACHE_SECONDS, expire: ESPN_CACHE_SECONDS * 6 });
  const { data } = await fetchJson<Raw>(`${BASE}/${espnPath}/injuries`, "ESPN injuries");
  return data;
}

function parseTeam(c: Raw): Omit<TeamSide, "tags"> {
  const records: Raw[] = c?.records ?? [];
  const rec = (type: string) => records.find((r) => r?.type === type)?.summary;
  const leaders: TeamLeader[] = (c?.leaders ?? []).flatMap((cat: Raw) => {
    const top = cat?.leaders?.[0];
    if (!top?.athlete) return [];
    return [
      {
        athleteId: top.athlete.id ? String(top.athlete.id) : undefined,
        name: top.athlete.displayName ?? top.athlete.fullName ?? "Unknown",
        category: cat.name ?? "",
        value: top.displayValue ?? "",
      },
    ];
  });
  const score = Number(c?.score);
  return {
    id: String(c?.team?.id ?? ""),
    abbr: c?.team?.abbreviation ?? "?",
    name: c?.team?.displayName ?? "Unknown",
    nickname: c?.team?.name ?? c?.team?.shortDisplayName ?? "",
    logo: c?.team?.logo,
    record: rec("total"),
    homeRecord: rec("home"),
    roadRecord: rec("road"),
    score: Number.isFinite(score) && c?.score !== "" ? score : undefined,
    leaders,
  };
}

function side(raw: Raw, pointKey?: "line"): { american: number; point?: number } | undefined {
  const node = raw?.close ?? raw?.current ?? raw?.open;
  const american = parseAmerican(node?.odds);
  if (american === undefined) return undefined;
  if (!pointKey) return { american };
  const point = Number(String(node?.line ?? "").replace(/[ou]/i, ""));
  return Number.isFinite(point) ? { american, point } : undefined;
}

function parseOdds(comp: Raw): EspnOdds | undefined {
  const o = comp?.odds?.[0];
  if (!o) return undefined;
  const provider = o.provider?.displayName ?? o.provider?.name ?? "ESPN BET";
  const bookKey = provider.toLowerCase().replace(/\s+/g, "");
  const base = { book: provider, bookKey };
  return {
    provider,
    moneyline: { ...base, a: side(o.moneyline?.away), b: side(o.moneyline?.home) },
    spread: { ...base, a: side(o.pointSpread?.away, "line"), b: side(o.pointSpread?.home, "line") },
    total: { ...base, a: side(o.total?.over, "line"), b: side(o.total?.under, "line") },
  };
}

export async function getScoreboard(espnPath: string, yyyymmdd?: string): Promise<EspnScoreboard> {
  const data = await fetchScoreboard(espnPath, yyyymmdd);
  const games: EspnGame[] = (data?.events ?? []).flatMap((e: Raw) => {
    const comp = e?.competitions?.[0];
    const cs: Raw[] = comp?.competitors ?? [];
    const away = cs.find((c) => c?.homeAway === "away");
    const home = cs.find((c) => c?.homeAway === "home");
    if (!away || !home) return [];
    const st = comp?.status?.type ?? e?.status?.type;
    return [
      {
        id: String(e.id),
        startTime: e.date,
        status: {
          state: (st?.state ?? "pre") as GameStatus["state"],
          detail: st?.shortDetail ?? st?.detail ?? "",
        },
        away: parseTeam(away),
        home: parseTeam(home),
        odds: parseOdds(comp),
      },
    ];
  });
  const day: string = data?.day?.date ?? (games[0]?.startTime ?? "").slice(0, 10);
  return { day, games };
}

export async function getInjuries(espnPath: string): Promise<Injury[]> {
  const data = await fetchInjuries(espnPath);
  return (data?.injuries ?? []).flatMap((team: Raw) =>
    (team?.injuries ?? []).map((i: Raw): Injury => {
      const href: string =
        i?.athlete?.links?.find((l: Raw) => l?.rel?.includes("playercard"))?.href ?? "";
      return {
        athleteId: href.match(/\/id\/(\d+)/)?.[1],
        name: i?.athlete?.displayName ?? "Unknown",
        teamId: String(team?.id ?? ""),
        status: i?.status ?? i?.type?.description ?? "Unknown",
        detail: i?.shortComment,
        date: i?.date,
      };
    }),
  );
}
