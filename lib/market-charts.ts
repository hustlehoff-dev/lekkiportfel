export type ChartInstrumentKind = "crypto" | "market";

export type ChartPeriod = "1D" | "1T" | "1M" | "3M" | "1R" | "5L" | "MAX";

export type ChartInstrument = {
  key: string;
  symbol: string;
  name: string;
  kind: ChartInstrumentKind;
  providerId: string;
  exchange: string;
};

export type ChartablePosition = {
  symbol: string;
  name: string;
  assetClass: string;
  priceId?: string;
};

const cryptoProviderIds: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  BNB: "binancecoin",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  TRX: "tron",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  UNI: "uniswap",
  AAVE: "aave",
  NEAR: "near",
  ATOM: "cosmos",
  USDT: "tether",
  USDC: "usd-coin",
};

const marketSuffixes: Array<[string, string]> = [
  [".PL", ".WA"], [".UK", ".L"], [".DK", ".CO"], [".NL", ".AS"],
  [".FR", ".PA"], [".ES", ".MC"], [".IT", ".MI"], [".CH", ".SW"],
  [".SE", ".ST"], [".NO", ".OL"], [".DE", ".DE"],
];

export function chartInstrumentForPosition(position: ChartablePosition): ChartInstrument | null {
  const symbol = position.symbol.trim().toUpperCase();
  if (!symbol || /got|cash|inne/i.test(position.assetClass)) return null;
  if (/krypto|crypto|stable/i.test(position.assetClass)) {
    const providerId = position.priceId?.trim().toLowerCase() || cryptoProviderIds[symbol];
    if (!providerId) return null;
    return { key: `crypto:${providerId}`, symbol, name: position.name || symbol, kind: "crypto", providerId, exchange: "Krypto" };
  }
  let providerId = symbol.endsWith(".US") ? symbol.slice(0, -3).replace(".", "-") : symbol;
  for (const [source, target] of marketSuffixes) {
    if (providerId.endsWith(source)) {
      providerId = `${providerId.slice(0, -source.length)}${target}`;
      break;
    }
  }
  if (!safeMarketSymbol(providerId)) return null;
  return { key: `market:${providerId}`, symbol, name: position.name || symbol, kind: "market", providerId, exchange: symbol.endsWith(".PL") ? "GPW" : "Rynek" };
}

export const chartPeriods: ChartPeriod[] = ["1D", "1T", "1M", "3M", "1R", "5L", "MAX"];

export const featuredChartInstruments: ChartInstrument[] = [
  { key: "crypto:bitcoin", symbol: "BTC", name: "Bitcoin", kind: "crypto", providerId: "bitcoin", exchange: "Krypto" },
  { key: "crypto:ethereum", symbol: "ETH", name: "Ethereum", kind: "crypto", providerId: "ethereum", exchange: "Krypto" },
  { key: "market:WIG.WA", symbol: "WIG", name: "WIG", kind: "market", providerId: "WIG.WA", exchange: "GPW" },
  { key: "market:WIG20.WA", symbol: "WIG20", name: "WIG20", kind: "market", providerId: "WIG20.WA", exchange: "GPW" },
  { key: "market:^GSPC", symbol: "S&P 500", name: "S&P 500", kind: "market", providerId: "^GSPC", exchange: "S&P DJI" },
  { key: "market:^IXIC", symbol: "NASDAQ", name: "Nasdaq Composite", kind: "market", providerId: "^IXIC", exchange: "Nasdaq" },
];

export const yahooPeriodConfig: Record<ChartPeriod, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1T": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "1R": { range: "1y", interval: "1d" },
  "5L": { range: "5y", interval: "1wk" },
  MAX: { range: "max", interval: "1mo" },
};

export const coinGeckoDays: Record<ChartPeriod, string> = {
  "1D": "1",
  "1T": "7",
  "1M": "30",
  "3M": "90",
  "1R": "365",
  "5L": "1825",
  MAX: "max",
};

export function isChartPeriod(value: string | null): value is ChartPeriod {
  return chartPeriods.includes(value as ChartPeriod);
}

export function safeMarketSymbol(value: string) {
  const symbol = value.trim();
  return /^[a-z0-9.^=_-]{1,40}$/i.test(symbol) ? symbol : null;
}

export function safeCoinId(value: string) {
  const id = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(id) ? id : null;
}
