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
  venueCity?: string;
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

export function parseOddsNode(o: Raw): EspnOdds | undefined {
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
        odds: parseOddsNode(comp?.odds?.[0]),
        venueCity: comp?.venue?.address?.city,
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

/* ------------------------------------------------------------------ */
/* Team schedules, summaries, rosters, stats, player game logs          */
/* ------------------------------------------------------------------ */

const WEB = "https://site.web.api.espn.com/apis/common/v3/sports";
const DAY = 86400;

/** ESPN names seasons by the year they end: 2026-27 → 2027. */
export function seasonYearFor(iso: string): number {
  const d = new Date(iso);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

/** Calendar date of a tip-off in US Eastern time, YYYY-MM-DD. */
export function easternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export interface TeamResult {
  eventId: string;
  date: string;
  home: boolean;
  opponentId: string;
  opponentAbbr: string;
  opponentLogo?: string;
  pointsFor: number;
  pointsAgainst: number;
  won: boolean;
  city?: string;
  season: number;
}

async function fetchTeamSchedule(espnPath: string, teamId: string, season: number, current: boolean): Promise<Raw> {
  "use cache";
  // Finished seasons never change; the current one does.
  if (current) cacheLife({ stale: 60, revalidate: ESPN_CACHE_SECONDS, expire: ESPN_CACHE_SECONDS * 6 });
  else cacheLife({ stale: 3600, revalidate: DAY, expire: DAY * 7 });
  const { data } = await fetchJson<Raw>(
    `${BASE}/${espnPath}/teams/${teamId}/schedule?season=${season}&seasontype=2`,
    "ESPN team schedule",
  );
  return data;
}

/** Completed regular-season games for a team, oldest first. */
export async function getTeamResults(
  espnPath: string,
  teamId: string,
  season: number,
  current: boolean,
): Promise<TeamResult[]> {
  const data = await fetchTeamSchedule(espnPath, teamId, season, current);
  return (data?.events ?? []).flatMap((e: Raw): TeamResult[] => {
    const c = e?.competitions?.[0];
    if (c?.status?.type?.state !== "post") return [];
    const me = c.competitors?.find((t: Raw) => String(t?.team?.id) === teamId);
    const opp = c.competitors?.find((t: Raw) => String(t?.team?.id) !== teamId);
    const pf = Number(me?.score?.value ?? me?.score);
    const pa = Number(opp?.score?.value ?? opp?.score);
    if (!me || !opp || !Number.isFinite(pf) || !Number.isFinite(pa)) return [];
    return [
      {
        eventId: String(e.id),
        date: e.date,
        home: me.homeAway === "home",
        opponentId: String(opp.team?.id),
        opponentAbbr: opp.team?.abbreviation ?? "?",
        opponentLogo: opp.team?.logos?.[0]?.href ?? opp.team?.logo,
        pointsFor: pf,
        pointsAgainst: pa,
        won: pf > pa,
        city: c.venue?.address?.city,
        season,
      },
    ];
  });
}

export interface EspnSummary {
  status: GameStatus;
  startTime?: string;
  teams: { id: string; abbr: string; home: boolean; score?: number; name: string; nickname: string; logo?: string }[];
  /** ESPN BPI matchup predictor, 0–1. */
  predictor?: { home: number; away: number };
  odds?: EspnOdds;
  venueCity?: string;
}

async function fetchSummary(espnPath: string, eventId: string): Promise<Raw> {
  "use cache";
  cacheLife({ stale: 60, revalidate: ESPN_CACHE_SECONDS, expire: ESPN_CACHE_SECONDS * 6 });
  const { data } = await fetchJson<Raw>(`${BASE}/${espnPath}/summary?event=${eventId}`, "ESPN game summary");
  return data;
}

export async function getSummary(espnPath: string, eventId: string): Promise<EspnSummary> {
  const d = await fetchSummary(espnPath, eventId);
  const comp = d?.header?.competitions?.[0];
  const st = comp?.status?.type;
  const pct = (v: Raw) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n / 100 : undefined;
  };
  const ph = pct(d?.predictor?.homeTeam?.gameProjection);
  const pa = pct(d?.predictor?.awayTeam?.gameProjection);
  return {
    status: { state: st?.state ?? "pre", detail: st?.shortDetail ?? "" },
    startTime: comp?.date,
    teams: (comp?.competitors ?? []).map((c: Raw) => {
      const score = Number(c?.score);
      return {
        id: String(c?.team?.id ?? c?.id),
        abbr: c?.team?.abbreviation ?? "?",
        home: c?.homeAway === "home",
        score: Number.isFinite(score) && c?.score !== "" && c?.score !== undefined ? score : undefined,
        name: c?.team?.displayName ?? "",
        nickname: c?.team?.name ?? "",
        logo: c?.team?.logos?.[0]?.href ?? c?.team?.logo,
      };
    }),
    predictor: ph !== undefined && pa !== undefined ? { home: ph, away: pa } : undefined,
    odds: parseOddsNode(d?.pickcenter?.[0]),
    venueCity: d?.gameInfo?.venue?.address?.city,
  };
}

export interface TeamStats {
  games: number;
  ppg: number;
  /** Estimated possessions per game. */
  pace?: number;
}

async function fetchTeamStats(espnPath: string, teamId: string): Promise<Raw> {
  "use cache";
  cacheLife({ stale: 300, revalidate: ESPN_CACHE_SECONDS * 3, expire: DAY });
  const { data } = await fetchJson<Raw>(`${BASE}/${espnPath}/teams/${teamId}/statistics`, "ESPN team stats");
  return data;
}

export async function getTeamStats(espnPath: string, teamId: string): Promise<TeamStats | null> {
  const d = await fetchTeamStats(espnPath, teamId);
  const all = new Map<string, number>();
  for (const cat of d?.results?.stats?.categories ?? []) {
    for (const s of cat?.stats ?? []) {
      if (!all.has(s.name)) all.set(s.name, Number(s.value));
    }
  }
  const games = all.get("gamesPlayed") ?? 0;
  const ppg = all.get("avgPoints");
  if (!games || ppg === undefined) return null;
  const fga = all.get("avgFieldGoalsAttempted");
  const fta = all.get("avgFreeThrowsAttempted");
  const oreb = all.get("avgOffensiveRebounds");
  const to = all.get("avgTurnovers");
  const pace =
    fga !== undefined && fta !== undefined && oreb !== undefined && to !== undefined
      ? fga - oreb + to + 0.44 * fta
      : undefined;
  return { games, ppg, pace };
}

export interface RosterPlayer {
  id: string;
  name: string;
  position?: string;
  headshot?: string;
  jersey?: string;
}

async function fetchRoster(espnPath: string, teamId: string): Promise<Raw> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: DAY * 2 });
  const { data } = await fetchJson<Raw>(`${BASE}/${espnPath}/teams/${teamId}/roster`, "ESPN roster");
  return data;
}

export async function getRoster(espnPath: string, teamId: string): Promise<RosterPlayer[]> {
  const d = await fetchRoster(espnPath, teamId);
  return (d?.athletes ?? []).map((a: Raw) => ({
    id: String(a.id),
    name: a.displayName ?? a.fullName ?? "Unknown",
    position: a.position?.abbreviation,
    headshot: a.headshot?.href,
    jersey: a.jersey,
  }));
}

export interface Athlete {
  id: string;
  name: string;
  teamId?: string;
  teamAbbr?: string;
  position?: string;
  headshot?: string;
}

async function fetchAthlete(espnPath: string, id: string): Promise<Raw> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: DAY * 2 });
  const { data } = await fetchJson<Raw>(`${WEB}/${espnPath}/athletes/${id}`, "ESPN athlete");
  return data;
}

export async function getAthlete(espnPath: string, id: string): Promise<Athlete> {
  const a = (await fetchAthlete(espnPath, id))?.athlete;
  return {
    id,
    name: a?.displayName ?? "Unknown player",
    teamId: a?.team?.id ? String(a.team.id) : undefined,
    teamAbbr: a?.team?.abbreviation,
    position: a?.position?.abbreviation,
    headshot: a?.headshot?.href,
  };
}

export interface PlayerGame {
  eventId: string;
  date: string;
  home: boolean;
  opponentId: string;
  opponentAbbr: string;
  result?: string;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  threes: number;
}

async function fetchGamelog(espnPath: string, id: string, season: number, current: boolean): Promise<Raw> {
  "use cache";
  if (current) cacheLife({ stale: 60, revalidate: ESPN_CACHE_SECONDS, expire: ESPN_CACHE_SECONDS * 6 });
  else cacheLife({ stale: 3600, revalidate: DAY, expire: DAY * 7 });
  const { data } = await fetchJson<Raw>(`${WEB}/${espnPath}/athletes/${id}/gamelog?season=${season}`, "ESPN game log");
  return data;
}

/** Regular-season games for one season, oldest first. */
export async function getPlayerGames(
  espnPath: string,
  id: string,
  season: number,
  current: boolean,
): Promise<PlayerGame[]> {
  const d = await fetchGamelog(espnPath, id, season, current);
  const names: string[] = d?.names ?? [];
  const col = (n: string) => names.indexOf(n);
  const iMin = col("minutes");
  const iPts = col("points");
  const iReb = col("totalRebounds");
  const iAst = col("assists");
  const i3 = col("threePointFieldGoalsMade-threePointFieldGoalsAttempted");
  const regular = (d?.seasonTypes ?? []).find((s: Raw) => /regular/i.test(s?.displayName ?? ""));
  const rows: PlayerGame[] = [];
  for (const cat of regular?.categories ?? []) {
    for (const row of cat?.events ?? []) {
      const ev = d?.events?.[row.eventId];
      const st: string[] = row.stats ?? [];
      if (!ev || st.length === 0) continue;
      const num = (i: number) => {
        const n = Number(String(st[i] ?? "").split("-")[0]);
        return Number.isFinite(n) ? n : 0;
      };
      rows.push({
        eventId: String(row.eventId),
        date: ev.gameDate,
        home: ev.atVs === "vs",
        opponentId: String(ev.opponent?.id ?? ""),
        opponentAbbr: ev.opponent?.abbreviation ?? "?",
        result: ev.gameResult,
        min: num(iMin),
        pts: num(iPts),
        reb: num(iReb),
        ast: num(iAst),
        threes: num(i3),
      });
    }
  }
  return rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
