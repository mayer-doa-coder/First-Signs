"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BilingualText, LanguageSwitcher, useLanguage, type Copy } from "@/components/language";
import { Icon, type IconName } from "@/components/icons";

const navigation: { href: string; label: Copy; icon: IconName }[] = [
  { href: "/", label: { bn: "হোম", en: "Home" }, icon: "home" },
  { href: "/screen?source=self", label: { bn: "স্ক্রিনিং", en: "Screening" }, icon: "screen" },
  { href: "/care", label: { bn: "আমার সেবা", en: "My care" }, icon: "care" },
  { href: "/community", label: { bn: "কমিউনিটি", en: "Community" }, icon: "community" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="container header-main">
        <Link className="brand" href="/" aria-label="First Signs — Home">
          <span className="brand-mark"><Icon name="care" /></span>
          <span className="brand-copy">
            <strong lang="en">First Signs</strong>
            <small lang="bn">ফার্স্ট সাইনস</small>
          </span>
        </Link>
        <div className="header-actions">
          <LanguageSwitcher />
          <button
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            aria-label={language === "bn" ? "প্রধান মেনু" : "Main menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </div>
      <nav id="primary-navigation" className={`primary-nav container${menuOpen ? " is-open" : ""}`} aria-label="Primary navigation / প্রধান নেভিগেশন">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={pathname === item.href.split("?")[0] ? "active" : ""} aria-current={pathname === item.href.split("?")[0] ? "page" : undefined}>
            <Icon name={item.icon} /><BilingualText copy={item.label} />
          </Link>
        ))}
      </nav>
    </header>
  );
}
