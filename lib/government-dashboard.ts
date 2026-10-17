import type { BroadAreaId } from "@/lib/broad-areas";

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
};

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
