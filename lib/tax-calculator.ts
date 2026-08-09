export type TaxTrade = {
  id?: string;
  date: string;
  openDate?: string;
  symbol?: string;
  volume?: number;
  openPrice?: number;
  closePrice?: number;
  result?: number;
  saleValue?: number;
  purchaseValue?: number;
  account?: string;
};

export type TaxCashEvent = {
  id?: string;
  date: string;
  type: string;
  symbol?: string;
  amount: number;
  account?: string;
};

export type NbpRate = {
  currency: string;
  transactionDate: string;
  effectiveDate: string;
  rate: number;
  tableNo: string;
  source: "NBP tabela A";
};

export type TradeTaxAudit = {
  id: string;
  currency?: string;
  status: "verified" | "difference" | "missing" | "unsupported" | "pln";
  importedPurchase: number;
  importedSale: number;
  nbpPurchase?: number;
  nbpSale?: number;
  purchaseDifference?: number;
  saleDifference?: number;
  openRate?: NbpRate;
  closeRate?: NbpRate;
};

export type TaxSummary = {
  year: number;
  trades: {
    count: number;
    revenue: number;
    costs: number;
    result: number;
    eligiblePriorLoss: number;
    taxableBase: number;
    taxBeforeCredit: number;
    tax: number;
    incompleteValues: number;
  };
  foreignDividends: {
    count: number;
    gross: number;
    polishTaxBeforeCredit: number;
    withholdingTax: number;
    credit: number;
    taxDue: number;
  };
  domesticDividends: {
    count: number;
    gross: number;
  };
  retirementAccounts: {
    trades: number;
    dividends: number;
    tradeResult: number;
    dividendGross: number;
  };
  totalTaxDue: number;
};

const value = (input: unknown) => typeof input === "number" && Number.isFinite(input) ? input : 0;
const yearOf = (date: string) => Number(date.slice(0, 4));
const isDividend = (type: string) => /divident|dividend|dywidend/i.test(type);
const isWithholding = (type: string) => /withholding|wht|podatek.*zrodl/i.test(type.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const isPolishInstrument = (symbol = "") => /\.PL$/i.test(symbol.trim());
export const isRetirementAccount = (account = "") => /^(IKE|IKZE)$/i.test(account.trim());
export const rateKey = (currency: string, date: string) => `${currency.toUpperCase()}-${date}`;

export function inferInstrumentCurrency(symbol = "") {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized || /^[A-Z]{6}$/.test(normalized)) return undefined;
  if (/\.PL$/.test(normalized)) return "PLN";
  if (/\.(US)$/.test(normalized)) return "USD";
  if (/\.(DE|FR|ES|IT|NL|BE|AT|FI|PT|IE)$/.test(normalized)) return "EUR";
  if (/\.DK$/.test(normalized)) return "DKK";
  if (/\.SE$/.test(normalized)) return "SEK";
  if (/\.NO$/.test(normalized)) return "NOK";
  if (/\.CH$/.test(normalized)) return "CHF";
  if (/\.CA$/.test(normalized)) return "CAD";
  if (/\.AU$/.test(normalized)) return "AUD";
  if (/\.JP$/.test(normalized)) return "JPY";
  return undefined;
}

export function auditTradesWithNbp(trades: TaxTrade[], rates: NbpRate[]) {
  const byKey = new Map(rates.map(rate => [rateKey(rate.currency, rate.transactionDate), rate]));
  const auditedTrades: TaxTrade[] = [];
  const audit: TradeTaxAudit[] = [];

  for (const trade of trades) {
    const id = trade.id || `${trade.symbol || "trade"}-${trade.date}`;
    const currency = inferInstrumentCurrency(trade.symbol);
    const importedPurchase = Math.abs(value(trade.purchaseValue));
    const importedSale = Math.abs(value(trade.saleValue));
    const baseAudit = { id, importedPurchase, importedSale };
    if (currency === "PLN") {
      auditedTrades.push(trade);
      audit.push({ ...baseAudit, currency, status: "pln" });
      continue;
    }
    if (!currency || !trade.openDate || !trade.openPrice || !trade.closePrice || !trade.volume) {
      auditedTrades.push(trade);
      audit.push({ ...baseAudit, currency, status: currency ? "missing" : "unsupported" });
      continue;
    }

    const openRate = byKey.get(rateKey(currency, trade.openDate));
    const closeRate = byKey.get(rateKey(currency, trade.date));
    if (!openRate || !closeRate) {
      auditedTrades.push(trade);
      audit.push({ ...baseAudit, currency, status: "missing", openRate, closeRate });
      continue;
    }

    const quantity = Math.abs(trade.volume);
    const nbpPurchase = Math.round(Math.abs(trade.openPrice) * quantity * openRate.rate * 100) / 100;
    const nbpSale = Math.round(Math.abs(trade.closePrice) * quantity * closeRate.rate * 100) / 100;
    const purchaseDifference = Math.round((nbpPurchase - importedPurchase) * 100) / 100;
    const saleDifference = Math.round((nbpSale - importedSale) * 100) / 100;
    const tolerance = (amount: number) => Math.max(0.08, amount * 0.001);
    const status = Math.abs(purchaseDifference) <= tolerance(importedPurchase) && Math.abs(saleDifference) <= tolerance(importedSale) ? "verified" : "difference";
    const audited = { ...trade, purchaseValue: nbpPurchase, saleValue: nbpSale, result: nbpSale - nbpPurchase };
    auditedTrades.push(audited);
    audit.push({ ...baseAudit, currency, status, nbpPurchase, nbpSale, purchaseDifference, saleDifference, openRate, closeRate });
  }

  return { auditedTrades, audit };
}

export function taxYears(trades: TaxTrade[], cash: TaxCashEvent[], currentYear = new Date().getFullYear()) {
  const years = [currentYear, currentYear - 1];
  for (const item of [...trades, ...cash]) {
    const year = yearOf(item.date);
    if (Number.isFinite(year)) years.push(year);
  }
  return [...new Set(years)].sort((a, b) => b - a);
}

export function calculateTaxSummary({
  year,
  trades,
  cash,
  eligiblePriorLoss = 0,
  extraCosts = 0,
}: {
  year: number;
  trades: TaxTrade[];
  cash: TaxCashEvent[];
  eligiblePriorLoss?: number;
  extraCosts?: number;
}): TaxSummary {
  const taxableTrades = trades.filter(item => yearOf(item.date) === year && !isRetirementAccount(item.account));
  let revenue = 0;
  let transactionCosts = 0;
  let incompleteValues = 0;

  for (const trade of taxableTrades) {
    const result = value(trade.result);
    const hasSale = typeof trade.saleValue === "number" && Number.isFinite(trade.saleValue);
    const hasPurchase = typeof trade.purchaseValue === "number" && Number.isFinite(trade.purchaseValue);
    const sale = Math.abs(value(trade.saleValue));
    const purchase = Math.abs(value(trade.purchaseValue));

    if (hasSale && hasPurchase) {
      revenue += sale;
      transactionCosts += purchase;
    } else if (hasSale) {
      revenue += sale;
      transactionCosts += Math.max(0, sale - result);
      incompleteValues += 1;
    } else if (hasPurchase) {
      transactionCosts += purchase;
      revenue += Math.max(0, purchase + result);
      incompleteValues += 1;
    } else {
      revenue += Math.max(0, result);
      transactionCosts += Math.max(0, -result);
      incompleteValues += 1;
    }
  }

  const costs = transactionCosts + Math.max(0, value(extraCosts));
  const result = revenue - costs;
  const eligibleLoss = Math.min(Math.max(0, value(eligiblePriorLoss)), Math.max(0, result));
  const taxableBase = Math.round(Math.max(0, result - eligibleLoss));
  const securitiesTaxBeforeCredit = Math.round(taxableBase * 0.19 * 100) / 100;
  const securitiesTax = Math.round(securitiesTaxBeforeCredit);

  const ordinaryCash = cash.filter(item => yearOf(item.date) === year && !isRetirementAccount(item.account));
  const foreignDividends = ordinaryCash.filter(item => isDividend(item.type) && !isPolishInstrument(item.symbol));
  const domesticDividends = ordinaryCash.filter(item => isDividend(item.type) && isPolishInstrument(item.symbol));
  const foreignWithholdingEvents = ordinaryCash.filter(item => isWithholding(item.type) && !isPolishInstrument(item.symbol));
  const foreignGross = foreignDividends.reduce((sum, item) => sum + Math.max(0, value(item.amount)), 0);
  const foreignWithholdingTax = foreignWithholdingEvents.reduce((sum, item) => sum + Math.abs(Math.min(0, value(item.amount))), 0);
  const polishTaxBeforeCredit = Math.ceil(foreignGross * 0.19 * 100) / 100;
  const foreignTaxCredit = Math.min(foreignWithholdingTax, polishTaxBeforeCredit);
  const foreignDividendTaxDue = Math.round(Math.max(0, polishTaxBeforeCredit - foreignTaxCredit));

  const retirementTrades = trades.filter(item => yearOf(item.date) === year && isRetirementAccount(item.account));
  const retirementDividends = cash.filter(item => yearOf(item.date) === year && isRetirementAccount(item.account) && isDividend(item.type));

  return {
    year,
    trades: {
      count: taxableTrades.length,
      revenue,
      costs,
      result,
      eligiblePriorLoss: eligibleLoss,
      taxableBase,
      taxBeforeCredit: securitiesTaxBeforeCredit,
      tax: securitiesTax,
      incompleteValues,
    },
    foreignDividends: {
      count: foreignDividends.length,
      gross: foreignGross,
      polishTaxBeforeCredit,
      withholdingTax: foreignWithholdingTax,
      credit: foreignTaxCredit,
      taxDue: foreignDividendTaxDue,
    },
    domesticDividends: {
      count: domesticDividends.length,
      gross: domesticDividends.reduce((sum, item) => sum + Math.max(0, value(item.amount)), 0),
    },
    retirementAccounts: {
      trades: retirementTrades.length,
      dividends: retirementDividends.length,
      tradeResult: retirementTrades.reduce((sum, item) => sum + value(item.result), 0),
      dividendGross: retirementDividends.reduce((sum, item) => sum + Math.max(0, value(item.amount)), 0),
    },
    totalTaxDue: securitiesTax + foreignDividendTaxDue,
  };
}
