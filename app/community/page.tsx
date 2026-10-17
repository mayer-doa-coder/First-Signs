import { BilingualText } from "@/components/language";
import { Icon } from "@/components/icons";
import { CommunityEngagement } from "@/components/community-engagement";
import { ActionLink, FeatureCard, PageShell, SectionHeading } from "@/components/ui";

export const metadata = { title: "Community / কমিউনিটি" };

export default function CommunityPage() {
  return (
    <PageShell eyebrow={{ bn: "কমিউনিটি", en: "Community" }} title={{ bn: "মানুষকে যক্ষ্মা সেবায় পৌঁছাতে কী বাধা দেয়?", en: "What keeps people from reaching TB care?" }} description={{ bn: "ব্যক্তিগত স্বাস্থ্যতথ্য না নিয়েই কমিউনিটির অভিজ্ঞতা থেকে সেবার পথটি আরও সহায়ক করা যায়।", en: "Community experience can improve the care pathway without collecting personal health information." }} icon="community" actions={<ActionLink href="/screen?source=self" label={{ bn: "ডেমো শুরু করুন", en: "Start the demo" }} />}>
      <div className="community-privacy-note" role="note">
        <Icon name="shield" />
        <p><strong><BilingualText copy={{ bn: "গোপনীয়তা আগে", en: "Privacy first" }} /></strong>{" "}<BilingualText copy={{ bn: "এই পাতায় ব্যক্তিগত স্বাস্থ্যতথ্য বা যক্ষ্মা অবস্থা চাওয়া হয় না।", en: "This page never asks for personal health information or TB status." }} /></p>
      </div>
      <section className="section-block" aria-labelledby="story-title">
        <SectionHeading title={{ bn: "সমস্যা থেকে সমাধানের পথে", en: "From problem to practical support" }} />
        <div className="feature-grid three-column" id="story-title">
          <FeatureCard icon="clock" number="01" title={{ bn: "দেরি হয়ে যায়", en: "Care is delayed" }} description={{ bn: "কাজ, দূরত্ব, ভয় বা ভুল বোঝাবুঝির কারণে মানুষ আনুষ্ঠানিক সেবায় যেতে দেরি করতে পারেন।", en: "Work, distance, fear, or misunderstanding can delay formal care." }} />
          <FeatureCard icon="pharmacy" number="02" title={{ bn: "কাছের সহায়তা", en: "Help close to home" }} description={{ bn: "নিজের ফোনের পাশাপাশি ফার্মেসি সহায়তাপ্রাপ্ত প্রবেশের আরেকটি পথ দেয়।", en: "Alongside self-use, pharmacies provide another assisted entry point." }} />
          <FeatureCard icon="care" number="03" title={{ bn: "যোগাযোগ ধরে রাখা", en: "Stay connected" }} description={{ bn: "সহজ পরবর্তী পদক্ষেপ ও ফলো-আপ মানুষকে আনুষ্ঠানিক মূল্যায়নের পথে রাখে।", en: "Clear next steps and follow-up help people reach formal evaluation." }} />
        </div>
      </section>
      <CommunityEngagement />
    </PageShell>
  );
}
