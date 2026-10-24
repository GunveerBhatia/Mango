// The Odds API (the-odds-api.com): prices from every US book, for line shopping.
// Each refresh costs credits = markets × regions, so responses are cached for
// ODDS_CACHE_MINUTES (default 60).

import { cacheLife } from "next/cache";
import { ODDS_CACHE_SECONDS, PROPS_CACHE_SECONDS } from "../cache-config";
import { fetchJson } from "../http";
import type { BookQuote } from "../markets";

const BASE = "https://api.the-odds-api.com/v4";

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}
interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: { key: string; outcomes: OddsOutcome[] }[];
}
export interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface OddsFeed {
  events: OddsEvent[];
  fetchedAt: string;
  /** Credits left this month, from the x-requests-remaining header. */
  remaining?: string;
}

export function hasOddsApiKey(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

export async function getOddsFeed(sport: string): Promise<OddsFeed> {
  "use cache";
  cacheLife({ stale: 60, revalidate: ODDS_CACHE_SECONDS, expire: ODDS_CACHE_SECONDS * 4 });
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("The Odds API: ODDS_API_KEY is not set");
  const regions = process.env.ODDS_REGIONS || "us";
  const url =
    `${BASE}/sports/${sport}/odds?regions=${encodeURIComponent(regions)}` +
    `&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${encodeURIComponent(key)}`;
  const { data, headers } = await fetchJson<OddsEvent[]>(url, "The Odds API");
  return {
    events: Array.isArray(data) ? data : [],
    fetchedAt: new Date().toISOString(),
    remaining: headers.get("x-requests-remaining") ?? undefined,
  };
}

/** Per-book quotes for one event. Side A = away/over, side B = home/under. */
export function quotesForEvent(ev: OddsEvent): {
  moneyline: BookQuote[];
  spread: BookQuote[];
  total: BookQuote[];
} {
  const out = { moneyline: [] as BookQuote[], spread: [] as BookQuote[], total: [] as BookQuote[] };
  for (const bm of ev.bookmakers ?? []) {
    const base = { book: bm.title, bookKey: bm.key };
    for (const m of bm.markets ?? []) {
      const find = (name: string) => m.outcomes.find((o) => o.name === name);
      const q = (o?: OddsOutcome) => (o ? { american: o.price, point: o.point } : undefined);
      if (m.key === "h2h") {
        out.moneyline.push({ ...base, a: q(find(ev.away_team)), b: q(find(ev.home_team)) });
      } else if (m.key === "spreads") {
        out.spread.push({ ...base, a: q(find(ev.away_team)), b: q(find(ev.home_team)) });
      } else if (m.key === "totals") {
        out.total.push({ ...base, a: q(find("Over")), b: q(find("Under")) });
      }
    }
  }
  return out;
}

/** Match an Odds API event to a game by team nickname and start time. */
export function findEvent(
  events: OddsEvent[],
  awayNickname: string,
  homeNickname: string,
  startTime: string,
): OddsEvent | undefined {
  const t = Date.parse(startTime);
  const ends = (full: string, nick: string) =>
    nick !== "" && full.toLowerCase().endsWith(nick.toLowerCase());
  return events.find(
    (e) =>
      ends(e.away_team, awayNickname) &&
      ends(e.home_team, homeNickname) &&
      Math.abs(Date.parse(e.commence_time) - t) < 12 * 3600_000,
  );
}

/* ---------- Player props (costs credits per event; fetched only on demand) ---------- */

export const PROP_MARKETS = {
  pts: "player_points",
  reb: "player_rebounds",
  ast: "player_assists",
  pra: "player_points_rebounds_assists",
  threes: "player_threes",
} as const;

/**
 * Prop lines for one event. Costs one credit per market, so callers pick the
 * markets: the player page asks for all five, the auto-picks scan may ask for fewer.
 */
export async function getEventProps(
  sport: string,
  eventId: string,
  markets: string[] = Object.values(PROP_MARKETS),
  scan = false,
): Promise<OddsEvent & { remaining?: string }> {
  "use cache";
  const life = scan ? PROPS_CACHE_SECONDS : ODDS_CACHE_SECONDS;
  cacheLife({ stale: 60, revalidate: life, expire: life * 4 });
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("The Odds API: ODDS_API_KEY is not set");
  const regions = process.env.ODDS_REGIONS || "us";
  const url =
    `${BASE}/sports/${sport}/events/${eventId}/odds?regions=${encodeURIComponent(regions)}` +
    `&markets=${markets.join(",")}&oddsFormat=american&apiKey=${encodeURIComponent(key)}`;
  const { data, headers } = await fetchJson<OddsEvent>(url, "The Odds API (props)");
  return { ...data, remaining: headers.get("x-requests-remaining") ?? undefined };
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Per-book over/under quotes for one player and one prop market. */
export function propQuotes(ev: OddsEvent, marketKey: string, playerName: string): BookQuote[] {
  const target = normName(playerName);
  const out: BookQuote[] = [];
  for (const bm of ev.bookmakers ?? []) {
    const m = bm.markets.find((x) => x.key === marketKey);
    if (!m) continue;
    const mine = m.outcomes.filter(
      (o) => normName((o as OddsOutcome & { description?: string }).description ?? "") === target,
    );
    const over = mine.find((o) => o.name === "Over");
    const under = mine.find((o) => o.name === "Under");
    if (!over && !under) continue;
    out.push({
      book: bm.title,
      bookKey: bm.key,
      a: over ? { american: over.price, point: over.point } : undefined,
      b: under ? { american: under.price, point: under.point } : undefined,
    });
  }
  return out;
}
