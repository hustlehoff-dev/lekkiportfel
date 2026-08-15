import { isCryptoAssetClass } from "../../../lib/asset-class";

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
  provider: "Yahoo Finance" | "CoinGecko";
};

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

let cached: { key: string; expires: number; payload: unknown } | null = null;
let fxCached: { expires: number; rates: Map<string, number> } | null = null;

function yahooSymbol(input: string) {
  const symbol = input.trim().toUpperCase();
  if (symbol.endsWith(".US")) return symbol.slice(0, -3).replace(".", "-");
  for (const [xtb, yahoo] of suffixes) if (symbol.endsWith(xtb)) return `${symbol.slice(0, -xtb.length)}${yahoo}`;
  return symbol;
}

function isCashAsset(assetClass: string) {
  return /got|cash/i.test(assetClass);
}

async function yahooMeta(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const response = await fetch(url, { headers: { "accept": "application/json", "user-agent": "LekkiPortfel/1.0" } });
  if (!response.ok) throw new Error(`notowanie ${response.status}`);
  const body = await response.json() as { chart?: { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = body.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number") ?? [];
  const price = Number(meta?.regularMarketPrice ?? closes.at(-1));
  if (!Number.isFinite(price) || price <= 0) throw new Error("brak ceny");
  return {
    price,
    currency: String(meta?.currency || "PLN"),
    previous: Number(meta?.chartPreviousClose ?? meta?.previousClose),
    timestamp: Number(meta?.regularMarketTime) || Math.floor(Date.now() / 1000),
  };
}

async function getFx(currency: string, rates: Map<string, Promise<number>>) {
  const normalized = currency === "GBp" ? "GBP" : currency.toUpperCase();
  if (normalized === "PLN") return currency === "GBp" ? 0.01 : 1;
  if (!rates.has(normalized)) rates.set(normalized, (async () => {
    if (!fxCached || fxCached.expires <= Date.now()) {
      const response = await fetch("https://api.nbp.pl/api/exchangerates/tables/A/?format=json", { headers: { accept: "application/json", "user-agent": "LekkiPortfel/1.0" } });
      if (!response.ok) throw new Error(`NBP ${response.status}`);
      const table = await response.json() as Array<{ rates?: Array<{ code: string; mid: number }> }>;
      fxCached = { expires: Date.now() + 15 * 60_000, rates: new Map((table[0]?.rates || []).map(rate => [rate.code, rate.mid])) };
    }
    const officialRate = fxCached.rates.get(normalized);
    if (officialRate && officialRate > 0) return officialRate;
    return yahooMeta(`${normalized}PLN=X`).then(result => result.price);
  })());
  const rate = await rates.get(normalized)!;
  return currency === "GBp" ? rate / 100 : rate;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { items?: PriceRequestItem[] };
    const items = Array.isArray(body.items) ? body.items.slice(0, 100).filter(item => item?.id && item?.symbol) : [];
    if (!items.length) return Response.json({ quotes: [], missing: [], updatedAt: new Date().toISOString() });
    const key = JSON.stringify(items.map(item => [item.id, item.symbol, item.assetClass, item.currency, item.priceId]));
    if (cached && cached.key === key && cached.expires > Date.now()) return Response.json(cached.payload);

    const rates = new Map<string, Promise<number>>();
    const marketQuotes = new Map<string, ReturnType<typeof yahooMeta>>();
    const quotes: Quote[] = [];
    const missing: Array<{ id: string; symbol: string; reason: string }> = [];
    const crypto = items.filter(item => isCryptoAssetClass(item.assetClass));
    const market = items.filter(item => !isCryptoAssetClass(item.assetClass) && item.assetClass !== "Inne");

    if (crypto.length) {
      const byId = new Map<string, string>();
      for (const item of crypto) {
        const coinId = item.priceId?.trim().toLowerCase() || cryptoIds[item.symbol.toUpperCase()];
        if (coinId) byId.set(item.id, coinId); else missing.push({ id: item.id, symbol: item.symbol, reason: "Nieznany symbol krypto — podaj CoinGecko ID" });
      }
      const ids = [...new Set(byId.values())];
      if (ids.length) {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=pln&include_24hr_change=true&include_last_updated_at=true`;
        try {
          const response = await fetch(url, { headers: { "accept": "application/json", "user-agent": "LekkiPortfel/1.0" } });
          if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
          const result = await response.json() as Record<string, { pln?: number; pln_24h_change?: number; last_updated_at?: number }>;
          for (const item of crypto) {
            const coinId = byId.get(item.id); if (!coinId) continue;
            const row = result[coinId];
            if (!row?.pln) missing.push({ id: item.id, symbol: item.symbol, reason: "Brak ceny CoinGecko" });
            else quotes.push({ id: item.id, symbol: item.symbol, pricePln: row.pln, nativePrice: row.pln, nativeCurrency: "PLN", changePct: row.pln_24h_change ?? null, updatedAt: new Date((row.last_updated_at || Date.now() / 1000) * 1000).toISOString(), provider: "CoinGecko" });
          }
        } catch (error) {
          for (const item of crypto.filter(item => byId.has(item.id))) missing.push({ id: item.id, symbol: item.symbol, reason: error instanceof Error ? error.message : "Błąd CoinGecko" });
        }
      }
    }

    await Promise.all(market.map(async item => {
      try {
        if (isCashAsset(item.assetClass) && item.symbol.toUpperCase() === "PLN") {
          quotes.push({ id: item.id, symbol: item.symbol, pricePln: 1, nativePrice: 1, nativeCurrency: "PLN", changePct: 0, updatedAt: new Date().toISOString(), provider: "Yahoo Finance" });
          return;
        }
        if (isCashAsset(item.assetClass)) {
          const rate = await getFx(item.symbol.toUpperCase(), rates);
          quotes.push({ id: item.id, symbol: item.symbol, pricePln: rate, nativePrice: rate, nativeCurrency: "PLN", changePct: null, updatedAt: new Date().toISOString(), provider: "Yahoo Finance" });
          return;
        }
        const ticker = yahooSymbol(item.symbol);
        if (!marketQuotes.has(ticker)) marketQuotes.set(ticker, yahooMeta(ticker));
        const meta = await marketQuotes.get(ticker)!;
        const rate = await getFx(meta.currency, rates);
        quotes.push({ id: item.id, symbol: item.symbol, pricePln: meta.price * rate, nativePrice: meta.price, nativeCurrency: meta.currency, changePct: Number.isFinite(meta.previous) && meta.previous > 0 ? (meta.price / meta.previous - 1) * 100 : null, updatedAt: new Date(meta.timestamp * 1000).toISOString(), provider: "Yahoo Finance" });
      } catch (error) {
        missing.push({ id: item.id, symbol: item.symbol, reason: error instanceof Error ? error.message : "Brak notowania" });
      }
    }));

    const payload = { quotes, missing, updatedAt: new Date().toISOString() };
    cached = { key, expires: Date.now() + 45_000, payload };
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać cen" }, { status: 500 });
  }
}
