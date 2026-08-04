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
  prices: Map<string, number>;
};

const suffixes: Array<[string, string]> = [
  [".PL", ".WA"], [".UK", ".L"], [".DK", ".CO"], [".NL", ".AS"],
  [".FR", ".PA"], [".ES", ".MC"], [".IT", ".MI"], [".CH", ".SW"],
  [".SE", ".ST"], [".NO", ".OL"], [".DE", ".DE"],
];

const cache = new Map<string, { expires: number; value: Promise<YahooSeries> }>();
const monthKey = (value: string | Date) => new Date(value).toISOString().slice(0, 7);

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
  const cacheKey = `${symbol}:${start.slice(0, 7)}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;
  const request = (async () => {
    const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000) - 75 * 86400;
    const period2 = Math.floor(Date.now() / 1000) + 3 * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1mo&events=history`;
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Kapital-Portfolio/1.0" } });
    if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
    const body = await response.json() as {
      chart?: { result?: Array<{ meta?: { currency?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
    };
    const result = body.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const prices = new Map<string, number>();
    timestamps.forEach((timestamp, index) => {
      const close = closes[index];
      if (typeof close === "number" && Number.isFinite(close) && close > 0) prices.set(monthKey(new Date(timestamp * 1000)), close);
    });
    if (!prices.size) throw new Error(`${symbol}: brak historii`);
    return { currency: String(result?.meta?.currency || "PLN"), prices };
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
  if (currency === "PLN") return series.prices;
  const fx = await yahooHistory(`${currency}PLN=X`, start);
  const result = new Map<string, number>();
  for (const [month, price] of series.prices) {
    const rate = atOrBefore(fx.prices, month);
    if (rate) result.set(month, price * rate * (series.currency === "GBp" ? 0.01 : 1));
  }
  return result;
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
    const gain = new Map(months.map(month => [month, 0]));
    const capital = new Map(months.map(month => [month, 0]));
    const missing: string[] = [];
    const symbols = [...new Set(transactions.filter(item=>monthKey(item.openDate)!==monthKey(item.closeDate||new Date())).map(item => item.symbol))];
    const histories = new Map<string, Map<string, number>>();

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

    for (const transaction of transactions) {
      const first = monthKey(transaction.openDate);
      const last = transaction.closeDate ? monthKey(transaction.closeDate) : currentMonth;
      const relevant = months.filter(month => month >= first && month <= last);
      const history = histories.get(transaction.symbol);
      const live = positionValue.get(`${transaction.account || ""}:${transaction.symbol}`);
      const currentValue = !transaction.closeDate && live?.quantity ? live.value * transaction.quantity / live.quantity : transaction.finalValue;
      let previousValue = transaction.purchaseValue;
      for (const month of relevant) {
        capital.set(month, (capital.get(month) || 0) + transaction.purchaseValue);
        const isLast = month === last;
        const marketValue = history ? (atOrBefore(history, month) ?? previousValue / transaction.quantity) * transaction.quantity : previousValue;
        const nextValue = isLast ? (transaction.closeDate ? transaction.finalValue : currentValue) : marketValue;
        gain.set(month, (gain.get(month) || 0) + nextValue - previousValue);
        previousValue = nextValue;
      }
    }

    let benchmark = new Map<string, number>();
    try { benchmark = await historyPln("^GSPC", startDate); }
    catch { missing.push("^GSPC"); }
    const benchmarkKeys = [...benchmark.keys()].sort();
    const points = months.map(month => {
      const previousMonth = new Date(`${month}-01T00:00:00Z`);
      previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
      const previousKey = previousMonth.toISOString().slice(0, 7);
      const currentBenchmark = atOrBefore(benchmark, month);
      const previousBenchmark = atOrBefore(benchmark, previousKey) || (benchmarkKeys.length ? benchmark.get(benchmarkKeys[0]) : undefined);
      const investedCapital = capital.get(month) || 0;
      const capitalGain = gain.get(month) || 0;
      return {
        month,
        label: new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)).replace(" ", " ’"),
        capitalGain,
        portfolioPct: investedCapital ? capitalGain / investedCapital * 100 : 0,
        benchmarkPct: currentBenchmark && previousBenchmark ? (currentBenchmark / previousBenchmark - 1) * 100 : 0,
        investedCapital,
      };
    });

    return Response.json({
      points,
      benchmark: { symbol: "^GSPC", name: "S&P 500 (PLN)" },
      missing: [...new Set(missing)],
      methodology: "Miesięczna zmiana wartości każdej partii od ceny zakupu do ceny zamknięcia miesiąca; sprzedaże kończą się rzeczywistą wartością sprzedaży z XTB. Benchmark uwzględnia kurs USD/PLN.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się policzyć historii portfela" }, { status: 500 });
  }
}
