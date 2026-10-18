import { BilingualText } from "@/components/language";
import { PharmacyQrCard } from "@/components/pharmacy-qr-card";
import { ActionLink, ClayCard, PageShell, SectionHeading } from "@/components/ui";
import { demoPharmacies } from "@/lib/pharmacies";
import { telegramEntryLink } from "@/lib/messaging-links";
import { getPublicAppOrigin } from "@/lib/public-app-origin";

export const metadata = { title: "Pharmacy directory / ফার্মেসি তালিকা" };

export default async function PharmacyDirectoryPage() {
  const qrBaseUrl = await getPublicAppOrigin();
  const telegramUsername = process.env.TELEGRAM_BOT_USERNAME ?? "";

  return (
    <PageShell
      eyebrow={{ bn: "ফার্মেসি সহায়তা", en: "Pharmacy support" }}
      title={{ bn: "সহায়তাপ্রাপ্ত স্ক্রিনিংয়ের জন্য ফার্মেসি বেছে নিন", en: "Choose a pharmacy for assisted screening" }}
      description={{ bn: "নিজের ফোনে শুরু করা সবসময়ই একটি বিকল্প। সাহায্য চাইলে নিচের যেকোনো সক্রিয় ফার্মেসির QR ব্যবহার করুন।", en: "Starting on your own phone is always an option. If you want help, use the QR code for any active pharmacy below." }}
      icon="pharmacy"
      actions={<ActionLink href="/screen?source=self" variant="secondary" icon="home" label={{ bn: "নিজে শুরু করুন", en: "Start on your own" }} />}
    >
      <ClayCard className="prototype-access-note" role="note">
        <BilingualText copy={{ bn: "ফার্মেসি সহায়তা স্বাস্থ্য-সতর্কতার পাঁচটি পথেই পাওয়া যায়। ফার্মেসি রোগ নির্ণয় করে না বা উপস্থিতি যাচাই করে না।", en: "Pharmacy assistance is available for all five health-concern pathways. A pharmacy does not diagnose a disease or verify attendance." }} />
      </ClayCard>
      <section className="section-block" aria-labelledby="pharmacy-directory-title">
        <SectionHeading id="pharmacy-directory-title" title={{ bn: "সক্রিয় ফার্মেসি", en: "Active pharmacies" }} description={{ bn: "প্রতিটি QR একটি নির্দিষ্ট ফার্মেসির সহায়তাপ্রাপ্ত সেশন খোলে।", en: "Each QR opens an assisted session linked to one specific pharmacy." }} />
        <div className="pharmacy-qr-grid">
          {demoPharmacies.map((pharmacy) => (
            <PharmacyQrCard
              key={pharmacy.id}
              pharmacy={pharmacy}
              qrBaseUrl={qrBaseUrl}
              messagingLinks={{ telegram: telegramEntryLink(telegramUsername, { source: "PHARMACY", pharmacyId: pharmacy.id }) }}
            />
          ))}
        </div>
      </section>
    </PageShell>
  );
}
