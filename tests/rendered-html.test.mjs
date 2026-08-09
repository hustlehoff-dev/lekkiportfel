import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateTaxSummary } from "../lib/tax-calculator.ts";

const root = new URL("../", import.meta.url);

test("dashboard exposes real monthly performance and benchmark controls", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /Miesięczny wynik na wzroście aktywów/);
  assert.match(page, /Portfel vs \$\{performance\.benchmark\.name\}/);
  assert.match(page, /\["6M","1R","3L","MAX"\]/);
  assert.match(page, /\/api\/performance/);
  assert.match(page, /type OpenLot/);
  assert.match(page, /openDate:/);
  assert.match(page, /purchaseValue:/);
  assert.match(page, /\/api\/fx/);
  assert.match(page, /kapital-currency/);
  assert.match(page, /aria-label="Waluta prezentacji"/);
  assert.match(page, /kapital-theme/);
  assert.match(page, /aria-label="Wygląd aplikacji"/);
  assert.match(page, /className="topbar-search"/);
  assert.match(page, /className="dashboard-intro"/);
  assert.match(page, /Ctrl K/);
});

test("metric cards stay dense at desktop and mobile widths", async () => {
  const css = await readFile(new URL("app/account.css", root), "utf8");
  assert.match(css, /\.hero-grid\s*\{\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.hero-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.performance-summary\s*\{\s*display:\s*grid/);
  assert.match(css, /\.performance-chart\.market/);
  assert.match(css, /data-portfolio-theme="lekka"/);
  assert.match(css, /#f7c400/);
  assert.match(css, /width:\s*256px/);
  assert.match(css, /height:\s*72px/);
  assert.match(css, /max-width:\s*1180px/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});

test("security page keeps ServiceBooker section names 1:1", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const headings = [
    "Logowanie i sesja",
    "Dane bez konta",
    "Dane zespołu",
    "Usuwanie i eksport",
    "Zabezpieczenia techniczne",
    "Dostawcy usług technicznych",
    "Ochrona Twojego konta",
    "Zgłaszanie podatności",
  ];

  for (const heading of headings) {
    assert.match(page, new RegExp(`<h2>${heading}</h2>`));
  }

  assert.match(page, /Portfel może zawierać akcje, ETF-y, kryptowaluty, gotówkę/);
  assert.doesNotMatch(page, /Raport XTB zawiera otwarte pozycje/);
});

test("performance API reconciles XTB sales and converts the benchmark to PLN", async () => {
  const route = await readFile(new URL("app/api/performance/route.ts", root), "utf8");
  assert.match(route, /reportedSale/);
  assert.match(route, /trade\.result/);
  assert.match(route, /historyPln\("\^GSPC"/);
  assert.match(route, /USD\/PLN/);
  assert.match(route, /capitalGain/);
  assert.match(route, /benchmarkPct/);
});

test("XTB import preserves source fields required for a tax audit trail", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  for (const field of [
    "sourceId",
    "positionId",
    "product",
    "grossProfit",
    "commission",
    "swap",
    "rollover",
    "openConversionRate",
    "closeConversionRate",
    "closeOrigin",
  ]) {
    assert.match(page, new RegExp(`${field}:optionalReport`));
  }

  assert.match(page, /sourceId:pick\(headers,\["id"\]\)/);
  assert.match(page, /positionId:pick\(headers,\["position id","id pozycji"\]\)/);
  assert.match(page, /category:pick\(headers,\["category","kategoria"\]\),product:pick\(headers,\["product"\]\)/);
});

test("tax calculator separates ordinary accounts from IKE and IKZE", () => {
  const result = calculateTaxSummary({
    year: 2025,
    eligiblePriorLoss: 100,
    extraCosts: 10,
    trades: [
      { date: "2025-04-10", account: "PLN", saleValue: 1200, purchaseValue: 1000, result: 200 },
      { date: "2025-05-10", account: "IKE", saleValue: 900, purchaseValue: 500, result: 400 },
    ],
    cash: [
      { date: "2025-06-10", account: "PLN", type: "DIVIDENT", symbol: "MSFT.US", amount: 100 },
      { date: "2025-06-10", account: "PLN", type: "Withholding Tax", symbol: "MSFT.US", amount: -15 },
      { date: "2025-07-10", account: "PLN", type: "DIVIDENT", symbol: "PKO.PL", amount: 80 },
      { date: "2025-08-10", account: "IKZE", type: "DIVIDENT", symbol: "MSFT.US", amount: 50 },
    ],
  });

  assert.equal(result.trades.revenue, 1200);
  assert.equal(result.trades.costs, 1010);
  assert.equal(result.trades.taxableBase, 90);
  assert.equal(result.trades.tax, 17);
  assert.equal(result.foreignDividends.taxDue, 4);
  assert.equal(result.domesticDividends.gross, 80);
  assert.equal(result.retirementAccounts.trades, 1);
  assert.equal(result.retirementAccounts.dividends, 1);
  assert.equal(result.totalTaxDue, 21);
});

test("tax view has a local PIT-38 route and data-quality warnings", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/podatki/page.tsx", root), "utf8"),
  ]);

  assert.match(page, /podatki:"\/podatki"/);
  assert.match(page, /Szacowany podatek do zapłaty/);
  assert.match(page, /Wiarygodność wyliczenia/);
  assert.match(page, /Ręcznie dodane krypto nie ma historii transakcji/);
  assert.match(route, /initialView="podatki"/);
});
