type NbpTable = Array<{
  effectiveDate: string;
  rates: Array<{ code: string; mid: number }>;
}>;

let cached: { expires: number; payload: unknown } | null = null;

export async function GET() {
  try {
    if (cached && cached.expires > Date.now()) return Response.json(cached.payload);
    const response = await fetch("https://api.nbp.pl/api/exchangerates/tables/A/?format=json", {
      headers: { accept: "application/json", "user-agent": "Kapital-Portfolio/1.0" },
    });
    if (!response.ok) throw new Error(`NBP ${response.status}`);
    const table = (await response.json() as NbpTable)[0];
    const available = new Map((table?.rates || []).map(rate => [rate.code, rate.mid]));
    const rates = { PLN: 1, USD: available.get("USD"), EUR: available.get("EUR"), GBP: available.get("GBP") };
    if (Object.values(rates).some(rate => !Number.isFinite(rate) || Number(rate) <= 0)) throw new Error("Niepełna tabela kursów NBP");
    const payload = { rates, effectiveDate: table.effectiveDate, provider: "Narodowy Bank Polski" };
    cached = { expires: Date.now() + 15 * 60_000, payload };
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać kursów walut" }, { status: 502 });
  }
}
