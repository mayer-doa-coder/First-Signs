import { NextResponse } from "next/server";
import { broadAreas, type BroadAreaId } from "@/lib/broad-areas";
import type { GovernmentAreaActivity, GovernmentDashboardData, HotspotLevel } from "@/lib/government-dashboard";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";
import { currentAuthUser, hasRole, isAccountAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

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

const broadAreaIds = new Set<string>(broadAreas.map((area) => area.id));
const hotspotLevels = new Set<HotspotLevel>(["NORMAL", "WATCH", "RED"]);

function isoTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function expectedHotspotLevel(independentReferredUsers: number): HotspotLevel {
  if (independentReferredUsers >= 5) return "RED";
  if (independentReferredUsers >= 3) return "WATCH";
  return "NORMAL";
}

function toAreaActivity(value: unknown): GovernmentAreaActivity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const areaId = typeof row.area_name === "string" && broadAreaIds.has(row.area_name)
    ? row.area_name as BroadAreaId
    : null;
  const counts = [
    row.unique_users_screened,
    row.unique_users_recommended,
    row.referral_count,
    row.completion_count,
    row.independent_referred_users,
  ].map(wholeNumber);
  const hotspotLevel = typeof row.hotspot_level === "string" && hotspotLevels.has(row.hotspot_level as HotspotLevel)
    ? row.hotspot_level as HotspotLevel
    : null;

  if (!areaId || counts.some((count) => count === null) || !hotspotLevel) return null;
  const [uniqueUsersScreened, uniqueUsersRecommended, referralCount, completionCount, independentReferredUsers] = counts as number[];
  if (uniqueUsersScreened < 3
    || uniqueUsersRecommended > uniqueUsersScreened
    || completionCount > referralCount
    || independentReferredUsers > referralCount
    || independentReferredUsers > uniqueUsersScreened
    || hotspotLevel !== expectedHotspotLevel(independentReferredUsers)) return null;

  return {
    areaId,
    uniqueUsersScreened,
    uniqueUsersRecommended,
    referralCount,
    completionCount,
    independentReferredUsers,
    hotspotLevel,
  };
}

function toDashboard(row: Record<string, unknown>): GovernmentDashboardData | null {
  const counts = [
    row.total_screenings,
    row.self_use_screenings,
    row.pharmacy_assisted_screenings,
    row.formal_referrals,
    row.completed_referrals,
  ].map(wholeNumber);
  const completionRate = finiteNumber(row.completion_rate);
  const demoWindowStart = isoTimestamp(row.demo_window_started_at);
  const demoWindowEnd = isoTimestamp(row.demo_window_ended_at);
  const demoSeededScreenings = wholeNumber(row.demo_seeded_screenings);
  const rawAreas = Array.isArray(row.area_activity) ? row.area_activity : null;
  const areas = rawAreas?.map(toAreaActivity) ?? null;
  const rawFraudAlerts = row.fraud_alerts && typeof row.fraud_alerts === "object" && !Array.isArray(row.fraud_alerts)
    ? row.fraud_alerts as Record<string, unknown>
    : null;
  const fraudCounts = rawFraudAlerts
    ? [
        rawFraudAlerts.duplicate_reward_warnings,
        rawFraudAlerts.reused_audio_warnings,
        rawFraudAlerts.pharmacies_requiring_review,
        rawFraudAlerts.held_reward_count,
      ].map(wholeNumber)
    : null;

  if (counts.some((value) => value === null)
    || completionRate === null
    || completionRate < 0
    || completionRate > 100
    || !demoWindowStart
    || !demoWindowEnd
    || demoSeededScreenings === null
    || Date.parse(demoWindowStart) >= Date.parse(demoWindowEnd)
    || !areas
    || areas.some((area) => area === null)
    || !fraudCounts
    || fraudCounts.some((count) => count === null)) return null;

  const [totalScreenings, selfUseScreenings, pharmacyAssistedScreenings, formalReferrals, completedReferrals] = counts as number[];
  if (totalScreenings !== selfUseScreenings + pharmacyAssistedScreenings
    || formalReferrals > totalScreenings
    || completedReferrals > formalReferrals) return null;

  const validAreas = areas as GovernmentAreaActivity[];
  if (new Set(validAreas.map((area) => area.areaId)).size !== validAreas.length) return null;

  return {
    totalScreenings,
    selfUseScreenings,
    pharmacyAssistedScreenings,
    formalReferrals,
    completedReferrals,
    completionRate,
    demoWindowStart,
    demoWindowEnd,
    demoSeededScreenings,
    areas: validAreas,
    fraudAlerts: {
      duplicateRewardWarnings: fraudCounts[0]!,
      reusedAudioWarnings: fraudCounts[1]!,
      pharmaciesRequiringReview: fraudCounts[2]!,
      heldRewardCount: fraudCounts[3]!,
    },
  };
}

export async function GET() {
  if (isAccountAuthConfigured()) {
    const user = await currentAuthUser();
    if (!user) return errorResponse("AUTH_REQUIRED", 401);
    if (!await hasRole(user.id, "GOVERNMENT_VIEWER")) return errorResponse("GOVERNMENT_ACCESS_DENIED", 403);
  }
  if (!isReferralDatabaseConfigured()) {
    return errorResponse("GOVERNMENT_DASHBOARD_BACKEND_NOT_CONFIGURED", 503);
  }

  try {
    const rows = await callReferralRpc("get_part13_government_dashboard", {});
    const dashboard = rows[0]
      ? toDashboard(rows[0] as unknown as Record<string, unknown>)
      : null;
    if (!dashboard) return errorResponse("GOVERNMENT_DASHBOARD_INVALID_DATA", 502);
    return NextResponse.json({ dashboard }, { headers: responseHeaders });
  } catch {
    return errorResponse("GOVERNMENT_DASHBOARD_FETCH_FAILED", 502);
  }
}
