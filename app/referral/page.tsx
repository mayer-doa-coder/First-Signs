import { ReferralTicket } from "@/components/referral-ticket";
import { getPublicAppOrigin } from "@/lib/public-app-origin";

export const metadata = { title: "Referral / রেফারেল" };

type ReferralSearchParams = Promise<{ token?: string | string[] }>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReferralPage({ searchParams }: { searchParams: ReferralSearchParams }) {
  const query = await searchParams;
  const qrBaseUrl = await getPublicAppOrigin();
  return <ReferralTicket initialToken={firstValue(query.token)?.trim()} qrBaseUrl={qrBaseUrl} />;
}
