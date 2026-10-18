import { PharmacyDashboard } from "@/components/pharmacy-dashboard";
import { BilingualText } from "@/components/language";
import { ClayCard, PageShell } from "@/components/ui";
import { defaultDemoPharmacy, getActivePharmacy } from "@/lib/pharmacies";

export const metadata = { title: "Pharmacy Dashboard / ফার্মেসি ড্যাশবোর্ড" };

type PharmacySearchParams = Promise<{ pharmacy?: string | string[] }>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PharmacyPage({ searchParams }: { searchParams: PharmacySearchParams }) {
  const query = await searchParams;
  const initialPharmacy = getActivePharmacy(firstValue(query.pharmacy)) ?? defaultDemoPharmacy;

  return (
    <PageShell eyebrow={{ bn: "ফার্মেসি কর্মক্ষেত্র", en: "Pharmacy workspace" }} title={{ bn: "সহায়তাপ্রাপ্ত সেবার লাইভ সারসংক্ষেপ", en: "Live assisted-care overview" }} description={{ bn: "শুধু নির্বাচিত ফার্মেসির সহায়তায় হওয়া স্ক্রিনিং, রেফারেল ও কর্মপ্রবাহভিত্তিক ক্রেডিট দেখুন। নিজে ব্যবহার করা ব্যক্তির কার্যক্রম আলাদা থাকে।", en: "Track only the selected pharmacy's assisted screenings, referrals, and workflow credits. Self-use activity remains separate." }} icon="pharmacy">
      <ClayCard className="prototype-access-note" role="note"><BilingualText copy={{ bn: "এই ফার্মেসি কর্মক্ষেত্রে শুধুমাত্র সমষ্টিগত কার্যক্রম দেখা যায়। কোনো রোগীর ব্যক্তিগত তথ্য এখানে দেখানো হয় না।", en: "This pharmacy workspace shows aggregate activity only. No private patient information is shown here." }} /></ClayCard>
      <PharmacyDashboard initialPharmacyId={initialPharmacy.id} />
    </PageShell>
  );
}
