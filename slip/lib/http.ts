// Small fetch helper: timeouts and readable errors. Callers decide about caching.

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  url: string,
  label: string,
): Promise<{ data: T; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new FetchError(`${label}: network error (${(err as Error).message})`);
  }
  if (!res.ok) throw new FetchError(`${label}: HTTP ${res.status}`, res.status);
  return { data: (await res.json()) as T, headers: res.headers };
}

/** Run a fetcher; on failure log it and return null so the page can say "No data yet". */
export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[slip] ${(err as Error).message}`);
    return null;
  }
}
