import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./account.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = { themeColor: "#070a08", colorScheme: "dark" };

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
  return <html lang="pl"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
