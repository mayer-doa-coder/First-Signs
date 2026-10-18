import Link from "next/link";
import { BilingualText } from "@/components/language";
import { Icon } from "@/components/icons";

const workspaceLinks = [
  ["/referral", { bn: "রেফারেল", en: "Referral" }],
  ["/verify", { bn: "যাচাই", en: "Verification" }],
  ["/pharmacy", { bn: "ফার্মেসি", en: "Pharmacy" }],
  ["/dashboard", { bn: "জনস্বাস্থ্য", en: "Public health" }],
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <span className="brand-mark"><Icon name="care" /></span>
          <p><BilingualText copy={{ bn: "স্বাস্থ্য-সতর্কতার লক্ষণ থেকে উপযুক্ত সেবার পথে সহজ দিকনির্দেশনা।", en: "Simple guidance from health warning signs to appropriate care." }} /></p>
        </div>
        <nav className="footer-links" aria-label="কর্মক্ষেত্র / Workspaces">
          {workspaceLinks.map(([href, label]) => <Link key={href} href={href}><BilingualText copy={label} /></Link>)}
        </nav>
      </div>
      <div className="container footer-safety">
        <Icon name="shield" />
        <p><strong><BilingualText copy={{ bn: "এটি কোনো রোগ নির্ণয় করে না।", en: "This does not diagnose a disease." }} /></strong>{" "}<BilingualText copy={{ bn: "প্রয়োজনে পেশাদার স্বাস্থ্য মূল্যায়ন নিন।", en: "Seek professional health evaluation when recommended." }} /></p>
      </div>
    </footer>
  );
}
