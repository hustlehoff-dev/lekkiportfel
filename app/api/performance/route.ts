import { calculateMonthlyPerformance, type PerformanceFlow } from "../../../lib/portfolio-performance";

type OpenLot = {
  symbol: string;
  quantity: number;
  openDate: string;
  openPrice: number;
  cost: number;
  value: number;
  account?: string;
};

type ClosedTrade = {
  symbol: string;
  volume: number;
  date: string;
  result: number;
  category?: string;
  openDate?: string;
  openPrice?: number;
  closePrice?: number;
  purchaseValue?: number;
  saleValue?: number;
  account?: string;
};

type Position = {
  symbol: string;
  quantity: number;
  value: number;
  account?: string;
  assetClass?: string;
};

type YahooSeries = {
  currency: string;
  daily: Map<string, number>;
  monthly: Map<string, number>;
};

type PlnSeries = Pick<YahooSeries, "daily" | "monthly">;

const suffixes: Array<[string, string]> = [
  [".PL", ".WA"], [".UK", ".L"], [".DK", ".CO"], [".NL", ".AS"],
  [".FR", ".PA"], [".ES", ".MC"], [".IT", ".MI"], [".CH", ".SW"],
  [".SE", ".ST"], [".NO", ".OL"], [".DE", ".DE"],
];

const cache = new Map<string, { expires: number; value: Promise<YahooSeries> }>();
const monthKey = (value: string | Date) => new Date(value).toISOString().slice(0, 7);
const dayKey = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

function yahooSymbol(input: string) {
  const symbol = input.trim().toUpperCase();
  if (symbol.endsWith(".US")) return symbol.slice(0, -3).replace(".", "-");
  for (const [xtb, yahoo] of suffixes) if (symbol.endsWith(xtb)) return `${symbol.slice(0, -xtb.length)}${yahoo}`;
  return symbol;
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const result: string[] = [];
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const last = new Date(Date.UTC(endYear, endMonth - 1, 1));
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

async function yahooHistory(symbol: string, start: string) {
  const cacheKey = `${symbol}:${start.slice(0, 10)}:daily`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;
  const request = (async () => {
    const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000) - 75 * 86400;
    const period2 = Math.floor(Date.now() / 1000) + 3 * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "LekkiPortfel/1.0" } });
    if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
    const body = await response.json() as {
      chart?: { result?: Array<{ meta?: { currency?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
    };
    const result = body.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const daily = new Map<string, number>();
    const monthly = new Map<string, number>();
    timestamps.forEach((timestamp, index) => {
      const close = closes[index];
      if (typeof close === "number" && Number.isFinite(close) && close > 0) {
        const date = new Date(timestamp * 1000);
        daily.set(dayKey(date), close);
        monthly.set(monthKey(date), close);
      }
    });
    if (!daily.size) throw new Error(`${symbol}: brak historii`);
    return { currency: String(result?.meta?.currency || "PLN"), daily, monthly };
  })();
  cache.set(cacheKey, { expires: Date.now() + 15 * 60_000, value: request });
  try {
    return await request;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

function atOrBefore(prices: Map<string, number>, month: string) {
  if (prices.has(month)) return prices.get(month)!;
  const keys = [...prices.keys()].filter(key => key <= month).sort();
  return keys.length ? prices.get(keys.at(-1)!) : undefined;
}

async function historyPln(inputSymbol: string, start: string) {
  const series = await yahooHistory(yahooSymbol(inputSymbol), start);
  const currency = series.currency === "GBp" ? "GBP" : series.currency.toUpperCase();
  if (currency === "PLN") return { daily: series.daily, monthly: series.monthly };
  const fx = await yahooHistory(`${currency}PLN=X`, start);
  const multiplier = series.currency === "GBp" ? 0.01 : 1;
  const daily = new Map<string, number>();
  const monthly = new Map<string, number>();
  for (const [day, price] of series.daily) {
    const rate = atOrBefore(fx.daily, day);
    if (rate) daily.set(day, price * rate * multiplier);
  }
  for (const [month, price] of series.monthly) {
    const rate = atOrBefore(fx.monthly, month);
    if (rate) monthly.set(month, price * rate * multiplier);
  }
  return { daily, monthly };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { lots?: OpenLot[]; trades?: ClosedTrade[]; positions?: Position[] };
    const lots = Array.isArray(body.lots) ? body.lots.filter(lot => lot?.symbol && lot?.openDate && lot.quantity > 0) : [];
    const trades = Array.isArray(body.trades) ? body.trades.filter(trade => trade?.symbol && trade?.openDate && trade?.date && trade.volume > 0 && (!trade.category || /stock|etf|akcj/i.test(trade.category))) : [];
    const positions = Array.isArray(body.positions) ? body.positions : [];
    const transactions = [
      ...lots.map(lot => ({ symbol: lot.symbol, quantity: lot.quantity, openDate: lot.openDate, closeDate: undefined as string | undefined, purchaseValue: lot.cost, finalValue: lot.value, account: lot.account })),
      ...trades.map(trade => {const purchaseValue=trade.purchaseValue || Math.max(0,(trade.saleValue || 0)-trade.result);const reportedSale=trade.saleValue || 0;const reconciledSale=reportedSale&&Math.abs((reportedSale-purchaseValue)-trade.result)<.15?reportedSale:Math.max(0,purchaseValue+trade.result);return {symbol:trade.symbol,quantity:trade.volume,openDate:trade.openDate!,closeDate:trade.date,purchaseValue,finalValue:reconciledSale,account:trade.account}}),
    ].filter(item => item.purchaseValue > 0);

    if (!transactions.length) {
      return Response.json({ points: [], benchmark: { symbol: "^GSPC", name: "S&P 500 (PLN)" }, missing: [], methodology: "Brak partii z datą zakupu w imporcie." });
    }

    const startDate = transactions.map(item => item.openDate).sort()[0];
    const currentMonth = monthKey(new Date());
    const startMonth = monthKey(startDate);
    const months = monthsBetween(startMonth, currentMonth);
    const openingValue = new Map(months.map(month => [month, 0]));
    const closingValue = new Map(months.map(month => [month, 0]));
    const flows = new Map(months.map(month => [month, [] as PerformanceFlow[]]));
    const missing: string[] = [];
    const symbols = [...new Set(transactions.filter(item=>monthKey(item.openDate)!==monthKey(item.closeDate||new Date())).map(item => item.symbol))];
    const histories = new Map<string, PlnSeries>();

    for (let index = 0; index < symbols.length; index += 6) {
      const batch = symbols.slice(index, index + 6);
      await Promise.all(batch.map(async symbol => {
        try { histories.set(symbol, await historyPln(symbol, startDate)); }
        catch { missing.push(symbol); }
      }));
    }

    const positionValue = new Map<string, { value: number; quantity: number }>();
    for (const position of positions) {
      const key = `${position.account || ""}:${position.symbol}`;
      const current = positionValue.get(key) || { value: 0, quantity: 0 };
      current.value += Number(position.value) || 0;
      current.quantity += Number(position.quantity) || 0;
      positionValue.set(key, current);
    }

    // A multi-month position without market history cannot be split into monthly
    // gains. Carrying its purchase cost until today would incorrectly dump the
    // entire lifetime result into the current month.
    const performanceTransactions = transactions.filter(transaction => {
      const first = monthKey(transaction.openDate);
      const last = transaction.closeDate ? monthKey(transaction.closeDate) : currentMonth;
      return first === last || histories.has(transaction.symbol);
    });

    for (const transaction of performanceTransactions) {
      const first = monthKey(transaction.openDate);
      const last = transaction.closeDate ? monthKey(transaction.closeDate) : currentMonth;
      const relevant = months.filter(month => month >= first && month <= last);
      const history = histories.get(transaction.symbol);
      const live = positionValue.get(`${transaction.account || ""}:${transaction.symbol}`);
      const currentValue = !transaction.closeDate && live?.quantity ? live.value * transaction.quantity / live.quantity : transaction.finalValue;
      let previousValue = transaction.purchaseValue;
      for (const month of relevant) {
        const isFirst = month === first;
        const isLast = month === last;
        const marketValue = history ? (atOrBefore(history.monthly, month) ?? previousValue / transaction.quantity) * transaction.quantity : previousValue;
        const nextValue = isLast ? (transaction.closeDate ? transaction.finalValue : currentValue) : marketValue;
        if (!isFirst) openingValue.set(month, (openingValue.get(month) || 0) + previousValue);
        if (isFirst) flows.get(month)!.push({ date: transaction.openDate, amount: transaction.purchaseValue });
        if (isLast && transaction.closeDate) {
          flows.get(month)!.push({ date: transaction.closeDate, amount: -transaction.finalValue });
        } else {
          closingValue.set(month, (closingValue.get(month) || 0) + nextValue);
        }
        previousValue = nextValue;
      }
    }

    let benchmark: PlnSeries = { daily: new Map(), monthly: new Map() };
    try { benchmark = await historyPln("^GSPC", startDate); }
    catch { missing.push("^GSPC"); }
    const benchmarkKeys = [...benchmark.monthly.keys()].sort();
    const coveredStart = performanceTransactions.map(item => item.openDate).sort()[0];
    const coveredMonths = coveredStart ? monthsBetween(monthKey(coveredStart), currentMonth) : [];
    const points = coveredMonths.map(month => {
      const previousMonth = new Date(`${month}-01T00:00:00Z`);
      previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
      const previousKey = previousMonth.toISOString().slice(0, 7);
      const currentBenchmark = atOrBefore(benchmark.monthly, month);
      const previousBenchmark = atOrBefore(benchmark.monthly, previousKey) || (benchmarkKeys.length ? benchmark.monthly.get(benchmarkKeys[0]) : undefined);
      const monthly = calculateMonthlyPerformance({
        month,
        openingValue: openingValue.get(month) || 0,
        closingValue: closingValue.get(month) || 0,
        flows: flows.get(month) || [],
      });
      return {
        month,
        label: new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)).replace(" ", " ’"),
        capitalGain: monthly.capitalGain,
        portfolioPct: monthly.portfolioPct,
        benchmarkPct: currentBenchmark && previousBenchmark ? (currentBenchmark / previousBenchmark - 1) * 100 : null,
        investedCapital: monthly.investedCapital,
        openingValue: monthly.openingValue,
        closingValue: monthly.closingValue,
        netFlow: monthly.netFlow,
      };
    });

    const currentDay = dayKey(new Date());
    const shortStartCursor = new Date(`${currentDay}T00:00:00Z`);
    shortStartCursor.setUTCDate(shortStartCursor.getUTCDate() - 100);
    const shortStart = shortStartCursor.toISOString().slice(0, 10);
    const coveredDay = coveredStart ? dayKey(coveredStart) : currentDay;
    const dailyStart = coveredDay > shortStart ? coveredDay : shortStart;
    const dailyKeySet = new Set<string>([currentDay]);
    for (const history of histories.values()) {
      for (const day of history.daily.keys()) if (day >= dailyStart && day <= currentDay) dailyKeySet.add(day);
    }
    for (const day of benchmark.daily.keys()) if (day >= dailyStart && day <= currentDay) dailyKeySet.add(day);
    for (const transaction of performanceTransactions) {
      const openDay = dayKey(transaction.openDate);
      const closeDay = transaction.closeDate ? dayKey(transaction.closeDate) : null;
      if (openDay >= dailyStart && openDay <= currentDay) dailyKeySet.add(openDay);
      if (closeDay && closeDay >= dailyStart && closeDay <= currentDay) dailyKeySet.add(closeDay);
    }
    const dailyKeys = [...dailyKeySet].filter(day => day >= dailyStart && day <= currentDay).sort();
    const dailyOpening = new Map(dailyKeys.map(day => [day, 0]));
    const dailyClosing = new Map(dailyKeys.map(day => [day, 0]));
    const dailyFlows = new Map(dailyKeys.map(day => [day, [] as PerformanceFlow[]]));

    for (const transaction of performanceTransactions) {
      const openDay = dayKey(transaction.openDate);
      const closeDay = transaction.closeDate ? dayKey(transaction.closeDate) : currentDay;
      const relevant = dailyKeys.filter(day => day >= dailyStart && day >= openDay && day <= closeDay);
      if (!relevant.length) continue;
      const history = histories.get(transaction.symbol);
      const live = positionValue.get(`${transaction.account || ""}:${transaction.symbol}`);
      const currentValue = !transaction.closeDate && live?.quantity ? live.value * transaction.quantity / live.quantity : transaction.finalValue;
      const beforeFirst = new Date(`${relevant[0]}T00:00:00Z`);
      beforeFirst.setUTCDate(beforeFirst.getUTCDate() - 1);
      let previousValue = openDay < relevant[0] && history
        ? (atOrBefore(history.daily, beforeFirst.toISOString().slice(0, 10)) ?? transaction.purchaseValue / transaction.quantity) * transaction.quantity
        : transaction.purchaseValue;
      for (const day of relevant) {
        const isFirst = day === openDay;
        const isLast = day === closeDay;
        const marketValue = history ? (atOrBefore(history.daily, day) ?? previousValue / transaction.quantity) * transaction.quantity : previousValue;
        const nextValue = isLast ? (transaction.closeDate ? transaction.finalValue : currentValue) : marketValue;
        if (!isFirst) dailyOpening.set(day, (dailyOpening.get(day) || 0) + previousValue);
        if (isFirst) dailyFlows.get(day)!.push({ date: transaction.openDate, amount: transaction.purchaseValue });
        if (isLast && transaction.closeDate) dailyFlows.get(day)!.push({ date: transaction.closeDate, amount: -transaction.finalValue });
        else dailyClosing.set(day, (dailyClosing.get(day) || 0) + nextValue);
        previousValue = nextValue;
      }
    }

    const dailyPoints = dailyKeys.map(day => {
      const previousDay = new Date(`${day}T00:00:00Z`);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      const opening = dailyOpening.get(day) || 0;
      const closing = dailyClosing.get(day) || 0;
      const dayFlows = dailyFlows.get(day) || [];
      const netFlow = dayFlows.reduce((sum, flow) => sum + flow.amount, 0);
      const capitalGain = closing - opening - netFlow;
      const investedCapital = opening + dayFlows.reduce((sum, flow) => sum + Math.max(0, flow.amount), 0);
      const currentBenchmark = benchmark.daily.get(day);
      const previousBenchmark = atOrBefore(benchmark.daily, previousDay.toISOString().slice(0, 10));
      return {
        month: day,
        label: new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)),
        capitalGain,
        portfolioPct: investedCapital > 0 ? capitalGain / investedCapital * 100 : 0,
        benchmarkPct: currentBenchmark && previousBenchmark ? (currentBenchmark / previousBenchmark - 1) * 100 : null,
        investedCapital,
        openingValue: opening,
        closingValue: closing,
        netFlow,
      };
    });

    return Response.json({
      points,
      dailyPoints,
      benchmark: { symbol: "^GSPC", name: "S&P 500 (PLN)" },
      missing: [...new Set(missing)],
      excludedTransactions: transactions.length - performanceTransactions.length,
      methodologyCode: "modified-dietz-monthly",
      quality: missing.length ? "partial" : "complete",
      methodology: "Miesięczna stopa zwrotu Modified Dietz: wartość na początku i końcu miesiąca skorygowana o zakupy i sprzedaże ważone datą przepływu. Sprzedaże kończą się rzeczywistą wartością z raportu, a benchmark uwzględnia kurs USD/PLN.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się policzyć historii portfela" }, { status: 500 });
  }
}
