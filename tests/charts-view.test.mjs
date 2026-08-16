import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  chartPeriods,
  coinGeckoDays,
  featuredChartInstruments,
  isChartPeriod,
  safeCoinId,
  safeMarketSymbol,
  yahooPeriodConfig,
} from "../lib/market-charts.ts";

const root = new URL("../", import.meta.url);

test("market chart presets cover crypto, GPW and US indices", () => {
  assert.deepEqual(featuredChartInstruments.map(item => item.symbol), ["BTC", "ETH", "WIG", "WIG20", "S&P 500", "NASDAQ"]);
  assert.equal(featuredChartInstruments.find(item => item.symbol === "WIG")?.providerId, "WIG.WA");
  assert.equal(featuredChartInstruments.find(item => item.symbol === "S&P 500")?.providerId, "^GSPC");
  assert.equal(featuredChartInstruments.find(item => item.symbol === "NASDAQ")?.providerId, "^IXIC");
});

test("every chart period has provider configuration", () => {
  for (const period of chartPeriods) {
    assert.ok(yahooPeriodConfig[period]);
    assert.ok(coinGeckoDays[period]);
    assert.equal(isChartPeriod(period), true);
  }
  assert.equal(isChartPeriod("2L"), false);
});

test("chart provider identifiers reject URL and query injection", () => {
  assert.equal(safeMarketSymbol("WIG20.WA"), "WIG20.WA");
  assert.equal(safeMarketSymbol("^GSPC"), "^GSPC");
  assert.equal(safeMarketSymbol("BTC-USD"), "BTC-USD");
  assert.equal(safeMarketSymbol("https://example.com"), null);
  assert.equal(safeMarketSymbol("AAPL&range=max"), null);
  assert.equal(safeCoinId("bitcoin"), "bitcoin");
  assert.equal(safeCoinId("ethereum?x=1"), null);
});

test("charts view exposes search, periods, source and responsive dark mode", async () => {
  const [page, dashboard, chartPage] = await Promise.all([
    readFile(new URL("app/wykresy/charts-view.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/wykresy/page.tsx", root), "utf8"),
  ]);
  const route = await readFile(new URL("app/api/charts/route.ts", root), "utf8");
  const css = await readFile(new URL("app/wykresy/charts.css", root), "utf8");
  assert.match(page, /Szukaj BTC, spółki, ETF-u lub indeksu/);
  assert.match(page, /chartPeriods\.map/);
  assert.match(page, /Źródło/);
  assert.match(page, /<PriceChart data=\{data\} period=\{period\}/);
  assert.match(dashboard, /selectView\("wykresy"\)/);
  assert.doesNotMatch(dashboard, /window\.location\.assign\("\/wykresy"\)/);
  assert.doesNotMatch(dashboard, /router\.push\("\/wykresy"\)/);
  assert.match(dashboard, /type AppView = "pulpit"\|"wykresy"/);
  assert.match(dashboard, /view==="wykresy"&&<ChartsView chartColor=\{chartColor\}\/>/);
  assert.match(chartPage, /<PortfolioApp initialView="wykresy"/);
  assert.match(page, /<AssetIcon/);
  assert.match(page, /--user-chart-color/);
  assert.match(dashboard, /type="color" value=\{chartColor\}/);
  assert.match(dashboard, /lekkiportfel-chart-color/);
  assert.match(route, /api\.coingecko\.com\/api\/v3\/coins/);
  assert.match(route, /query1\.finance\.yahoo\.com\/v8\/finance\/chart/);
  assert.match(route, /query2\.finance\.yahoo\.com\/v1\/finance\/search/);
  assert.match(route, /api\.bankier\.pl\/quotes\/public\/gpw-indices-section-chart/);
  assert.match(route, /provider: "Bankier\.pl"/);
  assert.match(route, /period === "MAX" \? "max_period=true"/);
  assert.match(route, /function downsample\(points: ChartPoint\[], limit = 1200\)/);
  assert.doesNotMatch(route, /api\/v3\/simple\/price/);
  assert.match(route, /const inflight = new Map/);
  assert.match(route, /stale-if-error=86400/);
  assert.match(route, /Dostawca chwilowo ograniczył liczbę zapytań/);
  assert.match(page, /lekkiportfel-chart:/);
  assert.match(page, /Pokazuję ostatnie zapisane notowania/);
  assert.match(css, /data-color-theme="dark"\] \.charts-shell/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0,1fr\)\)/);
  assert.match(css, /\.market-chart\.negative \{ color: var\(--user-chart-color\); \}/);
});
