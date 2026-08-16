export type ChartDisplayCurrency = "PLN" | "USD" | "EUR" | "GBP";

export type ChartFxRates = Record<ChartDisplayCurrency, number>;

export function chartCurrencyFactor(sourceCurrency: string, targetCurrency: ChartDisplayCurrency, rates: ChartFxRates) {
  const rawSource = sourceCurrency.trim();
  const source = rawSource.toUpperCase();
  const isPence = rawSource === "GBp" || source === "GBX" || source === "GBPENCE";
  const sourceCode: ChartDisplayCurrency | null = isPence ? "GBP" : source === "PLN" || source === "USD" || source === "EUR" || source === "GBP" ? source : null;
  if (!sourceCode) return null;
  const unitScale = isPence ? .01 : 1;
  const sourceRate = Number(rates[sourceCode]) * unitScale;
  const targetRate = Number(rates[targetCurrency]);
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) return null;
  return sourceRate / targetRate;
}
