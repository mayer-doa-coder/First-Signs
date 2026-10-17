import Link from "next/link";
import { BilingualText } from "@/components/language";
import { ClayCard, PageShell } from "@/components/ui";

export default function NotFound() {
  return (
    <PageShell
      eyebrow={{ bn: "পৃষ্ঠা পাওয়া যায়নি", en: "Page not found" }}
      title={{ bn: "এই ঠিকানায় কোনো পৃষ্ঠা নেই", en: "There is no page at this address" }}
      description={{
        bn: "লিংকটি ঠিক আছে কি না দেখুন, অথবা হোম পেজ থেকে আবার শুরু করুন।",
        en: "Check the link, or return home and start again.",
      }}
      icon="info"
    >
      <ClayCard className="care-loading">
        <Link className="button button-primary" href="/">
          <BilingualText copy={{ bn: "হোম পেজে ফিরুন", en: "Return home" }} />
        </Link>
      </ClayCard>
    </PageShell>
  );
}
