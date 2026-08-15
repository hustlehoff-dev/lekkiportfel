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
