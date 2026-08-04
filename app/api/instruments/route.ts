type InstrumentResult = {
  key: string;
  symbol: string;
  name: string;
  assetClass: "Krypto" | "Akcje" | "ETF";
  exchange: string;
  priceId?: string;
  image?: string;
  rank?: number | null;
  sector?: string;
  pricePln?: number;
};

const cache = new Map<string, { expires: number; results: InstrumentResult[] }>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const kind = url.searchParams.get("kind") === "crypto" ? "crypto" : "market";
  if (query.length < 2) return Response.json({ results: [] });
  const cacheKey = `${kind}:${query.toLowerCase()}`;
  const saved = cache.get(cacheKey);
  if (saved && saved.expires > Date.now()) return Response.json({ results: saved.results });

  try {
    let results: InstrumentResult[];
    if (kind === "crypto") {
      const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, { headers: { "accept": "application/json", "user-agent": "Kapital-Portfolio/1.0" } });
      if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
      const body = await response.json() as { coins?: Array<{ id: string; name: string; symbol: string; market_cap_rank?: number | null; thumb?: string }> };
      const coins = (body.coins || []).slice(0, 8);
      const ids = coins.map(coin => coin.id);
      let prices: Record<string, { pln?: number }> = {};
      if (ids.length) {
        const priceResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=pln`, { headers: { "accept": "application/json", "user-agent": "Kapital-Portfolio/1.0" } });
        if (priceResponse.ok) prices = await priceResponse.json() as Record<string, { pln?: number }>;
      }
      results = coins.map(coin => ({ key: `crypto:${coin.id}`, symbol: coin.symbol.toUpperCase(), name: coin.name, assetClass: "Krypto", exchange: "CoinGecko", priceId: coin.id, image: coin.thumb, rank: coin.market_cap_rank ?? null, pricePln: prices[coin.id]?.pln }));
    } else {
      const response = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0&enableFuzzyQuery=true`, { headers: { "accept": "application/json", "user-agent": "Kapital-Portfolio/1.0" } });
      if (!response.ok) throw new Error(`wyszukiwarka rynku ${response.status}`);
      const body = await response.json() as { quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchDisp?: string; exchange?: string; sector?: string; isYahooFinance?: boolean }> };
      results = (body.quotes || []).filter(row => row.symbol && ["EQUITY", "ETF", "MUTUALFUND"].includes(row.quoteType || "") && row.isYahooFinance !== false).map(row => ({ key: `market:${row.symbol}`, symbol: row.symbol!, name: row.longname || row.shortname || row.symbol!, assetClass: row.quoteType === "EQUITY" ? "Akcje" : "ETF", exchange: row.exchDisp || row.exchange || "Giełda", sector: row.sector })).sort((a, b) => Number(/\.WA$|WSE/i.test(b.symbol + b.exchange)) - Number(/\.WA$|WSE/i.test(a.symbol + a.exchange))).slice(0, 8);
    }
    cache.set(cacheKey, { expires: Date.now() + 300_000, results });
    return Response.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się wyszukać instrumentów" }, { status: 502 });
  }
}
