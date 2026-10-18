import { BilingualText } from "@/components/language";
import { LandingHero } from "@/components/landing-hero";
import { PharmacyQrCard } from "@/components/pharmacy-qr-card";
import { ActionLink, ClayCard, FeatureCard, IconTile, SectionHeading } from "@/components/ui";
import { defaultDemoPharmacy, demoPharmacies, getPharmacyScreeningPath } from "@/lib/pharmacies";
import { getPublicAppOrigin } from "@/lib/public-app-origin";
import { telegramEntryLink } from "@/lib/messaging-links";

export default async function HomePage() {
  const qrBaseUrl = await getPublicAppOrigin();
  const selfTelegramLink = telegramEntryLink(process.env.TELEGRAM_BOT_USERNAME ?? "", { source: "SELF" });

  return (
    <main className="home-page">
      <LandingHero />

      <section className="medical-trust-strip container" aria-label="Clinical trust and safety">
        <article className="medical-trust-card">
          <IconTile icon="shield" tone="blue" />
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "নিরাপত্তার সীমা", en: "Safety boundary" }} /></span>
            <strong><BilingualText copy={{ bn: "স্ক্রিনিং—রোগ নির্ণয় নয়", en: "Screening, not diagnosis" }} /></strong>
          </div>
          <span className="medical-pulse" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </article>
        <article className="medical-trust-card">
          <IconTile icon="screen" tone="blue" />
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "ক্লিনিক্যাল যুক্তি", en: "Clinical logic" }} /></span>
            <strong><BilingualText copy={{ bn: "নির্দিষ্ট নিরাপত্তা নিয়ম", en: "Fixed safety rules" }} /></strong>
          </div>
          <span className="medical-pulse medical-pulse-steady" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </article>
        <article className="medical-trust-card">
          <IconTile icon="location" tone="blue" />
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "সেবার পরিধি", en: "Care reach" }} /></span>
            <strong><BilingualText copy={{ bn: "বাংলাদেশের ৮ বিভাগ", en: "All 8 divisions" }} /></strong>
          </div>
          <span className="medical-pulse medical-pulse-wide" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </article>
      </section>

      <section className="container section-block" aria-labelledby="messaging-entry-title">
        <ClayCard className="access-card messaging-entry-card">
          <IconTile icon="screen" tone="blue" />
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "আরও দুটি প্রবেশপথ", en: "Two more entry channels" }} /></span>
            <h2 id="messaging-entry-title"><BilingualText copy={{ bn: "Telegram থেকে বাড়িতে শুরু করুন", en: "Start from home in Telegram" }} /></h2>
            <p><BilingualText copy={{ bn: "একই সম্মতি, নির্দিষ্ট নিরাপত্তা নিয়ম, স্ক্রিনিং, রেফারেল ও ফলো-আপ ব্যবহার হবে। মেসেজিং সেবা না চললে ওয়েবসাইট ব্যবহার করুন।", en: "The same consent, fixed safety rules, screening, referral, and follow-up are used. Use the website if messaging is unavailable." }} /></p>
          </div>
          <div className="messaging-entry-actions">
            {selfTelegramLink ? <ActionLink href={selfTelegramLink} variant="secondary" icon="screen" label={{ bn: "Telegram-এ শুরু করুন", en: "Start in Telegram" }} /> : <ActionLink href="/screen?source=self" icon="home" label={{ bn: "ওয়েবসাইটে শুরু করুন", en: "Start on the website" }} />}
          </div>
        </ClayCard>
      </section>

      <section className="container section-block" aria-labelledby="how-title">
        <SectionHeading title={{ bn: "পাঁচটি স্বাস্থ্য-উদ্বেগের জন্য একটি নিরাপদ পরবর্তী পদক্ষেপ", en: "One safe next step for five health concerns" }} description={{ bn: "একই যত্নশীল পথ—শ্বাসতন্ত্র, জ্বর, পানিশূন্যতা, ত্বক ও স্নায়ু, এবং শিশুর শ্বাসকষ্টের জন্য।", en: "One careful journey for respiratory concerns, fever, dehydration, skin and nerve concerns, and child breathing concerns." }} />
        <div className="feature-grid three-column">
          <FeatureCard number="01" icon="screen" title={{ bn: "শ্বাসতন্ত্র ও দীর্ঘস্থায়ী কাশি", en: "Respiratory concerns and persistent cough" }} description={{ bn: "কাশি, শ্বাসকষ্ট বা শ্বাসতন্ত্রের সতর্কতার লক্ষণের জন্য পরবর্তী পদক্ষেপ।", en: "A next step for cough, breathing difficulty, or respiratory warning signs." }} />
          <FeatureCard number="02" icon="care" title={{ bn: "জ্বর ও মশাবাহিত অসুস্থতার উদ্বেগ", en: "Fever and mosquito-borne illness concerns" }} description={{ bn: "জ্বরের সঙ্গে বিপদের লক্ষণ থাকলে নিরাপদ দিকনির্দেশনা।", en: "Safe guidance when fever comes with warning signs." }} />
          <FeatureCard number="03" icon="care" title={{ bn: "ডায়রিয়া ও পানিশূন্যতা", en: "Diarrhoea and dehydration" }} description={{ bn: "তরল ক্ষতি বা পানিশূন্যতার উদ্বেগে কী করবেন তা বুঝুন।", en: "Understand the next step when fluid loss or dehydration is a concern." }} />
          <FeatureCard number="04" icon="care" title={{ bn: "ত্বক, অনুভূতি ও স্নায়ুর উদ্বেগ", en: "Skin, sensation, and nerve concerns" }} description={{ bn: "অস্বাভাবিক দাগ, অবশভাব বা দুর্বলতার জন্য সেবার দিকনির্দেশনা।", en: "Care navigation for unusual patches, numbness, or weakness." }} />
          <FeatureCard number="05" icon="care" title={{ bn: "শিশুর কাশি বা শ্বাসকষ্ট", en: "Child cough or difficult breathing" }} description={{ bn: "শিশুর শ্বাসতন্ত্রের সতর্কতার লক্ষণে দ্রুত পরবর্তী পদক্ষেপ।", en: "A prompt next step for child breathing warning signs." }} />
        </div>
      </section>

      <section className="container section-block" id="pharmacy-access" aria-labelledby="pharmacy-access-title">
        <SectionHeading
          id="pharmacy-access-title"
          title={{ bn: "ফার্মেসির QR দিয়ে শুরু করুন", en: "Start with a pharmacy QR" }}
          description={{ bn: "এটি সহায়তা প্রয়োজন এমন মানুষের জন্য একটি অতিরিক্ত প্রবেশপথ। প্রতিটি QR একটি নির্দিষ্ট ফার্মেসির পরিচয় বহন করে।", en: "This is an additional entry point for people who want help. Each QR carries the identity of one specific pharmacy." }}
        />
        <div className="pharmacy-qr-grid">
          {demoPharmacies.slice(0, 3).map((pharmacy) => (
            <PharmacyQrCard
              key={pharmacy.id}
              pharmacy={pharmacy}
              qrBaseUrl={qrBaseUrl}
              messagingLinks={{ telegram: telegramEntryLink(process.env.TELEGRAM_BOT_USERNAME ?? "", { source: "PHARMACY", pharmacyId: pharmacy.id }) }}
            />
          ))}
        </div>
        <div className="button-row">
          <ActionLink href="/pharmacies" variant="secondary" icon="pharmacy" label={{ bn: "সব ফার্মেসি দেখুন", en: "View all pharmacies" }} />
        </div>
      </section>

      <section className="container section-block">
        <ClayCard className="access-card">
          <IconTile icon="pharmacy" tone="blue" />
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "সহায়তা দরকার?", en: "Need assistance?" }} /></span>
            <h2><BilingualText copy={{ bn: "ফার্মেসি থেকেও একই স্ক্রিনিং করা যাবে", en: "Use the same screening with help from a pharmacy" }} /></h2>
            <p><BilingualText copy={{ bn: "নিজস্ব স্মার্টফোন বা ইন্টারনেট না থাকলেও সহায়তাপ্রাপ্ত ব্যবহারের সুযোগ থাকবে।", en: "Assisted access will be available even without a suitable smartphone or internet." }} /></p>
          </div>
          <ActionLink href={getPharmacyScreeningPath(defaultDemoPharmacy.id)} variant="secondary" icon="pharmacy" label={{ bn: "সহায়তাপ্রাপ্ত যাচাই খুলুন", en: "Open assisted check" }} />
        </ClayCard>
      </section>
    </main>
  );
}
