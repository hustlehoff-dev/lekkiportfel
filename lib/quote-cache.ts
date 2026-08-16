export type QuoteQuality = "live" | "cached" | "stale";

type CacheEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

type CacheState = {
  entries: Map<string, CacheEntry<unknown>>;
  running: Map<string, Promise<unknown>>;
  blockedUntil: Map<string, number>;
};

const runtime = globalThis as typeof globalThis & { __lekkiPortfelQuoteCache?: CacheState };
const state = runtime.__lekkiPortfelQuoteCache ??= {
  entries: new Map(),
  running: new Map(),
  blockedUntil: new Map(),
};

export class UpstreamRateLimitError extends Error {
  readonly retryAt: number;

  constructor(source: string, retryAt: number) {
    const retrySeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    super(`${source}: limit zapytań, ponowna próba za ${retrySeconds} s`);
    this.name = "UpstreamRateLimitError";
    this.retryAt = retryAt;
  }
}

function retryAtFromHeader(header: string | null) {
  if (!header) return Date.now() + 120_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Date.now() + Math.max(1, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) && date > Date.now() ? date : Date.now() + 120_000;
}

export async function fetchUpstream(source: string, input: string | URL, init?: RequestInit) {
  const blockedUntil = state.blockedUntil.get(source) ?? 0;
  if (blockedUntil > Date.now()) throw new UpstreamRateLimitError(source, blockedUntil);

  const response = await fetch(input, init);
  if (response.status === 429) {
    const retryAt = retryAtFromHeader(response.headers.get("retry-after"));
    state.blockedUntil.set(source, retryAt);
    throw new UpstreamRateLimitError(source, retryAt);
  }
  return response;
}

function removeExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of state.entries) {
    if (entry.staleUntil <= now) state.entries.delete(key);
  }
  while (state.entries.size > 1_000) {
    const first = state.entries.keys().next().value as string | undefined;
    if (!first) break;
    state.entries.delete(first);
  }
}

export async function loadCached<T>(
  key: string,
  loader: () => Promise<T>,
  options: { freshFor: number; staleFor: number },
): Promise<{ value: T; quality: QuoteQuality }> {
  const now = Date.now();
  const existing = state.entries.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.freshUntil > now) return { value: existing.value, quality: "cached" };

  const running = state.running.get(key) as Promise<T> | undefined;
  if (running) {
    try {
      return { value: await running, quality: "live" };
    } catch (error) {
      if (existing && existing.staleUntil > Date.now()) return { value: existing.value, quality: "stale" };
      throw error;
    }
  }

  const request = loader();
  state.running.set(key, request);
  try {
    const value = await request;
    const loadedAt = Date.now();
    state.entries.set(key, {
      value,
      freshUntil: loadedAt + options.freshFor,
      staleUntil: loadedAt + options.staleFor,
    });
    removeExpiredEntries();
    return { value, quality: "live" };
  } catch (error) {
    if (existing && existing.staleUntil > Date.now()) return { value: existing.value, quality: "stale" };
    throw error;
  } finally {
    if (state.running.get(key) === request) state.running.delete(key);
  }
}
