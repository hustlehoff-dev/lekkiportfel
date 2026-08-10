import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditTradesWithNbp, calculateLossCarryforward, calculateTaxSummary } from "../lib/tax-calculator.ts";

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
  assert.equal(result.trades.taxBeforeCredit, 17.1);
  assert.equal(result.trades.tax, 17);
  assert.equal(result.foreignDividends.taxDue, 4);
  assert.equal(result.domesticDividends.gross, 80);
  assert.equal(result.retirementAccounts.trades, 1);
  assert.equal(result.retirementAccounts.dividends, 1);
  assert.equal(result.totalTaxDue, 21);
});

test("loss register uses only the previous five years and the oldest loss first", () => {
  const trades = [
    { date: "2020-06-10", saleValue: 100, purchaseValue: 1100, result: -1000, account: "PLN" },
    { date: "2021-06-10", saleValue: 200, purchaseValue: 500, result: -300, account: "PLN" },
    { date: "2023-06-10", saleValue: 400, purchaseValue: 600, result: -200, account: "PLN" },
  ];
  const result = calculateLossCarryforward({ targetYear: 2026, trades, currentIncome: 120 });

  assert.deepEqual(result.rows.map(row => row.year), [2021, 2022, 2023, 2024, 2025]);
  assert.equal(result.rows[0].detectedLoss, 300);
  assert.equal(result.rows[0].deduction, 120);
  assert.equal(result.rows[2].deduction, 0);
  assert.equal(result.totalDeduction, 120);
  assert.equal(result.incomeAfterDeduction, 0);
});

test("loss register applies the 50 percent cap after the one-time method was used", () => {
  const result = calculateLossCarryforward({
    targetYear: 2026,
    currentIncome: 500,
    trades: [{ date: "2023-06-10", saleValue: 100, purchaseValue: 400, result: -300, account: "PLN" }],
    settings: { "2023": { declaredLoss: 300, usedBefore: 20, oneTimeUsed: true } },
  });
  const row = result.rows.find(item => item.year === 2023);

  assert.equal(row?.annualLimit, 150);
  assert.equal(row?.deduction, 150);
  assert.equal(row?.remainingAfterCurrentYear, 130);
  assert.equal(result.incomeAfterDeduction, 350);
});

test("tax view has a local PIT-38 route and data-quality warnings", async () => {
  const [page, route, nbpRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/podatki/page.tsx", root), "utf8"),
    readFile(new URL("app/api/tax/nbp/route.ts", root), "utf8"),
  ]);

  assert.match(page, /podatki:"\/podatki"/);
  assert.match(page, /Szacowany podatek do zapłaty/);
  assert.match(page, /Wiarygodność wyliczenia/);
  assert.match(page, /Ręcznie dodane krypto nie ma historii transakcji/);
  assert.match(page, /Zgodne z NBP/);
  assert.match(page, /Mapa pól PIT-38/);
  assert.match(page, /PIT-38\(18\)/);
  assert.match(page, /\["23","Inne przychody"/);
  assert.match(page, /\["50","Łączny podatek do zapłaty"/);
  assert.match(page, /Oficjalne API NBP/);
  assert.match(page, /Rejestr strat do odliczenia/);
  assert.match(page, /Limit jednorazowy użyty/);
  assert.match(page, /taxLosses/);
  assert.match(route, /initialView="podatki"/);
  assert.match(nbpRoute, /https:\/\/api\.nbp\.pl\/api\/exchangerates\/rates\/a\//);
  assert.match(nbpRoute, /end\.setUTCDate\(end\.getUTCDate\(\) - 1\)/);
});

test("NBP audit recalculates foreign purchase and sale independently", () => {
  const trade = { id: "trade-1", date: "2025-06-10", openDate: "2025-01-10", symbol: "TEST.US", volume: 2, openPrice: 10, closePrice: 12, purchaseValue: 80, saleValue: 98.4, result: 18.4, account: "PLN" };
  const rates = [
    { currency: "USD", transactionDate: "2025-01-10", effectiveDate: "2025-01-09", rate: 4, tableNo: "006/A/NBP/2025", source: "NBP tabela A" },
    { currency: "USD", transactionDate: "2025-06-10", effectiveDate: "2025-06-09", rate: 4.1, tableNo: "110/A/NBP/2025", source: "NBP tabela A" },
  ];
  const result = auditTradesWithNbp([trade], rates);

  assert.equal(result.audit[0].status, "verified");
  assert.equal(result.auditedTrades[0].purchaseValue, 80);
  assert.equal(result.auditedTrades[0].saleValue, 98.4);
  assert.ok(Math.abs(result.auditedTrades[0].result - 18.4) < 1e-9);
});
