// How long API responses are reused before we ask the provider again.
// Free tiers are small; see the README before lowering these.

const minutes = (env: string | undefined, fallback: number) => {
  const n = Number(env);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * 60;
};

/** ESPN scoreboard / injuries (free, no key). */
export const ESPN_CACHE_SECONDS = minutes(process.env.ESPN_CACHE_MINUTES, 10);

/** The Odds API. Each refresh costs credits (markets × regions), so default to an hour. */
export const ODDS_CACHE_SECONDS = minutes(process.env.ODDS_CACHE_MINUTES, 60);
