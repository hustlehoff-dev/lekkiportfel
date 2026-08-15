import {
  coinGeckoDays,
  featuredChartInstruments,
  isChartPeriod,
  safeCoinId,
  safeMarketSymbol,
  yahooPeriodConfig,
  type ChartInstrument,
  type ChartPeriod,
} from "../../../lib/market-charts";

type ChartPoint = { time: number; value: number };

type ChartPayload = {
  instrument: ChartInstrument;
  currency: string;
  price: number;
  previousClose: number | null;
  change24h: number | null;
  periodChange: number | null;
  updatedAt: string;
  provider: "Bankier.pl" | "CoinGecko" | "Yahoo Finance";
  points: ChartPoint[];
  stale?: boolean;
};

type CacheEntry = { freshUntil: number; staleUntil: number; value: unknown };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const HISTORY_TTL = 3 * 60_000;
const SEARCH_TTL = 15 * 60_000;
const STALE_TTL = 24 * 60 * 60_000;

function cached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.freshUntil <= Date.now()) return null;
  return entry.value as T;
}

function staleCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.staleUntil <= Date.now()) return null;
  return entry.value as T;
}

function remember(key: string, value: unknown, ttl: number) {
  const now = Date.now();
  cache.set(key, { freshUntil: now + ttl, staleUntil: now + STALE_TTL, value });
  return value;
}

async function loadOnce<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<{ value: T; stale: boolean }> {
  const fresh = cached<T>(key);
  if (fresh) return { value: fresh, stale: false };
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) {
    try {
      return { value: await running, stale: false };
    } catch (error) {
      const stale = staleCached<T>(key);
      if (stale) return { value: stale, stale: true };
      throw error;
    }
  }
  const request = loader().then(value => remember(key, value, ttl) as T);
  inflight.set(key, request);
  try {
    return { value: await request, stale: false };
  } catch (error) {
    const stale = staleCached<T>(key);
    if (stale) return { value: stale, stale: true };
    throw error;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}

class QuoteSourceError extends Error {
  constructor(public status: number) {
    super(status === 429
      ? "Dostawca chwilowo ograniczył liczbę zapytań. Spróbuj ponownie za minutę."
      : `Źródło notowań zwróciło błąd ${status}`);
  }
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "LekkiPortfel/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new QuoteSourceError(response.status);
  return response.json() as Promise<T>;
}

function periodChange(points: ChartPoint[]) {
  const first = points.find(point => Number.isFinite(point.value) && point.value > 0)?.value;
  const last = points.findLast(point => Number.isFinite(point.value) && point.value > 0)?.value;
  return first && last ? (last / first - 1) * 100 : null;
}

async function cryptoHistory(instrument: ChartInstrument, period: ChartPeriod): Promise<ChartPayload> {
  const id = safeCoinId(instrument.providerId);
  if (!id) throw new Error("Nieprawidłowy identyfikator kryptowaluty");
  const days = coinGeckoDays[period];
  const history = await fetchJson<{ prices?: Array<[number, number]> }>(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=pln&days=${days}`);
  const points = (history.prices || []).map(([time, value]) => ({ time, value })).filter(point => Number.isFinite(point.value) && point.value > 0);
  const latest = points.at(-1);
  const price = Number(latest?.value);
  if (!Number.isFinite(price) || price <= 0 || points.length < 2) throw new Error("Brak notowań dla wybranego okresu");
  const dayAgo = (latest?.time || Date.now()) - 24 * 60 * 60_000;
  const previousDay = points.reduce((closest, point) => Math.abs(point.time - dayAgo) < Math.abs(closest.time - dayAgo) ? point : closest, points[0]);
  return {
    instrument,
    currency: "PLN",
    price,
    previousClose: null,
    change24h: previousDay?.value > 0 ? (price / previousDay.value - 1) * 100 : null,
    periodChange: periodChange(points),
    updatedAt: new Date(latest?.time || Date.now()).toISOString(),
    provider: "CoinGecko",
    points,
  };
}

async function marketHistory(instrument: ChartInstrument, period: ChartPeriod): Promise<ChartPayload> {
  const symbol = safeMarketSymbol(instrument.providerId);
  if (!symbol) throw new Error("Nieprawidłowy symbol instrumentu");
  const config = yahooPeriodConfig[period];
  const result = await fetchJson<{ chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }>; error?: { description?: string } | null } }>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}&includePrePost=false&events=div%2Csplits`);
  if (result.chart?.error) throw new Error(result.chart.error.description || "Brak notowań");
  const chart = result.chart?.result?.[0];
  const timestamps = chart?.timestamp || [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const points = timestamps.map((time, index) => ({ time: time * 1000, value: Number(closes[index]) })).filter(point => Number.isFinite(point.value) && point.value > 0);
  const meta = chart?.meta || {};
  const price = Number(meta.regularMarketPrice ?? points.at(-1)?.value);
  const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || price <= 0 || points.length < 2) throw new Error("Brak notowań dla wybranego okresu");
  return {
    instrument,
    currency: String(meta.currency || "USD"),
    price,
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null,
    change24h: Number.isFinite(previousClose) && previousClose > 0 ? (price / previousClose - 1) * 100 : null,
    periodChange: periodChange(points),
    updatedAt: new Date((Number(meta.regularMarketTime) || Date.now() / 1000) * 1000).toISOString(),
    provider: "Yahoo Finance",
    points,
  };
}

const bankierRanges: Partial<Record<ChartPeriod, string>> = {
  "1T": "1w",
  "1M": "1m",
  "3M": "3m",
  "1R": "1y",
  "5L": "5y",
};

function downsample(points: ChartPoint[], limit = 1200) {
  if (points.length <= limit) return points;
  const output: ChartPoint[] = [points[0]];
  const bucketCount = Math.max(1, Math.floor((limit - 2) / 2));
  const bucketSize = (points.length - 2) / bucketCount;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = 1 + Math.floor(bucket * bucketSize);
    const end = Math.min(points.length - 1, 1 + Math.floor((bucket + 1) * bucketSize));
    const slice = points.slice(start, Math.max(start + 1, end));
    const min = slice.reduce((best, point) => point.value < best.value ? point : best, slice[0]);
    const max = slice.reduce((best, point) => point.value > best.value ? point : best, slice[0]);
    if (min.time <= max.time) output.push(min, max); else output.push(max, min);
  }
  output.push(points.at(-1)!);
  return output.filter((point, index, list) => index === 0 || point.time !== list[index - 1].time).slice(0, limit);
}

function gpwIndexSymbol(instrument: ChartInstrument) {
  const source = `${instrument.symbol} ${instrument.providerId}`.toUpperCase();
  if (/(^|[^A-Z0-9])WIG20([^A-Z0-9]|$)/.test(source)) return "WIG20";
  if (/(^|[^A-Z0-9])WIG([^A-Z0-9]|$)/.test(source)) return "WIG";
  return null;
}

async function bankierGpwHistory(instrument: ChartInstrument, period: ChartPeriod): Promise<ChartPayload> {
  const symbol = gpwIndexSymbol(instrument);
  const range = bankierRanges[period];
  if (!symbol || (!range && period !== "MAX")) return marketHistory(instrument, period);
  const periodQuery = period === "MAX" ? "max_period=true" : `range=${range}`;
  const body = await fetchJson<{ data?: Array<{ data?: Array<[number, number, number, number, number]>; header_data?: { current_rate?: number; datetime?: number; change_percent?: number } }> }>(`https://api.bankier.pl/quotes/public/gpw-indices-section-chart/?symbols=${symbol}&metrics=true&intraday=false&${periodQuery}`);
  const row = body.data?.[0];
  const completePoints = (row?.data || []).map(item => ({ time: Number(item[0]), value: Number(item[4]) })).filter(point => Number.isFinite(point.time) && Number.isFinite(point.value) && point.value > 0);
  const points = downsample(completePoints);
  const price = Number(row?.header_data?.current_rate ?? points.at(-1)?.value);
  if (!Number.isFinite(price) || price <= 0 || points.length < 2) throw new Error("Brak notowań GPW dla wybranego okresu");
  return {
    instrument,
    currency: "PLN",
    price,
    previousClose: null,
    change24h: Number.isFinite(row?.header_data?.change_percent) ? Number(row!.header_data!.change_percent) : null,
    periodChange: periodChange(points),
    updatedAt: new Date(Number(row?.header_data?.datetime) || points.at(-1)!.time).toISOString(),
    provider: "Bankier.pl",
    points,
  };
}

async function search(query: string) {
  const normalized = query.trim().slice(0, 80);
  if (normalized.length < 2) return featuredChartInstruments;
  const [coins, markets] = await Promise.allSettled([
    fetchJson<{ coins?: Array<{ id: string; symbol: string; name: string }> }>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalized)}`),
    fetchJson<{ quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchDisp?: string; exchange?: string; isYahooFinance?: boolean }> }>(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(normalized)}&quotesCount=12&newsCount=0&enableFuzzyQuery=true`),
  ]);
  const crypto: ChartInstrument[] = coins.status === "fulfilled" ? (coins.value.coins || []).slice(0, 5).map(coin => ({
    key: `crypto:${coin.id}`,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    kind: "crypto",
    providerId: coin.id,
    exchange: "Krypto",
  })) : [];
  const allowedTypes = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX", "FUTURE", "CURRENCY"]);
  const market: ChartInstrument[] = markets.status === "fulfilled" ? (markets.value.quotes || []).filter(row => row.symbol && allowedTypes.has(row.quoteType || "") && row.isYahooFinance !== false).slice(0, 7).map(row => ({
    key: `market:${row.symbol}`,
    symbol: row.symbol!,
    name: row.longname || row.shortname || row.symbol!,
    kind: "market",
    providerId: row.symbol!,
    exchange: row.exchDisp || row.exchange || "Rynek",
  })) : [];
  const results = [...crypto, ...market];
  if (!results.length && coins.status === "rejected" && markets.status === "rejected") throw new Error("Wyszukiwarka notowań jest chwilowo niedostępna");
  return results;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "history";
  try {
    if (action === "search") {
      const query = (url.searchParams.get("q") || "").trim();
      const key = `search:${query.toLowerCase()}`;
      const loaded = await loadOnce(key, () => search(query), SEARCH_TTL);
      return Response.json({ results: loaded.value, stale: loaded.stale }, { headers: { "cache-control": "private, max-age=60" } });
    }

    const kind = url.searchParams.get("kind") === "crypto" ? "crypto" : "market";
    const providerId = (url.searchParams.get("id") || "").trim();
    const symbol = (url.searchParams.get("symbol") || providerId).trim().slice(0, 40);
    const name = (url.searchParams.get("name") || symbol).trim().slice(0, 100);
    const exchange = (url.searchParams.get("exchange") || (kind === "crypto" ? "Krypto" : "Rynek")).trim().slice(0, 60);
    const period = isChartPeriod(url.searchParams.get("period")) ? url.searchParams.get("period") as ChartPeriod : "1M";
    const instrument: ChartInstrument = { key: `${kind}:${providerId}`, symbol, name, kind, providerId, exchange };
    const key = `history:${kind}:${providerId}:${period}`;
    const useBankier = kind === "market" && gpwIndexSymbol(instrument) !== null && period !== "1D";
    const loader = async () => {
      if (kind !== "crypto") return useBankier ? bankierGpwHistory(instrument, period) : marketHistory(instrument, period);
      try {
        return await cryptoHistory(instrument, period);
      } catch (error) {
        if (!(error instanceof QuoteSourceError) || error.status !== 429) throw error;
        const yahooInstrument = { ...instrument, providerId: `${instrument.symbol.toUpperCase()}-USD` };
        const fallback = await marketHistory(yahooInstrument, period);
        return { ...fallback, instrument };
      }
    };
    const loaded = await loadOnce(key, loader, HISTORY_TTL);
    return Response.json({ ...loaded.value, stale: loaded.stale }, { headers: { "cache-control": "private, max-age=60, stale-if-error=86400" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać notowań" }, { status: 502 });
  }
}
