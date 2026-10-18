import type { Metadata } from "next";
import { Merriweather, Noto_Sans_Bengali } from "next/font/google";
import { LanguageProvider } from "@/components/language";
import { MotionShell } from "@/components/motion-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AssistantLauncher } from "@/components/assistant-launcher";
import { SessionPolicyGuard } from "@/components/session-policy-guard";
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
          <div className="healthcare-background" aria-hidden="true">
            <span className="healthcare-background-lungs" />
            <span className="healthcare-background-microbe" />
            <span className="healthcare-background-map" />
            <span className="healthcare-background-system" />
          </div>
          <SiteHeader />
          <SessionPolicyGuard />
          <MotionShell>{children}</MotionShell>
          <SiteFooter />
          <AssistantLauncher />
        </LanguageProvider>
      </body>
    </html>
  );
}
