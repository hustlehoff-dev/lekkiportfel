import type { Metadata } from "next";
import PortfolioApp from "../page";

export const metadata: Metadata = {
  title: "Wykresy rynkowe — LekkiPortfel",
  description: "Aktualne ceny i historia notowań kryptowalut, indeksów, akcji oraz ETF-ów.",
};

export default function WykresyPage() {
  return <PortfolioApp initialView="wykresy" />;
}
