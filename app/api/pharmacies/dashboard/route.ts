import { NextResponse } from "next/server";
import { getActivePharmacy } from "@/lib/pharmacies";
import type { PharmacyDashboardData } from "@/lib/pharmacy-dashboard";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";
import { currentAuthUser, currentMemberships, isAccountAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";

const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function wholeNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function toDashboard(row: Record<string, unknown>): PharmacyDashboardData | null {
  const pharmacyId = String(row.pharmacy_id ?? "");
  const pharmacyName = String(row.pharmacy_name ?? "");
  const pharmacyArea = String(row.pharmacy_area ?? "");
  const counts = [
    row.assisted_screenings,
    row.referrals_created,
    row.referrals_completed,
    row.valid_screening_credits,
    row.appropriate_referral_credits,
    row.verified_completion_credits,
    row.quality_bonus_credits,
    row.held_credits,
    row.duplicate_reward_warnings,
    row.reused_audio_warnings,
  ].map(wholeNumber);
  const completionRate = finiteNumber(row.completion_rate);
  const integrityScore = row.integrity_score === null ? null : finiteNumber(row.integrity_score);
  const earningsConfigured = row.earnings_configured === true;
  const simulatedEarnings = row.simulated_earnings === null ? null : finiteNumber(row.simulated_earnings);
  const lastActivityAt = row.last_activity_at === null ? null : String(row.last_activity_at ?? "");
  const activityRequiresReview = typeof row.activity_requires_review === "boolean"
    ? row.activity_requires_review
    : null;

  if (!pharmacyId || !pharmacyName || !pharmacyArea
    || counts.some((value) => value === null)
    || completionRate === null || completionRate < 0 || completionRate > 100
    || (integrityScore !== null && (integrityScore < 0 || integrityScore > 100))
    || (earningsConfigured && (simulatedEarnings === null || simulatedEarnings < 0))
    || (!earningsConfigured && simulatedEarnings !== null)
    || activityRequiresReview === null
    || (lastActivityAt !== null && Number.isNaN(Date.parse(lastActivityAt)))) return null;

  return {
    pharmacyId,
    pharmacyName,
    pharmacyArea,
    integrityScore,
    assistedScreenings: counts[0]!,
    referralsCreated: counts[1]!,
    referralsCompleted: counts[2]!,
    completionRate,
    simulatedEarnings,
    earningsConfigured,
    validScreeningCredits: counts[3]!,
    appropriateReferralCredits: counts[4]!,
    verifiedCompletionCredits: counts[5]!,
    qualityBonusCredits: counts[6]!,
    heldCredits: counts[7]!,
    duplicateRewardWarnings: counts[8]!,
    reusedAudioWarnings: counts[9]!,
    activityRequiresReview,
    lastActivityAt,
  };
}

export async function GET(request: Request) {
  let pharmacyId = new URL(request.url).searchParams.get("pharmacyId")?.trim().toUpperCase() ?? "";
  let membershipScoped = false;
  if (isAccountAuthConfigured()) {
    const user = await currentAuthUser();
    if (!user) return errorResponse("AUTH_REQUIRED", 401);
    const membership = (await currentMemberships(user.id)).find((candidate) => candidate.role === "PHARMACY_STAFF" && candidate.pharmacy_id);
    if (!membership?.pharmacy_id) return errorResponse("PHARMACY_ACCESS_DENIED", 403);
    pharmacyId = membership.pharmacy_id;
    membershipScoped = true;
  }
  if (!getActivePharmacy(pharmacyId)) return errorResponse("PHARMACY_NOT_FOUND", 404);
  if (!isReferralDatabaseConfigured()) return errorResponse("PHARMACY_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc("get_part11_pharmacy_dashboard", { p_pharmacy_id: pharmacyId });
    const dashboard = rows[0] ? toDashboard(rows[0] as unknown as Record<string, unknown>) : null;
    if (!dashboard || dashboard.pharmacyId !== pharmacyId) {
      return errorResponse("PHARMACY_DASHBOARD_NOT_FOUND", 404);
    }
    return NextResponse.json({ dashboard: { ...dashboard, membershipScoped } }, { headers: responseHeaders });
  } catch {
    return errorResponse("PHARMACY_DASHBOARD_FETCH_FAILED", 502);
  }
}
