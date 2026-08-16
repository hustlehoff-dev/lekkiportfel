"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { chartPeriods, featuredChartInstruments, type ChartInstrument, type ChartPeriod } from "../../lib/market-charts";
import { chartCurrencyFactor, type ChartDisplayCurrency, type ChartFxRates } from "../../lib/chart-currency";
import { AssetIcon } from "../components/asset-icon";

export type ChartHolding = {
  instrument: ChartInstrument;
  image?: string;
  quantity: number;
  value: number;
  cost: number;
  costKnown: boolean;
};

type PrivacyMode = "visible" | "money" | "all";

type ChartPoint = { time: number; value: number };
type ChartPayload = {
  instrument: ChartInstrument;
  currency: string;
  price: number;
  previousClose: number | null;
  change24h: number | null;
  periodChange: number | null;
  updatedAt: string;
  provider: "Bankier.pl" | "CoinGecko" | "Yahoo Finance";
  points: ChartPoint[];
  stale?: boolean;
};

const chartCacheKey = (instrument: ChartInstrument, period: ChartPeriod) => `lekkiportfel-chart:${instrument.key}:${period}`;

function readSavedChart(instrument: ChartInstrument, period: ChartPeriod): ChartPayload | null {
  try {
    const saved = window.localStorage.getItem(chartCacheKey(instrument, period));
    if (!saved) return null;
    const entry = JSON.parse(saved) as { savedAt?: number; payload?: ChartPayload };
    if (!entry.payload || entry.payload.instrument.key !== instrument.key || !entry.payload.points?.length || Date.now() - Number(entry.savedAt) > 24 * 60 * 60_000) return null;
    return { ...entry.payload, stale: true };
  } catch {
    return null;
  }
}

function saveChart(instrument: ChartInstrument, period: ChartPeriod, payload: ChartPayload) {
  try {
    window.localStorage.setItem(chartCacheKey(instrument, period), JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // Brak miejsca lub prywatny tryb przeglądarki nie może blokować notowań.
  }
}

const periodNames: Record<ChartPeriod, string> = { "1D": "1 dzień", "1T": "1 tydzień", "1M": "1 miesiąc", "3M": "3 miesiące", "1R": "1 rok", "5L": "5 lat", MAX: "Maks." };

function formatPrice(value: number, currency: string) {
  const digits = value < 1 ? 6 : value < 100 ? 2 : 0;
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatAxis(value: number, currency: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: value < 100 ? 2 : 0 }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Nie udało się pobrać danych");
  return body;
}

function PriceChart({ data, period, holding, formatMoney, formatPortfolioPercent }: { data: ChartPayload; period: ChartPeriod; holding: ChartHolding | null; formatMoney: (value: number, digits?: number) => string; formatPortfolioPercent: (value: number, digits?: number, showSign?: boolean) => string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chart = useMemo(() => {
    const points = data.points;
    const values = points.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * .12, max * .002);
    const floor = min - padding;
    const ceiling = max + padding;
    const span = Math.max(ceiling - floor, 1);
    const coords = points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? 500 : index / (points.length - 1) * 1000,
      y: 380 - (point.value - floor) / span * 340,
    }));
    const line = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const area = coords.length ? `${line} L1000,400 L0,400 Z` : "";
    return { coords, line, area, floor, ceiling };
  }, [data]);
  const active = hoverIndex === null ? chart.coords.at(-1) : chart.coords[hoverIndex];
  const positive = (data.periodChange ?? 0) >= 0;
  const formatDate = (timestamp: number) => new Intl.DateTimeFormat("pl-PL", period === "1D" || period === "1T" ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : period === "1M" || period === "3M" ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(timestamp));

  return <div className={`market-chart ${positive ? "positive" : "negative"} ${holding ? "has-holding" : ""}`}>
    {holding && <div className="chart-position-label"><span>Twoja pozycja</span><strong>{formatMoney(holding.value, 0)}</strong><small>{new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 6 }).format(holding.quantity)} szt.{holding.costKnown ? <b className={holding.value - holding.cost >= 0 ? "up" : "down"}>{holding.value - holding.cost >= 0 ? "+" : ""}{formatMoney(holding.value - holding.cost, 0)} · {holding.cost > 0 ? formatPortfolioPercent((holding.value - holding.cost) / holding.cost * 100, 1, true) : "—"}</b> : <b>brak kosztu</b>}</small></div>}
    <div className="chart-axis" aria-hidden="true"><span>{formatAxis(chart.ceiling, data.currency)}</span><span>{formatAxis((chart.ceiling + chart.floor) / 2, data.currency)}</span><span>{formatAxis(chart.floor, data.currency)}</span></div>
    <svg viewBox="0 0 1000 400" preserveAspectRatio="none" role="img" aria-label={`Wykres ${data.instrument.name}, okres ${periodNames[period]}`} onPointerMove={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      setHoverIndex(Math.round(ratio * (chart.coords.length - 1)));
    }} onPointerLeave={() => setHoverIndex(null)}>
      <defs><linearGradient id="price-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".24"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      <g className="chart-grid"><line x1="0" x2="1000" y1="40" y2="40"/><line x1="0" x2="1000" y1="210" y2="210"/><line x1="0" x2="1000" y1="380" y2="380"/></g>
      <path className="chart-area" d={chart.area}/><path className="chart-line" d={chart.line}/>
      {active && <g className="chart-cursor"><line x1={active.x} x2={active.x} y1="20" y2="390"/><circle cx={active.x} cy={active.y} r="7"/></g>}
    </svg>
    {active && <div className="chart-tooltip" style={{ left: `${active.x / 10}%` }}><strong>{formatPrice(active.value, data.currency)}</strong><span>{formatDate(active.time)}</span></div>}
    <div className="chart-dates" aria-hidden="true"><span>{chart.coords[0] ? formatDate(chart.coords[0].time) : ""}</span><span>{chart.coords.at(-1) ? formatDate(chart.coords.at(-1)!.time) : ""}</span></div>
  </div>;
}

export default function ChartsView({ chartColor = "#67b58f", displayCurrency = "PLN", fxRates, holdings = [], selectedInstrument = null, onInstrumentSelect, privacyMode = "visible", onTogglePrivacy, formatMoney, formatPortfolioPercent }: { chartColor?: string; displayCurrency?: ChartDisplayCurrency; fxRates: ChartFxRates; holdings?: ChartHolding[]; selectedInstrument?: ChartInstrument | null; onInstrumentSelect?: (instrument: ChartInstrument) => void; privacyMode?: PrivacyMode; onTogglePrivacy?: () => void; formatMoney: (value: number, digits?: number) => string; formatPortfolioPercent: (value: number, digits?: number, showSign?: boolean) => string }) {
  const [fallbackInstrument, setFallbackInstrument] = useState<ChartInstrument>(featuredChartInstruments[0]);
  const instrument = selectedInstrument || fallbackInstrument;
  const [period, setPeriod] = useState<ChartPeriod>("1M");
  const [data, setData] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadChart = useCallback(async (selected: ChartInstrument, selectedPeriod: ChartPeriod, signal?: AbortSignal) => {
    const saved = readSavedChart(selected, selectedPeriod);
    setData(saved);
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ action: "history", kind: selected.kind, id: selected.providerId, symbol: selected.symbol, name: selected.name, exchange: selected.exchange, period: selectedPeriod });
    try {
      const payload = await fetch(`/api/charts?${params}`, { signal }).then(jsonResponse<ChartPayload>);
      setData(payload);
      saveChart(selected, selectedPeriod, payload);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      const message = reason instanceof Error ? reason.message : "Nie udało się pobrać wykresu";
      setError(saved ? `${message} Pokazuję ostatnie zapisane notowania.` : message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadChart(instrument, period, controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [instrument, period, loadChart]);

  const chooseInstrument = (next: ChartInstrument) => {
    setFallbackInstrument(next);
    onInstrumentSelect?.(next);
  };

  const movement = data?.periodChange ?? null;
  const positive = (movement ?? 0) >= 0;
  const quoteStatus = loading ? { tone: "loading", label: "Aktualizuję notowania" } : error ? (data ? { tone: "stale", label: "Ostatnie zapisane" } : { tone: "error", label: "Brak notowań" }) : data?.stale ? { tone: "stale", label: "Ostatnie zapisane" } : { tone: "live", label: "Notowania aktualne" };
  const presentedData = useMemo(() => {
    if (!data) return null;
    const factor = chartCurrencyFactor(data.currency, displayCurrency, fxRates);
    if (factor === null) return data;
    return {
      ...data,
      currency: displayCurrency,
      price: data.price * factor,
      previousClose: data.previousClose === null ? null : data.previousClose * factor,
      points: data.points.map(point => ({ ...point, value: point.value * factor })),
    };
  }, [data, displayCurrency, fxRates]);
  const selectedHolding = useMemo(() => holdings.find(holding => holding.instrument.key === instrument.key) || null, [holdings, instrument.key]);

  return <div className="charts-shell charts-embedded" style={{ "--user-chart-color": chartColor } as CSSProperties}>
    <section className="charts-content">
      <section className="charts-heading"><div><p>Notowania i indeksy</p><h2>Sprawdź, co dzieje się na rynku</h2><span>Aktualna cena i historia bez przeładowywania pulpitu.</span></div><div className="charts-heading-actions">{onTogglePrivacy && <button type="button" className={`privacy-toggle-button privacy-${privacyMode}`} onClick={onTogglePrivacy} aria-label={privacyMode === "visible" ? "Ukryj kwoty" : privacyMode === "money" ? "Ukryj także procenty" : "Pokaż wszystkie wartości"} title={privacyMode === "visible" ? "Ukryj kwoty" : privacyMode === "money" ? "Ukryj także procenty" : "Pokaż wszystkie wartości"}>{privacyMode === "visible" ? <Eye size={18}/> : <EyeOff size={18}/>}</button>}<div className={`quote-live ${quoteStatus.tone}`}><i/><span>{quoteStatus.label}</span></div></div></section>

      {holdings.length > 0 && <section className="owned-chart-instruments"><header><span>Twoje pozycje</span><small>{holdings.length} instrumentów</small></header><div className="featured-instruments owned">{holdings.map(holding => <button key={holding.instrument.key} className={holding.instrument.key === instrument.key ? "active" : ""} onClick={() => chooseInstrument(holding.instrument)}><AssetIcon symbol={holding.instrument.symbol} name={holding.instrument.name} assetClass={holding.instrument.kind === "crypto" ? "Krypto" : "Akcje"} image={holding.image} className="featured-chart-icon"/><span><strong>{holding.instrument.symbol}</strong><small>{formatMoney(holding.value, 0)}</small></span></button>)}</div></section>}

      <section className="market-chart-presets"><span>Rynek</span><div className="featured-instruments" role="group" aria-label="Popularne instrumenty">{featuredChartInstruments.map(item => <button key={item.key} className={item.key === instrument.key ? "active" : ""} onClick={() => chooseInstrument(item)}><AssetIcon symbol={item.symbol} name={item.name} assetClass={item.kind === "crypto" ? "Krypto" : "Akcje"} className="featured-chart-icon"/><span><strong>{item.symbol}</strong><small>{item.name}</small></span></button>)}</div></section>

      <section className="chart-card">
        <header className="quote-header">
          <div className="quote-identity"><AssetIcon symbol={instrument.symbol} name={instrument.name} assetClass={instrument.kind === "crypto" ? "Krypto" : "Akcje"} className="quote-chart-icon"/><div><h2>{instrument.name}</h2><p>{instrument.symbol} · {instrument.exchange}</p></div></div>
          {presentedData && <div className="quote-price"><strong>{formatPrice(presentedData.price, presentedData.currency)}</strong><span className={positive ? "up" : "down"}>{positive ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>} {formatPercent(movement)} <small>{periodNames[period]}</small></span></div>}
        </header>
        <div className="period-picker" role="group" aria-label="Okres wykresu">{chartPeriods.map(item => <button key={item} className={item === period ? "active" : ""} aria-pressed={item === period} onClick={() => setPeriod(item)}>{item}</button>)}</div>
        <div className="chart-stage" aria-live="polite">
          {loading && <div className="chart-state"><LoaderCircle className="spin" size={26}/><strong>Pobieram notowania…</strong></div>}
          {!loading && error && !data && <div className="chart-state error"><strong>{error}</strong><button onClick={() => void loadChart(instrument, period)}><RefreshCw size={15}/> Spróbuj ponownie</button></div>}
          {!loading && error && data && <div className="chart-cache-warning"><strong>{error}</strong><button onClick={() => void loadChart(instrument, period)}><RefreshCw size={15}/> Odśwież</button></div>}
          {!loading && presentedData && <PriceChart data={presentedData} period={period} holding={selectedHolding} formatMoney={formatMoney} formatPortfolioPercent={formatPortfolioPercent}/>}
        </div>
        {data && !loading && <footer className="quote-footer"><span>Zmiana 24h <strong className={(data.change24h ?? 0) >= 0 ? "up" : "down"}>{formatPercent(data.change24h)}</strong></span><span>Ostatnia aktualizacja <strong>{new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.updatedAt))}</strong></span><span>Źródło <strong>{data.provider}{data.stale ? " · zapisane" : ""}</strong></span></footer>}
      </section>
    </section>
  </div>;
}
