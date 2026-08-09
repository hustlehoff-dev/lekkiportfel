type RateRequest = { currency?: string; date?: string };
type NbpResponse = { rates?: Array<{ no?: string; effectiveDate?: string; mid?: number }> };

const cache = new Map<string, Promise<RateResult | null>>();
const allowedCurrencies = new Set(["AUD","CAD","CHF","CZK","DKK","EUR","GBP","HUF","JPY","NOK","SEK","USD"]);

type RateResult = {
  currency: string;
  transactionDate: string;
  effectiveDate: string;
  rate: number;
  tableNo: string;
  source: "NBP tabela A";
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

async function getPreviousBusinessRate(currency: string, transactionDate: string): Promise<RateResult | null> {
  if (currency === "PLN") {
    return { currency, transactionDate, effectiveDate: transactionDate, rate: 1, tableNo: "PLN", source: "NBP tabela A" };
  }

  const key = `${currency}-${transactionDate}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const end = new Date(`${transactionDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 9);
    const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${iso(start)}/${iso(end)}/?format=json`;
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json() as NbpResponse;
    const rate = payload.rates?.at(-1);
    if (!rate?.effectiveDate || typeof rate.mid !== "number") return null;
    return { currency, transactionDate, effectiveDate: rate.effectiveDate, rate: rate.mid, tableNo: rate.no || "", source: "NBP tabela A" } satisfies RateResult;
  })();

  cache.set(key, request);
  return request;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { requests?: RateRequest[] };
    const unique = new Map<string, { currency: string; date: string }>();
    for (const item of body.requests || []) {
      const currency = String(item.currency || "").trim().toUpperCase();
      const date = String(item.date || "").trim();
      if ((!allowedCurrencies.has(currency) && currency !== "PLN") || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      unique.set(`${currency}-${date}`, { currency, date });
    }
    if (unique.size > 250) return Response.json({ error: "Zbyt wiele dat do sprawdzenia" }, { status: 400 });

    const rates: RateResult[] = [];
    const missing: Array<{ currency: string; date: string }> = [];
    const queue = [...unique.values()];
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        const result = await getPreviousBusinessRate(item.currency, item.date);
        if (result) rates.push(result);
        else missing.push(item);
      }
    });
    await Promise.all(workers);

    return Response.json({ rates, missing, source: "Narodowy Bank Polski · tabela A kursów średnich" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać kursów NBP" }, { status: 500 });
  }
}
