import { BilingualText } from "@/components/language";
import { ScreeningFlow } from "@/components/screening-flow";
import { ActionLink, ClayCard, DemoNotice, FeatureCard, PageShell, SectionHeading, StatusPill } from "@/components/ui";
import { getActivePharmacy } from "@/lib/pharmacies";

export const metadata = { title: "Screening / স্ক্রিনিং" };

type ScreenSearchParams = Promise<{
  source?: string | string[];
  pharmacy?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ScreenPage({ searchParams }: { searchParams: ScreenSearchParams }) {
  const query = await searchParams;
  const source = firstValue(query.source);
  const pharmacyId = firstValue(query.pharmacy);
  const pharmacy = source === "pharmacy" ? getActivePharmacy(pharmacyId) : undefined;
  const isSelfUse = source === "self";
  const hasValidEntry = isSelfUse || Boolean(pharmacy);

  if (!hasValidEntry) {
    const invalidPharmacy = source === "pharmacy";

    return (
      <PageShell
        eyebrow={{ bn: "প্রবেশের ধরন নির্বাচন করুন", en: "Choose how to enter" }}
        title={{ bn: invalidPharmacy ? "ফার্মেসির QR লিংকটি সঠিক নয়" : "কীভাবে যাচাই করবেন?", en: invalidPharmacy ? "This pharmacy QR link is not valid" : "How would you like to check?" }}
        description={{ bn: invalidPharmacy ? "এই পরিচয়ে কোনো সক্রিয় ডেমো ফার্মেসি পাওয়া যায়নি। নতুন QR স্ক্যান করুন অথবা নিজে যাচাই শুরু করুন।" : "নিজের ডিভাইস থেকে শুরু করুন অথবা হোম পেজে একটি ফার্মেসির QR বেছে নিন।", en: invalidPharmacy ? "No active demo pharmacy was found for this ID. Scan a current QR or begin a self-use check." : "Start on your own device or choose a pharmacy QR on the home page." }}
        icon={invalidPharmacy ? "pharmacy" : "screen"}
      >
        <ClayCard className="entry-error" as="section">
          <StatusPill tone={invalidPharmacy ? "risk" : "neutral"} icon="info" label={{ bn: invalidPharmacy ? "অযাচাইকৃত ফার্মেসি" : "প্রবেশের ধরন প্রয়োজন", en: invalidPharmacy ? "Unverified pharmacy" : "Entry type required" }} />
          {invalidPharmacy && pharmacyId && <code className="pharmacy-id" lang="en">{pharmacyId}</code>}
          <div className="button-row">
            <ActionLink href="/screen?source=self" icon="home" label={{ bn: "বাড়ি থেকে যাচাই করুন", en: "Check from home" }} />
            <ActionLink href="/#pharmacy-access" variant="secondary" icon="pharmacy" label={{ bn: "ফার্মেসির QR বেছে নিন", en: "Choose a pharmacy QR" }} />
          </div>
        </ClayCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={{ bn: "রোগীর স্ক্রিনিং", en: "Patient screening" }}
      title={{ bn: "আপনার উদ্বেগ বুঝে পরবর্তী পদক্ষেপ খুঁজুন", en: "Understand your concern and find the next step" }}
      description={{ bn: "এই পাতায় সংক্ষিপ্ত প্রশ্ন, কাশির অডিও এবং এলাকার তথ্যের মাধ্যমে সেবা-দিকনির্দেশনা তৈরি হবে।", en: "This page will use short questions, cough audio, and broad area information to guide care." }}
      icon="screen"
    >
      <DemoNotice />
      <ClayCard className="entry-context" as="section">
        <div className="entry-context-heading">
          <StatusPill
            tone="success"
            icon={isSelfUse ? "home" : "pharmacy"}
            label={isSelfUse ? { bn: "নিজে ব্যবহার", en: "Self-use" } : { bn: "ফার্মেসির সহায়তায়", en: "Pharmacy-assisted" }}
          />
          <h2>
            <BilingualText copy={isSelfUse ? { bn: "আপনি নিজের ডিভাইস থেকে স্ক্রিনিং করছেন।", en: "You are checking from your own device." } : { bn: `${pharmacy!.name.bn} এই স্ক্রিনিংয়ে সহায়তা করছে।`, en: `This screening is being assisted by ${pharmacy!.name.en}.` }} />
          </h2>
        </div>
        {pharmacy && (
          <dl className="entry-details">
            <div><dt><BilingualText copy={{ bn: "ফার্মেসির পরিচয়", en: "Pharmacy ID" }} /></dt><dd lang="en">{pharmacy.id}</dd></div>
            <div><dt><BilingualText copy={{ bn: "ফার্মেসি", en: "Pharmacy" }} /></dt><dd><BilingualText copy={pharmacy.name} /></dd></div>
            <div><dt><BilingualText copy={{ bn: "এলাকা", en: "Area" }} /></dt><dd><BilingualText copy={pharmacy.area} /></dd></div>
          </dl>
        )}
        <p><BilingualText copy={{ bn: "প্রবেশের ধরনটি এই স্ক্রিনিং লিংকের সঙ্গে রাখা হয়েছে। চিকিৎসা-সংক্রান্ত ধাপ দুই পথেই একই।", en: "The entry source is retained in this screening link. The health pathway is the same for both entry types." }} /></p>
      </ClayCard>
      <div className="split-layout">
        <ScreeningFlow isSelfUse={isSelfUse} pharmacyId={pharmacy?.id} pharmacyName={pharmacy?.name} />
        <aside className="side-stack">
          <ClayCard className="compact-card">
            <StatusPill tone="success" icon="home" label={{ bn: "নিজের ডিভাইস", en: "Own device" }} />
            <h3><BilingualText copy={{ bn: "নিজে ব্যবহার", en: "Self-use" }} /></h3>
            <p><BilingualText copy={{ bn: "নিজের ফোন থেকে একই নিরাপদ স্ক্রিনিং পথ।", en: "The same safe screening pathway from your own phone." }} /></p>
          </ClayCard>
          <ClayCard className="compact-card">
            <StatusPill tone="neutral" icon="pharmacy" label={{ bn: "সহায়তাপ্রাপ্ত", en: "Assisted" }} />
            <h3><BilingualText copy={{ bn: "ফার্মেসির সহায়তায়", en: "Pharmacy-assisted" }} /></h3>
            <p><BilingualText copy={{ bn: "প্রয়োজনে ফার্মেসি কর্মী ডিভাইস ব্যবহারে সহায়তা করতে পারবেন।", en: "A pharmacy worker can help with the device when needed." }} /></p>
          </ClayCard>
        </aside>
      </div>
      <section className="section-block" aria-labelledby="screen-preview-title">
        <SectionHeading title={{ bn: "এই স্ক্রিনিংয়ের অংশ", en: "What this screening includes" }} />
        <div className="feature-grid three-column" id="screen-preview-title">
          <FeatureCard icon="document" title={{ bn: "লক্ষণ ও ঝুঁকি", en: "Symptoms and risks" }} description={{ bn: "শুধু প্রয়োজনীয় কয়েকটি ছোট প্রশ্ন।", en: "Only a small set of useful questions." }} />
          <FeatureCard icon="care" title={{ bn: "কাশির নমুনা", en: "Cough sample" }} description={{ bn: "ঐচ্ছিক পরীক্ষামূলক অডিও সংকেত।", en: "An optional experimental acoustic signal." }} />
          <FeatureCard icon="location" title={{ bn: "বিস্তৃত এলাকা", en: "Broad area" }} description={{ bn: "সেবাকেন্দ্র খোঁজার জন্য; নির্দিষ্ট বাসার ঠিকানা নয়।", en: "For finding care, never an exact home address." }} />
        </div>
      </section>
    </PageShell>
  );
}
