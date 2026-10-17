import { BilingualText } from "@/components/language";
import { Icon } from "@/components/icons";
import { PharmacyQrCard } from "@/components/pharmacy-qr-card";
import { ActionLink, ClayCard, FeatureCard, IconTile, SectionHeading } from "@/components/ui";
import { defaultDemoPharmacy, demoPharmacies, getPharmacyScreeningPath } from "@/lib/pharmacies";
import { getPublicAppOrigin } from "@/lib/public-app-origin";
import { configuredMessagingLinks } from "@/lib/messaging-links";

export default async function HomePage() {
  const qrBaseUrl = await getPublicAppOrigin();
  const selfMessagingLinks = configuredMessagingLinks({ source: "SELF" });

  return (
    <main className="home-page">
      <section className="home-hero container" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <div className="eyebrow"><Icon name="shield" /><BilingualText copy={{ bn: "যেকোনো জায়গা থেকে সহজ দিকনির্দেশনা", en: "Simple guidance from anywhere" }} /></div>
          <h1 id="home-title"><BilingualText copy={{ bn: "কাশি নিয়ে দুশ্চিন্তা? পরবর্তী নিরাপদ পদক্ষেপটি জানুন।", en: "Worried about a cough? Find your next safe step." }} /></h1>
          <p className="lede"><BilingualText copy={{ bn: "ফার্স্ট সাইনস আপনাকে প্রাথমিক স্ক্রিনিং থেকে আনুষ্ঠানিক যক্ষ্মা সেবার পথে এগিয়ে যেতে সাহায্য করে।", en: "First Signs helps you move from initial screening toward formal TB care." }} /></p>
          <div className="button-row">
            <ActionLink href="/screen?source=self" icon="home" label={{ bn: "বাড়ি থেকে যাচাই করুন", en: "Check from home" }} />
            <ActionLink href={getPharmacyScreeningPath(defaultDemoPharmacy.id)} variant="secondary" icon="pharmacy" label={{ bn: "ফার্মেসির সহায়তায় যাচাই করুন", en: "Pharmacy-assisted check" }} />
          </div>
          <div className="safety-line"><Icon name="info" /><p><strong><BilingualText copy={{ bn: "এটি যক্ষ্মা রোগ নির্ণয় করে না।", en: "This does not diagnose TB." }} /></strong>{" "}<BilingualText copy={{ bn: "প্রস্তাব করা হলে আনুষ্ঠানিক পরীক্ষা প্রয়োজন।", en: "Formal evaluation is required when recommended." }} /></p></div>
        </div>
        <ClayCard className="journey-card">
          <div className="journey-orbit" aria-hidden="true">
            <span><Icon name="home" /></span><span><Icon name="screen" /></span><span><Icon name="building" /></span>
            <div className="journey-heart"><Icon name="care" /></div>
          </div>
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "সেবার পথ", en: "Care pathway" }} /></span>
            <h2><BilingualText copy={{ bn: "উদ্বেগ থেকে আনুষ্ঠানিক সেবা পর্যন্ত", en: "From concern to formal care" }} /></h2>
            <p><BilingualText copy={{ bn: "নিজের ফোন বা ফার্মেসির সহায়তায় একই নিরাপদ পথ।", en: "The same safe pathway from your phone or with pharmacy assistance." }} /></p>
          </div>
        </ClayCard>
      </section>

      <section className="container section-block" aria-labelledby="messaging-entry-title">
        <ClayCard className="access-card messaging-entry-card">
          <IconTile icon="screen" tone="blue" />
          <div>
            <span className="mini-label"><BilingualText copy={{ bn: "আরও দুটি প্রবেশপথ", en: "Two more entry channels" }} /></span>
            <h2 id="messaging-entry-title"><BilingualText copy={{ bn: "WhatsApp বা Telegram থেকে বাড়িতে শুরু করুন", en: "Start from home in WhatsApp or Telegram" }} /></h2>
            <p><BilingualText copy={{ bn: "একই সম্মতি, নির্দিষ্ট নিরাপত্তা নিয়ম, স্ক্রিনিং, রেফারেল ও ফলো-আপ ব্যবহার হবে। মেসেজিং সেবা না চললে ওয়েবসাইট ব্যবহার করুন।", en: "The same consent, fixed safety rules, screening, referral, and follow-up are used. Use the website if messaging is unavailable." }} /></p>
          </div>
          <div className="messaging-entry-actions">
            {selfMessagingLinks.whatsapp && <ActionLink href={selfMessagingLinks.whatsapp} icon="screen" label={{ bn: "WhatsApp-এ শুরু করুন", en: "Start in WhatsApp" }} />}
            {selfMessagingLinks.telegram && <ActionLink href={selfMessagingLinks.telegram} variant="secondary" icon="screen" label={{ bn: "Telegram-এ শুরু করুন", en: "Start in Telegram" }} />}
            {!selfMessagingLinks.whatsapp && !selfMessagingLinks.telegram && <ActionLink href="/screen?source=self" icon="home" label={{ bn: "ওয়েবসাইটে শুরু করুন", en: "Start on the website" }} />}
          </div>
        </ClayCard>
      </section>

      <section className="container section-block" aria-labelledby="how-title">
        <SectionHeading title={{ bn: "কীভাবে পাশে থাকি", en: "How we support you" }} description={{ bn: "সহজ ভাষা, পরিষ্কার পদক্ষেপ এবং মানুষের নিয়ন্ত্রণ।", en: "Simple language, clear steps, and control in your hands." }} />
        <div className="feature-grid three-column">
          <FeatureCard number="01" icon="screen" title={{ bn: "সংক্ষিপ্ত স্ক্রিনিং", en: "Short screening" }} description={{ bn: "কয়েকটি প্রাসঙ্গিক প্রশ্নের মাধ্যমে প্রয়োজন বুঝতে সহায়তা।", en: "A few relevant questions help identify the appropriate next step." }} />
          <FeatureCard number="02" icon="location" title={{ bn: "সঠিক সেবার দিকনির্দেশনা", en: "Care navigation" }} description={{ bn: "প্রয়োজনে উপযুক্ত আনুষ্ঠানিক যক্ষ্মা সেবাকেন্দ্রের পথে সহায়তা।", en: "Guidance toward suitable formal TB services when needed." }} />
          <FeatureCard number="03" icon="care" title={{ bn: "ফলো-আপ সহায়তা", en: "Follow-up support" }} description={{ bn: "পরবর্তী কাজটি মনে রাখা এবং সেবার সঙ্গে যুক্ত থাকতে সহায়তা।", en: "Help remembering the next action and staying connected to care." }} />
        </div>
      </section>

      <section className="container section-block" id="pharmacy-access" aria-labelledby="pharmacy-access-title">
        <SectionHeading
          id="pharmacy-access-title"
          title={{ bn: "ফার্মেসির QR দিয়ে শুরু করুন", en: "Start with a pharmacy QR" }}
          description={{ bn: "প্রতিটি QR একটি নির্দিষ্ট ডেমো ফার্মেসির পরিচয় বহন করে।", en: "Each QR carries the identity of one specific demo pharmacy." }}
        />
        <div className="pharmacy-qr-grid">
          {demoPharmacies.map((pharmacy) => (
            <PharmacyQrCard
              key={pharmacy.id}
              pharmacy={pharmacy}
              qrBaseUrl={qrBaseUrl}
              messagingLinks={configuredMessagingLinks({ source: "PHARMACY", pharmacyId: pharmacy.id })}
            />
          ))}
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
