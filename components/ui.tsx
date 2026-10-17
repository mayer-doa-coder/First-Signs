import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { BilingualText, type Copy } from "@/components/language";
import { Icon, type IconName } from "@/components/icons";

export function PageShell({
  eyebrow,
  title,
  description,
  children,
  actions,
  icon = "care",
}: {
  eyebrow: Copy;
  title: Copy;
  description: Copy;
  children: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
}) {
  return (
    <main className="page-shell">
      <section className="page-hero container" aria-labelledby="page-title">
        <div className="page-hero-copy">
          <div className="eyebrow"><Icon name={icon} /><BilingualText copy={eyebrow} /></div>
          <h1 id="page-title"><BilingualText copy={title} /></h1>
          <p className="lede"><BilingualText copy={description} /></p>
          {actions && <div className="button-row">{actions}</div>}
        </div>
        <div className="hero-symbol" aria-hidden="true"><Icon name={icon} /></div>
      </section>
      <div className="container page-content">{children}</div>
    </main>
  );
}

export function ClayCard({
  children,
  className = "",
  as: Element = "section",
  ...elementProps
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
} & HTMLAttributes<HTMLElement>) {
  return <Element className={`clay-card ${className}`} {...elementProps}>{children}</Element>;
}

export function IconTile({ icon, tone = "teal" }: { icon: IconName; tone?: "teal" | "blue" | "amber" | "red" }) {
  return <span className={`icon-tile icon-tile-${tone}`} aria-hidden="true"><Icon name={icon} /></span>;
}

export function SectionHeading({ title, description, id }: { title: Copy; description?: Copy; id?: string }) {
  return (
    <div className="section-heading">
      <h2 id={id}><BilingualText copy={title} /></h2>
      {description && <p><BilingualText copy={description} /></p>}
    </div>
  );
}

export function ActionLink({ href, label, variant = "primary", icon = "arrow" }: { href: string; label: Copy; variant?: "primary" | "secondary" | "quiet"; icon?: IconName }) {
  return <Link className={`button button-${variant}`} href={href}><BilingualText copy={label} /><Icon name={icon} /></Link>;
}

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`demo-notice ${compact ? "demo-notice-compact" : ""}`} role="note">
      <Icon name="info" />
      <p><strong><BilingualText copy={{ bn: "ডেমো কনটেন্ট", en: "Demo content" }} /></strong>{" "}<BilingualText copy={{ bn: "এই পাতার তথ্য এখনো কোনো বাস্তব রোগী বা সেবার সঙ্গে যুক্ত নয়।", en: "This page is not yet connected to any real patient or service." }} /></p>
    </div>
  );
}

export function StatusPill({ label, tone = "neutral", icon = "info" }: { label: Copy; tone?: "neutral" | "success" | "warning" | "risk"; icon?: IconName }) {
  return <span className={`status-pill status-${tone}`}><Icon name={icon} /><BilingualText copy={label} /></span>;
}

export function MetricCard({ label, value, note, icon, tone = "teal", valueLanguage = "en" }: { label: Copy; value: string; note?: Copy; icon: IconName; tone?: "teal" | "blue" | "amber" | "red"; valueLanguage?: "bn" | "en" }) {
  return (
    <ClayCard className="metric-card" as="article">
      <div className="metric-top"><IconTile icon={icon} tone={tone} /><BilingualText copy={label} /></div>
      <strong className="metric-value" lang={valueLanguage}>{value}</strong>
      {note && <p className="metric-note"><BilingualText copy={note} /></p>}
    </ClayCard>
  );
}

export function FeatureCard({ icon, title, description, number }: { icon: IconName; title: Copy; description: Copy; number?: string }) {
  return (
    <ClayCard className="feature-card" as="article">
      <div className="feature-card-top">
        <IconTile icon={icon} />
        {number && <span className="step-number" lang="en">{number}</span>}
      </div>
      <h3><BilingualText copy={title} /></h3>
      <p><BilingualText copy={description} /></p>
    </ClayCard>
  );
}
