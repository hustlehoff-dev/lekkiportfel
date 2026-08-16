import { isCryptoAssetClass } from "../../../lib/asset-class";
import { fetchUpstream, loadCached, type QuoteQuality } from "../../../lib/quote-cache";

type PriceRequestItem = {
  id: string;
  symbol: string;
  assetClass: string;
  currency?: string;
  priceId?: string;
};

type Quote = {
  id: string;
  symbol: string;
  pricePln: number;
  nativePrice: number;
  nativeCurrency: string;
  changePct: number | null;
  updatedAt: string;
  provider: "Yahoo Finance" | "CoinGecko" | "NBP";
  quality: QuoteQuality;
};

type YahooMeta = {
  price: number;
  currency: string;
  previous: number;
  timestamp: number;
};

type CryptoPrice = {
  pricePln: number;
  changePct: number | null;
  timestamp: number;
};

const FRESH_MARKET_TTL = 2 * 60_000;
const FRESH_CRYPTO_TTL = 90_000;
const FRESH_FX_TTL = 15 * 60_000;
const STALE_TTL = 24 * 60 * 60_000;

const cryptoIds: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", BNB: "binancecoin",
  ADA: "cardano", DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot",
  LINK: "chainlink", LTC: "litecoin", BCH: "bitcoin-cash", XLM: "stellar",
  TRX: "tron", TON: "the-open-network", SHIB: "shiba-inu", UNI: "uniswap",
  AAVE: "aave", NEAR: "near", ATOM: "cosmos", USDT: "tether", USDC: "usd-coin",
};

const suffixes: Array<[string, string]> = [
  [".PL", ".WA"], [".UK", ".L"], [".DK", ".CO"], [".NL", ".AS"],
  [".FR", ".PA"], [".ES", ".MC"], [".IT", ".MI"], [".CH", ".SW"],
  [".SE", ".ST"], [".NO", ".OL"], [".DE", ".DE"],
];

type PendingCrypto = {
  resolve: (value: CryptoPrice) => void;
  reject: (reason: unknown) => void;
};

const cryptoRuntime = globalThis as typeof globalThis & {
  __lekkiPortfelPendingCrypto?: Map<string, PendingCrypto[]>;
  __lekkiPortfelCryptoFlushScheduled?: boolean;
};
const pendingCrypto = cryptoRuntime.__lekkiPortfelPendingCrypto ??= new Map();

function yahooSymbol(input: string) {
  const symbol = input.trim().toUpperCase();
  if (symbol.endsWith(".US")) return symbol.slice(0, -3).replace(".", "-");
  for (const [xtb, yahoo] of suffixes) if (symbol.endsWith(xtb)) return `${symbol.slice(0, -xtb.length)}${yahoo}`;
  return symbol;
}

function isCashAsset(assetClass: string) {
  return /got|cash/i.test(assetClass);
}

function errorMessage(error: unknown, fallback = "Brak notowania") {
  return error instanceof Error ? error.message : fallback;
}

async function yahooMeta(symbol: string) {
  return loadCached<YahooMeta>(`yahoo:${symbol}`, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const response = await fetchUpstream("Yahoo Finance", url, { headers: { accept: "application/json", "user-agent": "LekkiPortfel/1.0" } });
    if (!response.ok) throw new Error(`Yahoo Finance: notowanie ${response.status}`);
    const body = await response.json() as { chart?: { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
    const result = body.chart?.result?.[0];
    const meta = result?.meta;
    const closes = result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number") ?? [];
    const price = Number(meta?.regularMarketPrice ?? closes.at(-1));
    if (!Number.isFinite(price) || price <= 0) throw new Error("Yahoo Finance: brak ceny");
    return {
      price,
      currency: String(meta?.currency || "PLN"),
      previous: Number(meta?.chartPreviousClose ?? meta?.previousClose),
      timestamp: Number(meta?.regularMarketTime) || Math.floor(Date.now() / 1000),
    };
  }, { freshFor: FRESH_MARKET_TTL, staleFor: STALE_TTL });
}

async function nbpRates() {
  return loadCached<Map<string, number>>("nbp:table-a", async () => {
    const response = await fetchUpstream("NBP", "https://api.nbp.pl/api/exchangerates/tables/A/?format=json", { headers: { accept: "application/json", "user-agent": "LekkiPortfel/1.0" } });
    if (!response.ok) throw new Error(`NBP: kursy ${response.status}`);
    const table = await response.json() as Array<{ rates?: Array<{ code: string; mid: number }> }>;
    return new Map((table[0]?.rates || []).map(rate => [rate.code, rate.mid]));
  }, { freshFor: FRESH_FX_TTL, staleFor: STALE_TTL });
}

async function getFx(currency: string) {
  const normalized = currency === "GBp" ? "GBP" : currency.toUpperCase();
  if (normalized === "PLN") return { rate: currency === "GBp" ? 0.01 : 1, quality: "live" as QuoteQuality, provider: "NBP" as const };

  const official = await nbpRates();
  const officialRate = official.value.get(normalized);
  if (officialRate && officialRate > 0) {
    return { rate: currency === "GBp" ? officialRate / 100 : officialRate, quality: official.quality, provider: "NBP" as const };
  }

  const fallback = await yahooMeta(`${normalized}PLN=X`);
  return { rate: currency === "GBp" ? fallback.value.price / 100 : fallback.value.price, quality: fallback.quality, provider: "Yahoo Finance" as const };
}

async function flushCryptoQueue() {
  cryptoRuntime.__lekkiPortfelCryptoFlushScheduled = false;
  const batch = new Map(pendingCrypto);
  pendingCrypto.clear();
  const ids = [...batch.keys()];
  if (!ids.length) return;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=pln&include_24hr_change=true&include_last_updated_at=true`;
    const response = await fetchUpstream("CoinGecko", url, { headers: { accept: "application/json", "user-agent": "LekkiPortfel/1.0" } });
    if (!response.ok) throw new Error(`CoinGecko: notowanie ${response.status}`);
    const result = await response.json() as Record<string, { pln?: number; pln_24h_change?: number; last_updated_at?: number }>;

    for (const [coinId, waiting] of batch) {
      const row = result[coinId];
      const pricePln = Number(row?.pln);
      if (!Number.isFinite(pricePln) || pricePln <= 0) {
        for (const pending of waiting) pending.reject(new Error("CoinGecko: brak ceny"));
        continue;
      }
      const value: CryptoPrice = {
        pricePln,
        changePct: typeof row.pln_24h_change === "number" ? row.pln_24h_change : null,
        timestamp: Number(row.last_updated_at) || Math.floor(Date.now() / 1000),
      };
      for (const pending of waiting) pending.resolve(value);
    }
  } catch (error) {
    for (const waiting of batch.values()) for (const pending of waiting) pending.reject(error);
  }
}

function queuedCryptoPrice(coinId: string) {
  return new Promise<CryptoPrice>((resolve, reject) => {
    const waiting = pendingCrypto.get(coinId) ?? [];
    waiting.push({ resolve, reject });
    pendingCrypto.set(coinId, waiting);
    if (!cryptoRuntime.__lekkiPortfelCryptoFlushScheduled) {
      cryptoRuntime.__lekkiPortfelCryptoFlushScheduled = true;
      queueMicrotask(flushCryptoQueue);
    }
  });
}

function cryptoPrice(coinId: string) {
  return loadCached<CryptoPrice>(`coingecko:${coinId}`, () => queuedCryptoPrice(coinId), { freshFor: FRESH_CRYPTO_TTL, staleFor: STALE_TTL });
}

function quoteQuality(primary: QuoteQuality, dependency?: QuoteQuality): QuoteQuality {
  if (primary === "stale" || dependency === "stale") return "stale";
  return primary;
}

async function quoteForItem(item: PriceRequestItem): Promise<Quote> {
  if (isCryptoAssetClass(item.assetClass)) {
    const coinId = item.priceId?.trim().toLowerCase() || cryptoIds[item.symbol.toUpperCase()];
    if (!coinId) throw new Error("Nieznany symbol krypto — podaj CoinGecko ID");
    const loaded = await cryptoPrice(coinId);
    return {
      id: item.id,
      symbol: item.symbol,
      pricePln: loaded.value.pricePln,
      nativePrice: loaded.value.pricePln,
      nativeCurrency: "PLN",
      changePct: loaded.value.changePct,
      updatedAt: new Date(loaded.value.timestamp * 1000).toISOString(),
      provider: "CoinGecko",
      quality: loaded.quality,
    };
  }

  if (item.assetClass === "Inne") throw new Error("Brak automatycznego źródła notowania");

  if (isCashAsset(item.assetClass)) {
    if (item.symbol.toUpperCase() === "PLN") {
      return { id: item.id, symbol: item.symbol, pricePln: 1, nativePrice: 1, nativeCurrency: "PLN", changePct: 0, updatedAt: new Date().toISOString(), provider: "NBP", quality: "live" };
    }
    const fx = await getFx(item.symbol.toUpperCase());
    return { id: item.id, symbol: item.symbol, pricePln: fx.rate, nativePrice: fx.rate, nativeCurrency: "PLN", changePct: null, updatedAt: new Date().toISOString(), provider: fx.provider, quality: fx.quality };
  }

  const loaded = await yahooMeta(yahooSymbol(item.symbol));
  const fx = await getFx(loaded.value.currency);
  return {
    id: item.id,
    symbol: item.symbol,
    pricePln: loaded.value.price * fx.rate,
    nativePrice: loaded.value.price,
    nativeCurrency: loaded.value.currency,
    changePct: Number.isFinite(loaded.value.previous) && loaded.value.previous > 0 ? (loaded.value.price / loaded.value.previous - 1) * 100 : null,
    updatedAt: new Date(loaded.value.timestamp * 1000).toISOString(),
    provider: "Yahoo Finance",
    quality: quoteQuality(loaded.quality, fx.quality),
  };
}

function responseStatus(quotes: Quote[], missingCount: number) {
  if (!quotes.length && missingCount > 0) return "error" as const;
  if (missingCount > 0) return "partial" as const;
  if (quotes.some(quote => quote.quality === "stale")) return "stale" as const;
  return "complete" as const;
}

function payloadFor(quotes: Quote[], missing: Array<{ id: string; symbol: string; reason: string }>) {
  return {
    quotes,
    missing,
    updatedAt: new Date().toISOString(),
    status: responseStatus(quotes, missing.length),
    quality: {
      live: quotes.filter(quote => quote.quality === "live").length,
      cached: quotes.filter(quote => quote.quality === "cached").length,
      stale: quotes.filter(quote => quote.quality === "stale").length,
      missing: missing.length,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { items?: PriceRequestItem[] };
    const items = Array.isArray(body.items) ? body.items.slice(0, 100).filter(item => item?.id && item?.symbol) : [];
    if (!items.length) return Response.json(payloadFor([], []), { headers: { "cache-control": "no-store" } });

    const results = await Promise.allSettled(items.map(quoteForItem));
    const quotes: Quote[] = [];
    const missing: Array<{ id: string; symbol: string; reason: string }> = [];
    results.forEach((result, index) => {
      const item = items[index];
      if (result.status === "fulfilled") quotes.push(result.value);
      else missing.push({ id: item.id, symbol: item.symbol, reason: errorMessage(result.reason) });
    });

    return Response.json(payloadFor(quotes, missing), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Nie udało się pobrać cen") }, { status: 500 });
  }
}
