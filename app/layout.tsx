import type { Metadata } from "next";
import { Merriweather, Noto_Sans_Bengali } from "next/font/google";
import { LanguageProvider } from "@/components/language";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bangla",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-english",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "First Signs", template: "%s | First Signs" },
  description: "English-first TB screening and care-navigation service for Bangladesh.",
  referrer: "no-referrer",
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" translate="no" className={`${notoSansBengali.variable} ${merriweather.variable}`} data-scroll-behavior="smooth">
      <body>
        <LanguageProvider>
          <a className="skip-link" href="#main-content">Skip to content / মূল কনটেন্টে যান</a>
          <SiteHeader />
          <div id="main-content">{children}</div>
          <SiteFooter />
        </LanguageProvider>
      </body>
    </html>
  );
}
