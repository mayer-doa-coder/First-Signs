import type { SafetyOutcome } from "@/lib/safety-rules";

export const REFERRAL_STATUSES = ["PENDING", "FOLLOW_UP", "COMPLETED", "CLOSED"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export type ReferralSymptomAnswers = {
  coughDays: number;
  fever: boolean;
  nightSweats: boolean;
  weightLoss: boolean;
  bloodInSputum: boolean;
  tbExposure: boolean;
};

export type CreateReferralInput = {
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
  tbCenterId: string;
};

export type ReferralView = {
  referralId: string;
  accessToken: string;
  status: ReferralStatus;
  tbCenterId: string;
  centreName: string;
  centreArea: string;
  centreDistrict: string;
  serviceType: string;
  createdAt: string;
  rewardCreated: boolean;
  rewardEligible: boolean;
  rewardStatus: "PENDING" | "HELD_FOR_REVIEW" | null;
  rewardWarning: "RECENT_SCREENING_ALREADY_EXISTS" | null;
  possibleReusedAudio: boolean;
  activityRequiresReview: boolean;
};

export type VerificationReferralView = {
  referralId: string;
  status: ReferralStatus;
  codeUsed: boolean;
  tbCenterId: string;
  centreName: string;
  centreArea: string;
  centreDistrict: string;
  serviceType: string;
  createdAt: string;
  completedAt: string | null;
  alreadyUsed?: boolean;
  completionRewardCreated?: boolean;
};

export type ReferralLookup =
  | { referralId: string; token?: never }
  | { token: string; referralId?: never };

export const REFERRAL_ID_PATTERN = /^JVH-KHU-\d{5,}$/;
export const REFERRAL_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createScreeningId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `JVH-SCR-${suffix}`;
}

export function referralLinkFor(accessToken: string) {
  const query = new URLSearchParams({ token: accessToken });
  return `/referral?${query.toString()}`;
}

export async function requestReferral(input: CreateReferralInput): Promise<ReferralView> {
  let lastError = "REFERRAL_CREATE_FAILED";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => null) as { referral?: ReferralView; error?: string } | null;
      if (response.ok && body?.referral) return body.referral;
      lastError = body?.error ?? lastError;
      if (response.status < 500) break;
    } catch {
      // Referral creation is idempotent by screening ID, so a single retry
      // cannot create a duplicate if the first response was lost in transit.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(lastError);
}

export async function fetchReferral(accessToken: string): Promise<ReferralView> {
  const query = new URLSearchParams({ token: accessToken });
  const response = await fetch(`/api/referrals?${query.toString()}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { referral?: ReferralView; error?: string } | null;
  if (!response.ok || !body?.referral) {
    throw new Error(body?.error ?? "REFERRAL_FETCH_FAILED");
  }
  return body.referral;
}

export function parseReferralLookup(value: string): ReferralLookup | null {
  const trimmed = value.trim();
  const referralId = trimmed.toUpperCase();
  if (REFERRAL_ID_PATTERN.test(referralId)) return { referralId };
  if (REFERRAL_TOKEN_PATTERN.test(trimmed)) return { token: trimmed.toLowerCase() };

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (url.pathname === "/referral" && REFERRAL_TOKEN_PATTERN.test(token)) {
      return { token: token.toLowerCase() };
    }
  } catch {
    // Manual referral IDs and malformed QR values are handled above/below.
  }

  return null;
}

function verificationRequestQuery(lookup: ReferralLookup) {
  return new URLSearchParams(lookup.referralId
    ? { referralId: lookup.referralId }
    : { token: lookup.token ?? "" });
}

export async function fetchReferralForVerification(lookup: ReferralLookup, staffPin: string): Promise<VerificationReferralView> {
  const response = await fetch(`/api/referrals/verify?${verificationRequestQuery(lookup)}`, {
    cache: "no-store",
    headers: { "x-jvh-tb-centre-pin": staffPin },
  });
  const body = await response.json().catch(() => null) as { referral?: VerificationReferralView; error?: string } | null;
  if (!response.ok || !body?.referral) {
    throw new Error(body?.error ?? "REFERRAL_VERIFY_FETCH_FAILED");
  }
  return body.referral;
}

export async function confirmFormalEvaluation(
  lookup: ReferralLookup,
  tbCenterId: string,
  staffPin: string,
): Promise<VerificationReferralView> {
  const response = await fetch("/api/referrals/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-jvh-tb-centre-pin": staffPin },
    body: JSON.stringify({ ...lookup, tbCenterId }),
  });
  const body = await response.json().catch(() => null) as { referral?: VerificationReferralView; error?: string } | null;
  if (!response.ok || !body?.referral) {
    throw new Error(body?.error ?? "REFERRAL_CONFIRM_FAILED");
  }
  return body.referral;
}
