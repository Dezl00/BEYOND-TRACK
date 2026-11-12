import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Sans_Arabic,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import { cookies } from "next/headers";
import { ar } from "@/messages/ar";
import "./globals.css";
import "./preferences.css";
import { DisplayProvider } from "@/components/display-preferences";
import { parseLocale } from "@/messages/types";
import "./reporting.css";
import { PwaProvider } from "@/components/pwa";
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
export async function generateMetadata():Promise<Metadata>{
 const locale=parseLocale((await cookies()).get("bt-locale")?.value);
 return {
  applicationName: ar.brand,
  manifest: locale==="en"?"/en.webmanifest":"/manifest.webmanifest",
  appleWebApp: { capable: true, title: ar.brand, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  title: { default: ar.brand, template: `%s | ${ar.brand}` },
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
}; }
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = parseLocale((await cookies()).get("bt-locale")?.value);
  const theme =
    (await cookies()).get("bt-theme")?.value === "1" ? "dark" : "light";
  return (
    <html
      lang={locale}
      dir={locale==="en"?"ltr":"rtl"}
      data-theme={theme}
      className={`${arabic.variable} ${latin.variable} ${mono.variable}`}
    >
      <body>
        <DisplayProvider initial={{locale,theme}}><PwaProvider>{children}</PwaProvider></DisplayProvider>
      </body>
    </html>
  );
}
