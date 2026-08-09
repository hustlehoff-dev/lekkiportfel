/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./account.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const viewport: Viewport = { themeColor: "#f3f6fb", colorScheme: "light dark" };

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3002";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Kapitał — prywatny portfel XTB",
    description: "Prywatny dashboard portfela: import XTB, wyniki, dywidendy i alokacja.",
    openGraph: { title: "Kapitał — prywatny portfel XTB", description: "Twój portfel. Twoje dane.", images: [image] },
    twitter: { card: "summary_large_image", title: "Kapitał — prywatny portfel XTB", description: "Twój portfel. Twoje dane.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl" data-portfolio-theme="lekka"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/></head><body className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable}`}>{children}</body></html>;
}
