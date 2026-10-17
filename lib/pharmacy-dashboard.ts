export type PharmacyDashboardData = {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyArea: string;
  integrityScore: number | null;
  assistedScreenings: number;
  referralsCreated: number;
  referralsCompleted: number;
  completionRate: number;
  simulatedEarnings: number | null;
  earningsConfigured: boolean;
  validScreeningCredits: number;
  appropriateReferralCredits: number;
  verifiedCompletionCredits: number;
  qualityBonusCredits: number;
  heldCredits: number;
  duplicateRewardWarnings: number;
  reusedAudioWarnings: number;
  activityRequiresReview: boolean;
  lastActivityAt: string | null;
};

export async function fetchPharmacyDashboard(pharmacyId: string): Promise<PharmacyDashboardData> {
  const query = new URLSearchParams({ pharmacyId });
  const response = await fetch(`/api/pharmacies/dashboard?${query.toString()}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { dashboard?: PharmacyDashboardData; error?: string } | null;
  if (!response.ok || !body?.dashboard) {
    throw new Error(body?.error ?? "PHARMACY_DASHBOARD_FETCH_FAILED");
  }
  return body.dashboard;
}
