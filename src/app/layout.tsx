import type { Metadata } from "next";
import {
  IBM_Plex_Sans_Arabic,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import { cookies } from "next/headers";
import { ar } from "@/messages/ar";
import "./globals.css";
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-arabic",
  adjustFontFallback: false,
});
const latin = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-latin",
  adjustFontFallback: false,
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
  adjustFontFallback: false,
});
export const metadata: Metadata = {
  title: { default: ar.brand, template: `%s | ${ar.brand}` },
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme =
    (await cookies()).get("bt-theme")?.value === "1" ? "dark" : "light";
  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme={theme}
      className={`${arabic.variable} ${latin.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
