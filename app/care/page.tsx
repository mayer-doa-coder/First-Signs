import { CareCompanion } from "@/components/care-companion";
import type { CareEntrySource } from "@/lib/care-session";

export const metadata = { title: "My Care / আমার সেবা" };

type CareSearchParams = Promise<{
  patient?: string | string[];
  source?: string | string[];
  pharmacy?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CarePage({ searchParams }: { searchParams: CareSearchParams }) {
  const query = await searchParams;
  const patientId = firstValue(query.patient)?.trim().toUpperCase();
  const sourceValue = firstValue(query.source);
  const source: CareEntrySource | undefined = sourceValue === "self" || sourceValue === "pharmacy"
    ? sourceValue
    : undefined;

  return (
    <CareCompanion
      initialPatientId={patientId}
      initialSource={source}
      initialPharmacyId={firstValue(query.pharmacy)?.trim().toUpperCase()}
    />
  );
}
