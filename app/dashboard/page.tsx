import { GovernmentDashboard } from "@/components/government-dashboard";
import { BilingualText } from "@/components/language";
import { Icon } from "@/components/icons";
import { PageShell } from "@/components/ui";

export const metadata = { title: "Public Health Dashboard / জনস্বাস্থ্য ড্যাশবোর্ড" };

export default function DashboardPage() {
  return (
    <PageShell eyebrow={{ bn: "জনস্বাস্থ্য কর্মক্ষেত্র", en: "Public-health workspace" }} title={{ bn: "নামবিহীন কর্মসূচির সারসংক্ষেপ", en: "Anonymous programme overview" }} description={{ bn: "পরিকল্পনার সহায়তায় সমষ্টিগত স্ক্রিনিং ও রেফারেল হিসাব। এখানে কোনো ব্যক্তিগত রোগীর তথ্য দেখানো হয় না।", en: "Aggregate screening and referral totals for planning. No private patient information is shown here." }} icon="dashboard">
      <div className="privacy-banner" role="note"><Icon name="shield" /><p><strong><BilingualText copy={{ bn: "গোপনীয়তা সুরক্ষিত", en: "Privacy protected" }} /></strong>{" "}<BilingualText copy={{ bn: "শুধু নামবিহীন সমষ্টিগত সংখ্যা দেখানো হয়—নাম, ফোন নম্বর, উপসর্গ, অডিও বা ঠিকানা নয়।", en: "Only anonymous aggregate counts are shown—never names, phone numbers, symptoms, audio, or addresses." }} /></p></div>
      <GovernmentDashboard />
    </PageShell>
  );
}
