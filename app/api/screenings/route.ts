import { NextResponse } from "next/server";
import { broadAreas } from "@/lib/broad-areas";
import { getActivePharmacy } from "@/lib/pharmacies";
import {
  CARE_OUTCOMES,
  evaluateCarePathway,
  getPathway,
  isAgeBand,
  isPathwayId,
  pathwayAnswersAreValid,
} from "@/lib/care-pathways";
import type { SaveScreeningInput, SavedScreening } from "@/lib/screenings";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

const PATIENT_ID_PATTERN = /^(?:FS-CARE|JVH-DEMO)-[A-F0-9]{8}$/;
const SCREENING_ID_PATTERN = /^JVH-SCR-[A-F0-9]{32}$/;
const AUDIO_HASH_PATTERN = /^[0-9a-f]{64}$/;
const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

function parseInput(value: unknown): SaveScreeningInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SaveScreeningInput>;
  const area = broadAreas.find((candidate) => candidate.id === input.areaName);
  const sourceValid = input.sourceType === "SELF" || input.sourceType === "PHARMACY";
  const pharmacyValid = input.sourceType === "SELF"
    ? input.pharmacyId === undefined
    : Boolean(getActivePharmacy(input.pharmacyId));
  const audioValid = input.audioStatus === "recorded"
    || input.audioStatus === "uploaded"
    || input.audioStatus === "skipped";
  const pathwayValid = isPathwayId(input.pathwayId);
  const ageValid = isAgeBand(input.ageBand);
  const resultValid = Object.values(CARE_OUTCOMES).includes(input.screeningResult as never);
  const hashValid = input.audioHash === undefined || AUDIO_HASH_PATTERN.test(input.audioHash);

  if (!PATIENT_ID_PATTERN.test(input.patientId ?? "")
    || !SCREENING_ID_PATTERN.test(input.screeningId ?? "")
    || !sourceValid
    || !pharmacyValid
    || !area
    || !audioValid
    || !hashValid
    || !pathwayValid
    || !ageValid
    || !resultValid
    || input.ruleVersion !== getPathway(input.pathwayId!).ruleVersion
    || !pathwayAnswersAreValid(input.pathwayId!, input.symptomAnswers)) return null;

  if (input.areaLatitude !== area.latitude || input.areaLongitude !== area.longitude) return null;
  if (input.audioHash !== undefined && input.audioStatus !== "uploaded") return null;
  if (evaluateCarePathway(input.pathwayId!, input.ageBand!, input.symptomAnswers!) !== input.screeningResult) return null;
  return input as SaveScreeningInput;
}

function toSavedScreening(row: Record<string, unknown>): SavedScreening | null {
  const screeningId = String(row.screening_id ?? "");
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
  if (!SCREENING_ID_PATTERN.test(screeningId)
    || typeof row.created !== "boolean"
    || typeof row.screening_reward_created !== "boolean"
    || typeof row.reward_eligible !== "boolean"
    || typeof row.possible_reused_audio !== "boolean"
    || typeof row.activity_requires_review !== "boolean"
    || rewardStatus === undefined
    || rewardWarning === undefined) return null;
  return {
    screeningId,
    created: row.created,
    screeningRewardCreated: row.screening_reward_created,
    rewardEligible: row.reward_eligible,
    rewardStatus,
    rewardWarning,
    possibleReusedAudio: row.possible_reused_audio,
    activityRequiresReview: row.activity_requires_review,
  };
}

export async function POST(request: Request) {
  let input: SaveScreeningInput | null;
  try {
    input = parseInput(await request.json());
  } catch {
    return errorResponse("INVALID_SCREENING_REQUEST", 400);
  }
  if (!input) return errorResponse("INVALID_SCREENING_REQUEST", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("SCREENING_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc("save_multisyndrome_screening", {
      p_screening_id: input.screeningId,
      p_patient_id: input.patientId,
      p_source_type: input.sourceType,
      p_pharmacy_id: input.pharmacyId ?? null,
      p_pathway_id: input.pathwayId,
      p_rule_version: input.ruleVersion,
      p_age_band: input.ageBand,
      p_area_name: input.areaName,
      p_area_latitude: input.areaLatitude,
      p_area_longitude: input.areaLongitude,
      p_symptom_answers: input.symptomAnswers,
      p_audio_status: input.audioStatus,
      p_audio_hash: input.audioHash ?? null,
      p_screening_result: input.screeningResult,
    });
    const screening = rows[0]
      ? toSavedScreening(rows[0] as unknown as Record<string, unknown>)
      : null;
    if (!screening) return errorResponse("SCREENING_SAVE_FAILED", 502);
    return NextResponse.json({ screening }, { status: 201, headers: responseHeaders });
  } catch {
    return errorResponse("SCREENING_SAVE_FAILED", 502);
  }
}
