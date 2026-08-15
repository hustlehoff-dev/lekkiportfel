"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  History,
  LineChart,
  LoaderCircle,
  Moon,
  ReceiptText,
  RefreshCw,
  Search,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chartPeriods, featuredChartInstruments, type ChartInstrument, type ChartPeriod } from "../../lib/market-charts";

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
};

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

function PriceChart({ data, period }: { data: ChartPayload; period: ChartPeriod }) {
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

  return <div className={`market-chart ${positive ? "positive" : "negative"}`}>
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

export default function ChartsView() {
  const [instrument, setInstrument] = useState<ChartInstrument>(featuredChartInstruments[0]);
  const [period, setPeriod] = useState<ChartPeriod>("1M");
  const [data, setData] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChartInstrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<"lekka" | "dark">("lekka");
  const searchRef = useRef<HTMLInputElement>(null);

  const loadChart = useCallback(async (selected: ChartInstrument, selectedPeriod: ChartPeriod, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ action: "history", kind: selected.kind, id: selected.providerId, symbol: selected.symbol, name: selected.name, exchange: selected.exchange, period: selectedPeriod });
    try {
      const payload = await fetch(`/api/charts?${params}`, { signal }).then(jsonResponse<ChartPayload>);
      setData(payload);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Nie udało się pobrać wykresu");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadChart(instrument, period, controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [instrument, period, loadChart]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("lekkiportfel-theme");
      const next = saved === "dark" ? "dark" : "lekka";
      setTheme(next);
      document.documentElement.dataset.colorTheme = next;
      document.documentElement.dataset.portfolioTheme = "lekka";
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ action: "search", q: query.trim() });
        const payload = await fetch(`/api/charts?${params}`, { signal: controller.signal }).then(jsonResponse<{ results: ChartInstrument[] }>);
        setResults(payload.results);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const chooseInstrument = (next: ChartInstrument) => {
    setInstrument(next);
    setQuery("");
    setResults([]);
    setSearchOpen(false);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "lekka" : "dark";
    setTheme(next);
    document.documentElement.dataset.colorTheme = next;
    window.localStorage.setItem("lekkiportfel-theme", next);
  };

  const movement = data?.periodChange ?? null;
  const positive = (movement ?? 0) >= 0;

  return <main className="charts-shell">
    <aside className="market-sidebar">
      <a className="market-brand" href="/"><span><WalletCards size={19}/></span><strong>LEKKIPORTFEL<small>cały majątek</small></strong></a>
      <nav aria-label="Główna nawigacja">
        <a href="/"><CalendarDays size={18}/><span>Pulpit</span></a>
        <a className="active" href="/wykresy" aria-current="page"><LineChart size={18}/><span>Wykresy</span></a>
        <a href="/dywidendy"><ArrowUpRight size={18}/><span>Dywidendy</span></a>
        <a href="/podatki"><ReceiptText size={18}/><span>Podatki</span></a>
        <a href="/historia"><History size={18}/><span>Historia</span></a>
      </nav>
      <p>Notowania mogą być opóźnione względem rynku.</p>
    </aside>

    <section className="charts-content">
      <header className="charts-topbar">
        <div><p>Rynek</p><h1>Wykresy</h1></div>
        <div className="charts-search-wrap">
          <label className="charts-search"><Search size={18}/><input ref={searchRef} value={query} onFocus={() => setSearchOpen(true)} onChange={event => { const next=event.target.value; setQuery(next); if(next.trim().length<2){setResults([]);setSearching(false)} setSearchOpen(true); }} placeholder="Szukaj BTC, spółki, ETF-u lub indeksu…" aria-label="Szukaj instrumentu"/>{searching ? <LoaderCircle className="spin" size={17}/> : query ? <button onClick={() => { setQuery(""); setResults([]); searchRef.current?.focus(); }} aria-label="Wyczyść wyszukiwanie"><X size={16}/></button> : null}</label>
          {searchOpen && query.trim().length >= 2 && <div className="charts-search-results">
            {searching && !results.length ? <p>Szukam instrumentów…</p> : results.length ? results.map(result => <button key={result.key} onClick={() => chooseInstrument(result)}><span>{result.symbol.slice(0, 4)}</span><div><strong>{result.symbol}</strong><small>{result.name} · {result.exchange}</small></div></button>) : <p>Brak wyników. Spróbuj nazwy lub symbolu z giełdy.</p>}
          </div>}
        </div>
        <button className="charts-theme" onClick={toggleTheme} aria-label={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button>
      </header>

      <section className="charts-heading"><div><p>Notowania i indeksy</p><h2>Sprawdź, co dzieje się na rynku</h2><span>Aktualna cena i historia bez przeładowywania pulpitu.</span></div><div className="quote-live"><i/><span>{loading ? "Aktualizuję" : "Notowania aktualne"}</span></div></section>

      <div className="featured-instruments" role="group" aria-label="Popularne instrumenty">{featuredChartInstruments.map(item => <button key={item.key} className={item.key === instrument.key ? "active" : ""} onClick={() => chooseInstrument(item)}><strong>{item.symbol}</strong><span>{item.name}</span></button>)}</div>

      <section className="chart-card">
        <header className="quote-header">
          <div className="quote-identity"><span>{instrument.symbol.slice(0, 4)}</span><div><h2>{instrument.name}</h2><p>{instrument.symbol} · {instrument.exchange}</p></div></div>
          {data && <div className="quote-price"><strong>{formatPrice(data.price, data.currency)}</strong><span className={positive ? "up" : "down"}>{positive ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>} {formatPercent(movement)} <small>{periodNames[period]}</small></span></div>}
        </header>
        <div className="period-picker" role="group" aria-label="Okres wykresu">{chartPeriods.map(item => <button key={item} className={item === period ? "active" : ""} aria-pressed={item === period} onClick={() => setPeriod(item)}>{item}</button>)}</div>
        <div className="chart-stage" aria-live="polite">
          {loading && <div className="chart-state"><LoaderCircle className="spin" size={26}/><strong>Pobieram notowania…</strong></div>}
          {!loading && error && <div className="chart-state error"><strong>{error}</strong><button onClick={() => void loadChart(instrument, period)}><RefreshCw size={15}/> Spróbuj ponownie</button></div>}
          {!loading && !error && data && <PriceChart data={data} period={period}/>} 
        </div>
        {data && !loading && <footer className="quote-footer"><span>Zmiana 24h <strong className={(data.change24h ?? 0) >= 0 ? "up" : "down"}>{formatPercent(data.change24h)}</strong></span><span>Ostatnia aktualizacja <strong>{new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.updatedAt))}</strong></span><span>Źródło <strong>{data.provider}</strong></span></footer>}
      </section>
    </section>
  </main>;
}
