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
          <p><BilingualText copy={{ bn: "যক্ষ্মা স্ক্রিনিং ও আনুষ্ঠানিক সেবার পথে সহজ দিকনির্দেশনা।", en: "Simple guidance from TB screening to formal care." }} /></p>
        </div>
        <nav className="footer-links" aria-label="কর্মক্ষেত্র / Workspaces">
          {workspaceLinks.map(([href, label]) => <Link key={href} href={href}><BilingualText copy={label} /></Link>)}
        </nav>
      </div>
      <div className="container footer-safety">
        <Icon name="shield" />
        <p><strong><BilingualText copy={{ bn: "এটি রোগ নির্ণয় করে না।", en: "This does not diagnose TB." }} /></strong>{" "}<BilingualText copy={{ bn: "প্রয়োজনে আনুষ্ঠানিক যক্ষ্মা পরীক্ষা দরকার।", en: "Formal TB evaluation is required when recommended." }} /></p>
      </div>
    </footer>
  );
}
