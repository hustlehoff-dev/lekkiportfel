import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { auditTradesWithNbp, calculateCryptoTax, calculateLossCarryforward, calculateTaxSummary } from "../lib/tax-calculator.ts";
import { calculateLiquidationTax, calculateRetirementExitTax } from "../lib/liquidation-tax.ts";
import { buildDividendForecast, inferMonthlyContribution } from "../lib/dividend-forecast.ts";
import { groupDividendForecast, groupDividendHistory } from "../lib/dividend-groups.ts";
import { buildCsvZipBytes, buildXlsxBytes } from "../lib/spreadsheet-export.ts";
import { marketFor, matchesMarket } from "../lib/portfolio-market.ts";
import { assetInitials, assetLogoSource, assetLogoSources, fallbackAssetSvg, logoTicker } from "../lib/asset-icons.ts";

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
  assert.match(page, /lekkiportfel-currency/);
  assert.match(page, /aria-label="Waluta prezentacji"/);
  assert.match(page, /lekkiportfel-theme/);
  assert.match(page, /aria-label="Wygląd aplikacji"/);
  assert.match(page, /className="topbar-search"/);
  assert.match(page, /dashboard-intro/);
  assert.match(page, /aria-label="Dostawca danych"/);
  assert.match(page, /aria-label="Rynek aktywów"/);
  assert.match(page, /marketFilterLabels/);
  assert.match(page, /providerName/);
  assert.match(page, /provider:"XTB"/);
  assert.match(page, /Cały portfel/);
  assert.doesNotMatch(page, /Rachunki zwykłe|Emerytalne · IKE \+ IKZE|matchesPortfolioScope/);
  assert.match(page, /Ctrl K/);
  assert.doesNotMatch(page, /Przywróć dane demo|Zobacz demo|demoData/);
  assert.doesNotMatch(page, /Portfel zapisany w aplikacji|Dostawcy notowań dostają symbol instrumentu/);
  assert.match(page, /<footer className="sidebar-footer">/);
  assert.doesNotMatch(page, /<footer><span>Kapitał<\/span>/);
});

test("market filter separates GPW and recalculates a focused portfolio", () => {
  const positions=[
    {symbol:"XTB.PL",assetClass:"Akcje",value:60},
    {symbol:"DNP.WA",assetClass:"Akcje",value:40},
    {symbol:"EQIX.US",assetClass:"Akcje",value:50},
    {symbol:"USDT",assetClass:"Krypto",value:100},
    {symbol:"PLN",assetClass:"Gotówka",value:25},
  ];
  assert.equal(marketFor(positions[0]),"gpw");
  assert.equal(marketFor(positions[1]),"gpw");
  assert.equal(marketFor(positions[2]),"foreign");
  assert.equal(marketFor(positions[3]),"crypto");
  assert.equal(marketFor(positions[4]),"cash");
  const gpw=positions.filter(item=>matchesMarket(item,"gpw"));
  assert.equal(gpw.reduce((sum,item)=>sum+item.value,0),100);
  assert.deepEqual(gpw.map(item=>item.value/100),[0.6,0.4]);
});

test("allocation chart and table share selection and expose the full portfolio", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/account.css", root), "utf8");
  assert.match(page, /displayedAllocationItems/);
  assert.match(page, /activeLabel=\{activeAllocation\}/);
  assert.match(page, /setAllocationHover/);
  assert.match(page, /Pokaż wszystkie \(\$\{allocationItems\.length\}\)/);
  assert.match(page, /Pozostałe \(\$\{hidden\.length\}\)/);
  assert.match(css, /\.donut\.has-active \.donut-segment:not\(\.active\)/);
  assert.match(css, /\.allocation-table > button\.active/);
  assert.match(css, /\.allocation-table\.expanded/);
});

test("asset icons support broker tickers, crypto images and safe fallbacks", async () => {
  assert.equal(logoTicker("XTB.PL"), "XTB.WA");
  assert.equal(logoTicker("EQIX.US"), "EQIX");
  assert.match(assetLogoSource("USDT", "Krypto"), /\/crypto\/USDT/);
  assert.equal(assetLogoSource("PLN", "Gotówka"), null);
  assert.equal(assetLogoSource("BTC", "Krypto", "https://example.com/logo.png"), "https://img.loadlogo.com/crypto/BTC?size=96&format=webp&fit=contain&fallback=404");
  assert.equal(assetLogoSource("BTC", "Krypto", "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png"), "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png");
  assert.match(assetLogoSources("XTB.PL", "Akcje")[1], /financialmodelingprep\.com\/image-stock\/XTB.WA\.png/);
  assert.equal(assetInitials("XTB.PL"), "XT");
  assert.match(fallbackAssetSvg("XTB.PL", "Akcje"), />XT<\/text>/);

  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const component = await readFile(new URL("app/components/asset-icon.tsx", root), "utf8");
  const route = await readFile(new URL("app/api/asset-icon/route.ts", root), "utf8");
  assert.match(page, /<AssetIcon symbol=\{p\.symbol\}/);
  assert.match(page, /className="dividend-logo"/);
  assert.match(component, /\/api\/asset-icon/);
  assert.match(route, /fallbackAssetSvg/);
  assert.match(route, /max-age=604800/);
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

test("Firebase accounts isolate portfolios and initialize new accounts", async () => {
  const client = await readFile(new URL("lib/firebase-client.ts", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const rules = await readFile(new URL("firestore.rules", root), "utf8");
  const env = await readFile(new URL(".env.example", root), "utf8");

  assert.match(client, /createUserWithEmailAndPassword/);
  assert.match(client, /sendEmailVerification/);
  assert.match(client, /sendPasswordResetEmail/);
  assert.match(client, /GoogleAuthProvider/);
  assert.match(client, /signInWithPopup/);
  assert.match(client, /browserLocalPersistence/);
  assert.match(client, /browserSessionPersistence/);
  assert.match(client, /"users",uid,"portfolio","main"/);
  assert.doesNotMatch(client, /firebase\/functions/);
  assert.match(page, /loginWithPassword/);
  assert.match(page, /loginWithGoogle/);
  assert.match(page, /Kontynuuj z Google/);
  assert.match(page, /loadUserPortfolio<PortfolioData>/);
  assert.match(page, /saveUserPortfolio\(firebaseUser\.uid/);
  assert.match(page, /portfolio\|\|\{\.\.\.emptyData,positions:\[\],cash:\[\],trades:\[\],lots:\[\]\}/);
  assert.doesNotMatch(page, /MigrationScreen|needsMigration|LEGACY_MIGRATION_KEY|x-migration-key/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(env, /NEXT_PUBLIC_FIREBASE_PROJECT_ID=/);
  assert.doesNotMatch(env, /LEGACY_MIGRATION_KEY/);
});

test("repository contains product code instead of starter and demo leftovers", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  const readme = await readFile(new URL("README.md", root), "utf8");
  const packageJson = await readFile(new URL("package.json", root), "utf8");

  assert.match(page, /LEKKIPORTFEL/);
  assert.match(layout, /LekkiPortfel — cały majątek w jednym miejscu/);
  assert.doesNotMatch(`${page}\n${layout}\n${readme}`, /Użytkownik 1|Lokalny zapis użytkownika 1|vinext-starter|Optional Dispatch-Owned|ChatGPT Sign-In/);
  assert.doesNotMatch(packageJson, /drizzle|db:generate/);
  await assert.rejects(readFile(new URL("app/api/portfolio/route.ts", root), "utf8"));
  await assert.rejects(readFile(new URL("app/chatgpt-auth.ts", root), "utf8"));
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

test("loss register uses only confirmed losses from the previous five years and the oldest first", () => {
  const trades = [
    { date: "2020-06-10", saleValue: 100, purchaseValue: 1100, result: -1000, account: "PLN" },
    { date: "2021-06-10", saleValue: 200, purchaseValue: 500, result: -300, account: "PLN" },
    { date: "2023-06-10", saleValue: 400, purchaseValue: 600, result: -200, account: "PLN" },
  ];
  const result = calculateLossCarryforward({ targetYear: 2026, trades, currentIncome: 120, settings: { "2021": { enabled: true }, "2023": { enabled: true } } });

  assert.deepEqual(result.rows.map(row => row.year), [2021, 2022, 2023, 2024, 2025]);
  assert.equal(result.rows[0].detectedLoss, 300);
  assert.equal(result.rows[0].deduction, 120);
  assert.equal(result.rows[2].deduction, 0);
  assert.equal(result.totalDeduction, 120);
  assert.equal(result.incomeAfterDeduction, 0);
});

test("loss register does not apply detected losses before confirmation", () => {
  const result = calculateLossCarryforward({
    targetYear: 2026,
    currentIncome: 120,
    trades: [{ date: "2025-06-10", saleValue: 100, purchaseValue: 400, result: -300, account: "PLN" }],
  });

  assert.equal(result.rows.find(row => row.year === 2025)?.enabled, false);
  assert.equal(result.totalDeduction, 0);
  assert.equal(result.incomeAfterDeduction, 120);
});

test("loss register applies the 50 percent cap after the one-time method was used", () => {
  const result = calculateLossCarryforward({
    targetYear: 2026,
    currentIncome: 500,
    trades: [{ date: "2023-06-10", saleValue: 100, purchaseValue: 400, result: -300, account: "PLN" }],
    settings: { "2023": { declaredLoss: 300, usedBefore: 20, oneTimeUsed: true, enabled: true } },
  });
  const row = result.rows.find(item => item.year === 2023);

  assert.equal(row?.annualLimit, 150);
  assert.equal(row?.deduction, 150);
  assert.equal(row?.remainingAfterCurrentYear, 130);
  assert.equal(result.incomeAfterDeduction, 350);
});

test("liquidation tax separates ordinary profit from IKE and IKZE profit", () => {
  const result = calculateLiquidationTax({
    asOf: new Date("2026-08-10T12:00:00Z"),
    positions: [
      { symbol: "XTB.PL", name: "XTB", assetClass: "Akcje", account: "PLN", cost: 3900, value: 5495.6 },
      { symbol: "XTB.PL", name: "XTB", assetClass: "Akcje", account: "IKE", cost: 40000, value: 55500 },
      { symbol: "KRU.PL", name: "Kruk", assetClass: "Akcje", account: "IKZE", cost: 3100, value: 3400 },
    ],
    trades: [],
    cash: [],
    cryptoTransactions: [],
  });

  assert.ok(Math.abs(result.securities.liquidationResult - 1595.6) < 0.001);
  assert.equal(result.excluded.retirementResult, 15800);
  assert.ok(Math.abs(result.securities.allAccountsResult - 17395.6) < 0.001);
  assert.equal(result.excluded.retirementValue, 58900);
  assert.equal(result.securities.tax, 303);
  assert.equal(result.taxChange, 303);
});

test("retirement exit distinguishes asset sales, early return and qualified payout", () => {
  const values = { ikeValue: 52000, ikeBasis: 36500, ikzeValue: 3200 };
  const assets = calculateRetirementExitTax({ ...values, mode: "assets" });
  const early12 = calculateRetirementExitTax({ ...values, mode: "early", ikzeRate: 12 });
  const early32 = calculateRetirementExitTax({ ...values, mode: "early", ikzeRate: 32 });
  const qualified = calculateRetirementExitTax({ ...values, mode: "qualified" });

  assert.equal(assets.total, 0);
  assert.equal(early12.ikeTax, 2945);
  assert.equal(early12.ikzeTax, 384);
  assert.equal(early12.total, 3329);
  assert.equal(early32.ikzeTax, 1024);
  assert.equal(qualified.ikeTax, 0);
  assert.equal(qualified.ikzeTax, 320);
});

test("dividend forecast excludes sold positions and stale payment histories", () => {
  const today = new Date("2026-08-10T12:00:00Z");
  const dividends = [
    { date: "2025-06-25", symbol: "XTB.PL", amount: 54.5, comment: "XTB.PL PLN 5.4500/ SHR", account: "PLN" },
    { date: "2026-06-24", symbol: "XTB.PL", amount: 40.7, comment: "XTB.PL PLN 4.0700/ SHR", account: "PLN" },
    { date: "2022-12-15", symbol: "KO.US", amount: 10, account: "PLN" },
    { date: "2023-04-03", symbol: "KO.US", amount: 10, account: "PLN" },
    { date: "2023-07-03", symbol: "KO.US", amount: 10, account: "PLN" },
    { date: "2025-09-01", symbol: "INTC.US", amount: 2, account: "PLN" },
    { date: "2025-12-01", symbol: "INTC.US", amount: 2, account: "PLN" },
    { date: "2026-03-02", symbol: "INTC.US", amount: 2, account: "PLN" },
    { date: "2026-06-01", symbol: "INTC.US", amount: 2, account: "PLN" },
  ];
  const result = buildDividendForecast(dividends, [], today, { positions: [{ symbol: "XTB.PL", quantity: 14, account: "PLN" }, { symbol: "KO.US", quantity: 5, account: "PLN" }], fxRates: { PLN: 1 } });

  assert.ok(result.length > 0);
  assert.ok(result.every(item => item.symbol === "XTB.PL"));
  assert.ok(result.every(item => Math.abs(item.gross - 56.98) < 0.001));
});

test("dividend forecast requires six dates before treating a payer as monthly", () => {
  const today = new Date("2026-08-10T12:00:00Z");
  const rows = ["2026-04-15", "2026-05-14", "2026-06-12", "2026-07-15"].map(date => ({ date, symbol: "ADC.US", amount: 1, account: "IKE" }));
  const result = buildDividendForecast(rows, [], today, { positions: [{ symbol: "ADC.US", quantity: 1, account: "IKE" }] });

  assert.equal(result.length, 0);
});

test("dividend forecast shares payment cadence across accounts for the same ticker", () => {
  const today = new Date("2026-08-10T12:00:00Z");
  const result = buildDividendForecast([
    { date: "2025-06-25", symbol: "XTB.PL", amount: 54.5, comment: "XTB.PL PLN 5.4500/ SHR", account: "IKE" },
    { date: "2026-06-24", symbol: "XTB.PL", amount: 40.7, comment: "XTB.PL PLN 4.0700/ SHR", account: "PLN" },
  ], [], today, { positions: [
    { symbol: "XTB.PL", quantity: 10, value: 1600, account: "IKE" },
    { symbol: "XTB.PL", quantity: 10, value: 1600, account: "PLN" },
  ], fxRates: { PLN: 1 } });

  assert.equal(result.length, 1);
  assert.equal(result[0].gross, 81.4);
  assert.deepEqual(result[0].accounts, ["IKE", "PLN"]);
  assert.match(result[0].confidence, /łącznie 2 rachunki/);
  assert.doesNotMatch(result[0].confidence, /IKE \+ PLN/);
});

test("dividend forecast keeps a low-confidence annual estimate after one Polish payout", () => {
  const result = buildDividendForecast([
    { date: "2026-05-10", symbol: "ABE.PL", amount: 10, comment: "ABE.PL PLN 5.0000/ SHR", account: "IKE" },
  ], [], new Date("2026-08-10T12:00:00Z"), { positions: [
    { symbol: "ABE.PL", quantity: 4, value: 400, account: "IKE" },
  ], fxRates: { PLN: 1 } });

  assert.equal(result.length, 1);
  assert.equal(result[0].date, "2027-05-10");
  assert.equal(result[0].gross, 20);
  assert.match(result[0].confidence, /niska pewność/);
});

test("next-year dividend projection grows with recurring contributions", () => {
  const today = new Date("2026-08-10T12:00:00Z");
  const dividends = [
    { date: "2025-06-25", symbol: "XTB.PL", amount: 54.5, comment: "XTB.PL PLN 5.4500/ SHR", account: "PLN" },
    { date: "2026-06-24", symbol: "XTB.PL", amount: 40.7, comment: "XTB.PL PLN 4.0700/ SHR", account: "PLN" },
  ];
  const positions = [{ symbol: "XTB.PL", quantity: 10, value: 1600, account: "PLN" }];
  const until = new Date("2027-12-31T12:00:00Z");
  const unchanged = buildDividendForecast(dividends, [], today, { positions, fxRates: { PLN: 1 }, until }).filter(item => item.date.startsWith("2027-"));
  const growing = buildDividendForecast(dividends, [], today, { positions, fxRates: { PLN: 1 }, until, monthlyContribution: 1000 }).filter(item => item.date.startsWith("2027-"));

  assert.equal(unchanged.length, 1);
  assert.equal(growing.length, 1);
  assert.ok(growing[0].net > unchanged[0].net);
});

test("monthly contribution uses external deposits without double-counting IKE transfers", () => {
  const today = new Date("2026-08-10T12:00:00Z");
  const monthly = inferMonthlyContribution([
    { date: "2026-02-01", type: "Deposit", amount: 12000, account: "PLN" },
    { date: "2026-03-01", type: "IKE deposit", amount: -6000, account: "PLN" },
    { date: "2026-03-01", type: "IKE deposit", amount: 6000, account: "IKE" },
  ], today);

  assert.equal(monthly, 1000);
});

test("dividend forecast groups future dates by company", () => {
  const groups = groupDividendForecast([
    { date: "2026-09-01", symbol: "ADC.US", gross: 10, net: 8.5, confidence: "miesięczny", accounts: ["IKE"] },
    { date: "2026-10-01", symbol: "ADC.US", gross: 11, net: 9.35, confidence: "miesięczny", accounts: ["IKE"] },
    { date: "2027-06-20", symbol: "XTB.PL", gross: 40, net: 40, confidence: "roczny", accounts: ["PLN"] },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].symbol, "ADC.US");
  assert.equal(groups[0].eventCount, 2);
  assert.equal(groups[0].net, 17.85);
  assert.equal(groups[0].nextDate, "2026-09-01");
});

test("dividend history merges XTB lot rows from the same company and date", () => {
  const groups = groupDividendHistory([
    { date: "2026-06-24", symbol: "XTB.PL", amount: 40.7, account: "IKE" },
    { date: "2026-06-24", symbol: "XTB.PL", amount: 20.35, account: "IKE" },
    { date: "2025-06-25", symbol: "XTB.PL", amount: 54.5, account: "PLN" },
  ],[
    { date: "2026-06-24", symbol: "XTB.PL", amount: -5, account: "IKE" },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].paymentCount, 2);
  assert.equal(groups[0].entryCount, 3);
  assert.equal(groups[0].payments[0].entryCount, 2);
  assert.ok(Math.abs(groups[0].payments[0].gross - 61.05) < 1e-9);
  assert.ok(Math.abs(groups[0].payments[0].net - 56.05) < 1e-9);
  assert.ok(Math.abs(groups[0].net - 110.55) < 1e-9);
});

test("crypto tax carries unused costs forward and ignores crypto-to-crypto swaps", () => {
  const result = calculateCryptoTax({
    year: 2025,
    transactions: [
      { date: "2024-03-10", type: "buy", amountPln: 1000, feePln: 10 },
      { date: "2025-04-10", type: "swap", amountPln: 900, feePln: 50 },
      { date: "2025-08-10", type: "sell", amountPln: 1500, feePln: 10 },
    ],
  });

  assert.equal(result.rows[0].unclaimedCosts, 1010);
  assert.equal(result.revenue, 1500);
  assert.equal(result.currentCosts, 10);
  assert.equal(result.priorCosts, 1010);
  assert.equal(result.income, 480);
  assert.equal(result.neutralSwaps, 1);
  assert.equal(result.tax, 91);
});

test("crypto tax accepts prior costs confirmed from the previous PIT-38", () => {
  const result = calculateCryptoTax({
    year: 2025,
    priorCostsOverride: 700,
    transactions: [{ date: "2025-08-10", type: "payment", amountPln: 500, feePln: 5 }],
  });

  assert.equal(result.priorCosts, 700);
  assert.equal(result.currentCosts, 5);
  assert.equal(result.income, 0);
  assert.equal(result.unclaimedCosts, 205);
  assert.equal(result.tax, 0);
});

test("tax report exports a valid multi-sheet XLSX and CSV bundle", () => {
  const sheets = [
    { name: "Podsumowanie", title: "Raport PIT-38", moneyColumns: [1], rows: [["Pozycja", "Kwota"], ["Podatek", 123.45]] },
    { name: "Kontrola", title: "Kontrola", rows: [["Status", "Opis"], ["OK", "Dane kompletne"]] },
  ];
  const xlsx = unzipSync(buildXlsxBytes(sheets));
  const csv = unzipSync(buildCsvZipBytes(sheets));

  assert.ok(xlsx["[Content_Types].xml"]);
  assert.ok(xlsx["xl/styles.xml"]);
  assert.ok(xlsx["xl/worksheets/sheet1.xml"]);
  assert.match(strFromU8(xlsx["xl/workbook.xml"]), /name="Podsumowanie"/);
  assert.match(strFromU8(xlsx["xl/worksheets/sheet1.xml"]), /Raport PIT-38/);
  assert.match(strFromU8(csv["Podsumowanie.csv"]), /Podatek;123\.45/);
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
  assert.match(page, /Masz ręcznie dodane krypto, ale rejestr podatkowy nie zawiera jeszcze jego transakcji/);
  assert.match(page, /Zgodne z NBP/);
  assert.match(page, /Mapa pól PIT-38/);
  assert.match(page, /PIT-38\(18\)/);
  assert.match(page, /\["23","Inne przychody"/);
  assert.match(page, /\["50","Łączny podatek do zapłaty"/);
  assert.match(page, /Oficjalne API NBP/);
  assert.match(page, /Rejestr strat do odliczenia/);
  assert.match(page, /Limit jednorazowy użyty/);
  assert.match(page, /taxLosses/);
  assert.match(page, /cryptoTransactions:data\.cryptoTransactions/);
  assert.match(page, /cryptoCostOverrides:data\.cryptoCostOverrides/);
  assert.match(page, /Dodaj transakcję krypto/);
  assert.match(page, /Koszty krypto między latami/);
  assert.match(page, /\["36","Przychody z walut wirtualnych"/);
  assert.match(page, /\["43","Podatek od krypto"/);
  assert.match(page, /kind=crypto/);
  assert.match(page, /Zamknięcie roku/);
  assert.match(page, /Pobierz XLSX/);
  assert.match(page, /CSV ZIP/);
  assert.match(page, /Oficjalne źródła metodyki/);
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
