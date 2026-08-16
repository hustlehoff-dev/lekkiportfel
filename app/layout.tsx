import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./account.css";
import "./wykresy/charts.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f3f6fb", colorScheme: "light dark" };

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3002";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "LekkiPortfel — cały majątek w jednym miejscu",
    description: "Akcje, ETF-y, krypto, gotówka, wyniki, dywidendy i podatki w jednym prywatnym portfelu.",
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "LekkiPortfel — cały majątek w jednym miejscu", description: "Twój majątek. Jedno czytelne miejsce.", images: [image] },
    twitter: { card: "summary_large_image", title: "LekkiPortfel — cały majątek w jednym miejscu", description: "Twój majątek. Jedno czytelne miejsce.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl" data-portfolio-theme="lekka" data-color-theme="lekka"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
