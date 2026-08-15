import type { Metadata } from "next";
import ChartsView from "./charts-view";
import "./charts.css";

export const metadata: Metadata = {
  title: "Wykresy rynkowe — LekkiPortfel",
  description: "Aktualne ceny i historia notowań kryptowalut, indeksów, akcji oraz ETF-ów.",
};

export default function WykresyPage() {
  return <ChartsView />;
}
