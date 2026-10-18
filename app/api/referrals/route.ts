import { NextResponse } from "next/server";
import { broadAreas } from "@/lib/broad-areas";
import { getActivePharmacy } from "@/lib/pharmacies";
import {
  REFERRAL_STATUSES,
  REFERRAL_ID_PATTERN,
  type CreateReferralInput,
  type ReferralSymptomAnswers,
  type ReferralView,
} from "@/lib/referrals";
import { evaluateSafetyRules, SAFETY_OUTCOMES } from "@/lib/safety-rules";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";
import { getTbCentre } from "@/lib/tb-centres";

export const runtime = "nodejs";

const PATIENT_ID_PATTERN = /^(?:FS-CARE|JVH-DEMO)-[A-F0-9]{8}$/;
const SCREENING_ID_PATTERN = /^JVH-SCR-[A-F0-9]{32}$/;
const AUDIO_HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isSymptomAnswers(value: unknown): value is ReferralSymptomAnswers {
  if (!value || typeof value !== "object") return false;
  const answers = value as Partial<ReferralSymptomAnswers>;
  return Number.isSafeInteger(answers.coughDays)
    && Number(answers.coughDays) >= 0
    && Number(answers.coughDays) <= 3650
    && isBoolean(answers.fever)
    && isBoolean(answers.nightSweats)
    && isBoolean(answers.weightLoss)
    && isBoolean(answers.bloodInSputum)
    && isBoolean(answers.tbExposure);
}

function parseCreateInput(value: unknown): CreateReferralInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<CreateReferralInput>;
  const area = broadAreas.find((candidate) => candidate.id === input.areaName);
  const centre = getTbCentre(input.tbCenterId);
  const sourceValid = input.sourceType === "SELF" || input.sourceType === "PHARMACY";
  const pharmacyValid = input.sourceType === "SELF"
    ? input.pharmacyId === undefined
    : Boolean(getActivePharmacy(input.pharmacyId));
  const audioValid = input.audioStatus === "recorded"
    || input.audioStatus === "uploaded"
    || input.audioStatus === "skipped";
  const hashValid = input.audioHash === undefined || AUDIO_HASH_PATTERN.test(input.audioHash);

  if (!PATIENT_ID_PATTERN.test(input.patientId ?? "")
    || !SCREENING_ID_PATTERN.test(input.screeningId ?? "")
    || !sourceValid
    || !pharmacyValid
    || !area
    || !centre
    || !audioValid
    || !hashValid
    || !isSymptomAnswers(input.symptomAnswers)) return null;

  if (input.areaLatitude !== area.latitude || input.areaLongitude !== area.longitude) return null;
  if (input.audioHash !== undefined && input.audioStatus !== "uploaded") return null;

  const fixedOutcome = evaluateSafetyRules(input.symptomAnswers);
  if (fixedOutcome !== input.screeningResult || fixedOutcome === SAFETY_OUTCOMES.CONTINUE) return null;

  return input as CreateReferralInput;
}

function toReferralView(row: Record<string, unknown>, requireReviewFields = false): ReferralView | null {
  const status = String(row.status ?? "");
  if (!REFERRAL_STATUSES.includes(status as ReferralView["status"])) return null;

  const rewardStatus = row.reward_status === null || row.reward_status === undefined
    ? null
    : row.reward_status === "PENDING" || row.reward_status === "HELD_FOR_REVIEW"
      ? row.reward_status
      : undefined;
  const rewardWarning = row.reward_warning === null || row.reward_warning === undefined
    ? null
    : row.reward_warning === "RECENT_SCREENING_ALREADY_EXISTS"
      ? row.reward_warning
      : undefined;
  if (rewardStatus === undefined || rewardWarning === undefined) return null;
  if (requireReviewFields && (
    typeof row.reward_eligible !== "boolean"
    || typeof row.possible_reused_audio !== "boolean"
    || typeof row.activity_requires_review !== "boolean"
  )) return null;

  const referral: ReferralView = {
    referralId: String(row.referral_id ?? ""),
    accessToken: String(row.access_token ?? ""),
    status: status as ReferralView["status"],
    tbCenterId: String(row.tb_center_id ?? ""),
    centreName: String(row.centre_name ?? ""),
    centreArea: String(row.centre_area ?? ""),
    centreDistrict: String(row.centre_district ?? ""),
    serviceType: String(row.service_type ?? ""),
    createdAt: String(row.created_at ?? ""),
    rewardCreated: row.reward_created === true,
    rewardEligible: row.reward_eligible === true,
    rewardStatus,
    rewardWarning,
    possibleReusedAudio: row.possible_reused_audio === true,
    activityRequiresReview: row.activity_requires_review === true,
  };

  if (!REFERRAL_ID_PATTERN.test(referral.referralId)
    || !UUID_PATTERN.test(referral.accessToken)
    || !getTbCentre(referral.tbCenterId)
    || !referral.centreName
    || !referral.centreArea
    || !referral.centreDistrict
    || !referral.serviceType
    || Number.isNaN(Date.parse(referral.createdAt))) return null;

  return referral;
}

export async function POST(request: Request) {
  let input: CreateReferralInput | null = null;
  try {
    input = parseCreateInput(await request.json());
  } catch {
    return errorResponse("INVALID_REFERRAL_REQUEST", 400);
  }
  if (!input) return errorResponse("INVALID_REFERRAL_REQUEST", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc("create_part9_referral", {
      p_screening_id: input.screeningId,
      p_patient_id: input.patientId,
      p_source_type: input.sourceType,
      p_pharmacy_id: input.pharmacyId ?? null,
      p_area_name: input.areaName,
      p_area_latitude: input.areaLatitude,
      p_area_longitude: input.areaLongitude,
      p_symptom_answers: input.symptomAnswers,
      p_audio_status: input.audioStatus,
      p_audio_hash: input.audioHash ?? null,
      p_screening_result: input.screeningResult,
      p_tb_center_id: input.tbCenterId,
    });
    const referral = rows[0] ? toReferralView(rows[0] as unknown as Record<string, unknown>, true) : null;
    if (!referral) return errorResponse("REFERRAL_CREATE_FAILED", 502);
    return NextResponse.json({ referral }, { status: 201, headers: responseHeaders });
  } catch {
    return errorResponse("REFERRAL_CREATE_FAILED", 502);
  }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!UUID_PATTERN.test(token)) return errorResponse("INVALID_REFERRAL_TOKEN", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc("get_part9_referral", { p_access_token: token });
    const referral = rows[0] ? toReferralView(rows[0] as unknown as Record<string, unknown>) : null;
    if (!referral) return errorResponse("REFERRAL_NOT_FOUND", 404);
    return NextResponse.json({ referral }, { headers: responseHeaders });
  } catch {
    return errorResponse("REFERRAL_FETCH_FAILED", 502);
  }
}
