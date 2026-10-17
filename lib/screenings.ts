import type { ReferralSymptomAnswers } from "@/lib/referrals";
import type { SafetyOutcome } from "@/lib/safety-rules";

export type SaveScreeningInput = {
  screeningId: string;
  patientId: string;
  sourceType: "SELF" | "PHARMACY";
  pharmacyId?: string;
  areaName: string;
  areaLatitude: number;
  areaLongitude: number;
  symptomAnswers: ReferralSymptomAnswers;
  audioStatus: "recorded" | "uploaded" | "skipped";
  audioHash?: string;
  screeningResult: SafetyOutcome;
};

export type SavedScreening = {
  screeningId: string;
  created: boolean;
  screeningRewardCreated: boolean;
  rewardEligible: boolean;
  rewardStatus: "PENDING" | "HELD_FOR_REVIEW" | null;
  rewardWarning: "RECENT_SCREENING_ALREADY_EXISTS" | null;
  possibleReusedAudio: boolean;
  activityRequiresReview: boolean;
};

export async function saveCompletedScreening(input: SaveScreeningInput): Promise<SavedScreening> {
  const response = await fetch("/api/screenings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as { screening?: SavedScreening; error?: string } | null;
  if (!response.ok || !body?.screening) {
    throw new Error(body?.error ?? "SCREENING_SAVE_FAILED");
  }
  return body.screening;
}
