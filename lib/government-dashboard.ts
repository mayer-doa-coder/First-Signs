import type { BroadAreaId } from "@/lib/broad-areas";
import type { PathwayId } from "@/lib/care-pathways";

export type HotspotLevel = "NORMAL" | "WATCH" | "RED";

export type GovernmentAreaActivity = {
  areaId: BroadAreaId;
  uniqueUsersScreened: number;
  uniqueUsersRecommended: number;
  referralCount: number;
  completionCount: number;
  independentReferredUsers: number;
  hotspotLevel: HotspotLevel;
};

export type GovernmentDashboardData = {
  totalScreenings: number;
  selfUseScreenings: number;
  pharmacyAssistedScreenings: number;
  formalReferrals: number;
  completedReferrals: number;
  completionRate: number;
  demoWindowStart: string;
  demoWindowEnd: string;
  demoSeededScreenings: number;
  areas: GovernmentAreaActivity[];
  fraudAlerts: {
    duplicateRewardWarnings: number;
    reusedAudioWarnings: number;
    pharmaciesRequiringReview: number;
    heldRewardCount: number;
  };
  pathwayActivity: Array<{
    pathwayId: PathwayId;
    areaId: BroadAreaId;
    signalCount: number;
    urgentCount: number;
    signalLevel: HotspotLevel;
    isDemo: boolean;
  }>;
  recentActions: Array<{
    actionId: string;
    pathwayId: PathwayId;
    areaId: BroadAreaId;
    actionType: PublicHealthActionType;
    note: string | null;
    recordedAt: string;
  }>;
};

export const PUBLIC_HEALTH_ACTION_TYPES = ["REVIEW_SIGNAL", "CHECK_WATER_SAFETY", "ARRANGE_OUTREACH", "CHECK_TESTING_ACCESS", "MOBILE_SERVICE", "CLOSE_REVIEW"] as const;
export type PublicHealthActionType = (typeof PUBLIC_HEALTH_ACTION_TYPES)[number];

export async function fetchGovernmentDashboard(): Promise<GovernmentDashboardData> {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  const body = await response.json().catch(() => null) as {
    dashboard?: GovernmentDashboardData;
    error?: string;
  } | null;

  if (!response.ok || !body?.dashboard) {
    throw new Error(body?.error ?? "GOVERNMENT_DASHBOARD_FETCH_FAILED");
  }

  return body.dashboard;
}

export async function recordPublicHealthAction(input: { pathwayId: PathwayId; areaId: BroadAreaId; actionType: PublicHealthActionType; note?: string }) {
  const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error("PUBLIC_HEALTH_ACTION_FAILED");
}
