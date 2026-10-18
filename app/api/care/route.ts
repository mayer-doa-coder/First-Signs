import { NextResponse } from "next/server";
import type { CareRecord, CareReferralStatus } from "@/lib/care-session";
import {
  isFollowUpAction,
  isFollowUpBarrier,
  type FollowUpStatus,
  type FollowUpView,
} from "@/lib/follow-ups";
import {
  REFERRAL_ID_PATTERN,
  REFERRAL_STATUSES,
  REFERRAL_TOKEN_PATTERN,
  type ReferralStatus,
  type ReferralView,
} from "@/lib/referrals";
import { evaluateSafetyRules, SAFETY_OUTCOMES, type SafetyOutcome } from "@/lib/safety-rules";
import {
  CARE_OUTCOMES, evaluateCarePathway, getPathway, isAgeBand, isPathwayId,
  pathwayAnswersAreValid, type AgeBand, type CareOutcome, type PathwayAnswers, type PathwayId,
} from "@/lib/care-pathways";
import { broadAreas } from "@/lib/broad-areas";
import { getActivePharmacy } from "@/lib/pharmacies";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";
import { getTbCentre } from "@/lib/tb-centres";

export const runtime = "nodejs";

const PATIENT_ID_PATTERN = /^(?:FS-CARE|JVH-DEMO)-[A-F0-9]{8}$/;
const SCREENING_ID_PATTERN = /^JVH-SCR-[A-F0-9]{32}$/;
const AUDIO_HASH_PATTERN = /^[0-9a-f]{64}$/;
const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

type CareRpcRow = Record<string, unknown>;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

function parseReferral(row: CareRpcRow): ReferralView | null {
  if (row.referral_id === null) return null;
  const status = String(row.referral_status ?? "") as ReferralStatus;
  const tbCenterId = String(row.tb_center_id ?? "");
  const rewardStatus = row.reward_status === null
    ? null
    : row.reward_status === "PENDING" || row.reward_status === "HELD_FOR_REVIEW"
      ? row.reward_status
      : undefined;
  const rewardWarning = row.reward_warning === null
    ? null
    : row.reward_warning === "RECENT_SCREENING_ALREADY_EXISTS"
      ? row.reward_warning
      : undefined;
  const referral: ReferralView = {
    referralId: String(row.referral_id ?? ""),
    accessToken: String(row.access_token ?? ""),
    status,
    tbCenterId,
    facilityId: tbCenterId,
    pathwayId: isPathwayId(row.pathway_id) ? row.pathway_id : "RESPIRATORY_TB",
    centreName: String(row.centre_name ?? ""),
    centreArea: String(row.centre_area ?? ""),
    centreDistrict: String(row.centre_district ?? ""),
    serviceType: String(row.service_type ?? ""),
    createdAt: String(row.referral_created_at ?? ""),
    rewardCreated: row.reward_created === true,
    rewardEligible: row.reward_eligible === true,
    rewardStatus: rewardStatus ?? null,
    rewardWarning: rewardWarning ?? null,
    possibleReusedAudio: row.possible_reused_audio === true,
    activityRequiresReview: row.activity_requires_review === true,
  };
  if (!REFERRAL_ID_PATTERN.test(referral.referralId)
    || !REFERRAL_TOKEN_PATTERN.test(referral.accessToken)
    || !REFERRAL_STATUSES.includes(status)
    || !getTbCentre(tbCenterId)
    || rewardStatus === undefined
    || rewardWarning === undefined
    || !referral.centreName
    || !referral.centreArea
    || !referral.centreDistrict
    || !referral.serviceType
    || Number.isNaN(Date.parse(referral.createdAt))) return null;
  return referral;
}

function parseFollowUp(row: CareRpcRow, referral: ReferralView | null): FollowUpView | undefined {
  if (row.followup_status === null) return undefined;
  if (!referral) return undefined;
  const status = String(row.followup_status) as FollowUpStatus;
  const barrier = row.barrier;
  const nextAction = row.next_action;
  const createdAt = String(row.followup_created_at ?? "");
  if ((status !== "AWAITING_BARRIER" && status !== "ACTION_READY")
    || (barrier !== null && !isFollowUpBarrier(barrier))
    || (nextAction !== null && !isFollowUpAction(nextAction))
    || Number.isNaN(Date.parse(createdAt))) return undefined;
  if (status === "AWAITING_BARRIER" && (barrier !== null || nextAction !== null)) return undefined;
  if (status === "ACTION_READY" && (barrier === null || nextAction === null)) return undefined;
  return {
    referralId: referral.referralId,
    referralStatus: referral.status,
    status,
    barrier,
    nextAction,
    createdAt,
  };
}

function parseCare(row: CareRpcRow): CareRecord | null {
  const patientId = String(row.patient_id ?? "");
  const screeningId = String(row.screening_id ?? "");
  const sourceType = row.source_type;
  const pharmacyId = row.pharmacy_id === null ? undefined : String(row.pharmacy_id ?? "");
  const area = String(row.area_name ?? "");
  const pathwayId: PathwayId = isPathwayId(row.pathway_id) ? row.pathway_id : "RESPIRATORY_TB";
  const ageBand: AgeBand = isAgeBand(row.age_band) ? row.age_band : "ADULT";
  const answers = pathwayAnswersAreValid(pathwayId, row.symptom_answers) ? row.symptom_answers as PathwayAnswers : null;
  const outcome = String(row.screening_result ?? "") as SafetyOutcome | CareOutcome;
  const isLegacyOutcome = Object.values(SAFETY_OUTCOMES).includes(outcome as SafetyOutcome);
  const audioChoice = row.audio_status;
  const audioHash = row.audio_file_hash === null ? undefined : String(row.audio_file_hash ?? "");
  const createdAt = String(row.screening_created_at ?? "");
  const updatedAt = String(row.state_updated_at ?? "");
  const referral = parseReferral(row);

  if (!PATIENT_ID_PATTERN.test(patientId)
    || !SCREENING_ID_PATTERN.test(screeningId)
    || (sourceType !== "SELF" && sourceType !== "PHARMACY")
    || (sourceType === "SELF" ? pharmacyId !== undefined : !getActivePharmacy(pharmacyId))
    || !broadAreas.some((candidate) => candidate.id === area)
    || !answers
    || (!isLegacyOutcome && !Object.values(CARE_OUTCOMES).includes(outcome as CareOutcome))
    || (isLegacyOutcome
      ? evaluateSafetyRules(answers as Parameters<typeof evaluateSafetyRules>[0]) !== outcome
      : evaluateCarePathway(pathwayId, ageBand, answers) !== outcome)
    || (audioChoice !== "recorded" && audioChoice !== "uploaded" && audioChoice !== "skipped")
    || (audioHash !== undefined && (!AUDIO_HASH_PATTERN.test(audioHash) || audioChoice !== "uploaded"))
    || Number.isNaN(Date.parse(createdAt))
    || Number.isNaN(Date.parse(updatedAt))
    || (row.referral_id !== null && !referral)) return null;

  const referralStatus: CareReferralStatus = referral
    ? referral.status === "FOLLOW_UP" ? "FOLLOW_UP_NEEDED" : referral.status
    : "NOT_REQUESTED";
  const followUp = parseFollowUp(row, referral);
  if (row.followup_status !== null && !followUp) return null;

  return {
    version: 1,
    patientId,
    source: sourceType === "SELF" ? "self" : "pharmacy",
    ...(pharmacyId ? { pharmacyId } : {}),
    area,
    pathwayId,
    ruleVersion: typeof row.rule_version === "string" ? row.rule_version : getPathway(pathwayId).ruleVersion,
    ageBand,
    screeningOutcome: outcome,
    symptomAnswers: answers,
    screeningId,
    audioChoice,
    ...(audioHash ? { audioHash } : {}),
    referralStatus,
    ...(referral ? { selectedCentreId: referral.tbCenterId, referral } : {}),
    ...(followUp ? { followUp } : {}),
    followUpNeeded: referralStatus === "FOLLOW_UP_NEEDED",
    createdAt,
    updatedAt,
  };
}

export async function POST(request: Request) {
  let patientId = "";
  try {
    const body: unknown = await request.json();
    patientId = body && typeof body === "object"
      ? String((body as Record<string, unknown>).patientId ?? "").trim().toUpperCase()
      : "";
  } catch {
    return errorResponse("INVALID_CARE_LOOKUP", 400);
  }
  if (!PATIENT_ID_PATTERN.test(patientId)) return errorResponse("INVALID_CARE_LOOKUP", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("CARE_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc<CareRpcRow>("get_part14_care_status", { p_patient_id: patientId });
    const care = rows[0] ? parseCare(rows[0]) : null;
    if (!care) return errorResponse(rows[0] ? "CARE_RESPONSE_INVALID" : "CARE_NOT_FOUND", rows[0] ? 502 : 404);
    return NextResponse.json({ care }, { headers: responseHeaders });
  } catch {
    return errorResponse("CARE_FETCH_FAILED", 502);
  }
}
