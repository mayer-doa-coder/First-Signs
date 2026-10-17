import type { Copy } from "../components/language";
import {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_BARRIERS,
  type FollowUpAction,
  type FollowUpBarrier,
} from "./follow-up-categories.ts";
import type { CareReferralStatus } from "./care-session";

export const AI_COMPANION_ACTIONS = ["CLASSIFY_BARRIER", "EXPLAIN_NEXT_STEP"] as const;
export type AiCompanionAction = (typeof AI_COMPANION_ACTIONS)[number];

export const AI_FREE_TEXT_MAX_LENGTH = 300;

export type AiBarrierResponse = {
  action: "CLASSIFY_BARRIER";
  barrier: FollowUpBarrier;
  explanation: Copy;
};

export type AiExplanationResponse = {
  action: "EXPLAIN_NEXT_STEP";
  explanation: Copy;
};

export type AiCompanionResponse = AiBarrierResponse | AiExplanationResponse;

export const AI_REFERRAL_STATUSES: readonly CareReferralStatus[] = [
  "NOT_REQUESTED",
  "READY_TO_CONTINUE",
  "PENDING",
  "FOLLOW_UP_NEEDED",
  "COMPLETED",
  "CLOSED",
];

export function isAiLanguage(value: unknown): value is "bn" | "en" {
  return value === "bn" || value === "en";
}

export function isAiReferralStatus(value: unknown): value is CareReferralStatus {
  return typeof value === "string" && AI_REFERRAL_STATUSES.includes(value as CareReferralStatus);
}

export function isAiFollowUpAction(value: unknown): value is FollowUpAction {
  return typeof value === "string" && FOLLOW_UP_ACTIONS.includes(value as FollowUpAction);
}

export function normalizeAiFreeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 3 || normalized.length > AI_FREE_TEXT_MAX_LENGTH) return null;
  return normalized;
}

const unsafeMedicalClaims = [
  /\byou (?:definitely )?have tb\b/i,
  /\byou (?:definitely )?do not have tb\b/i,
  /\btb (?:is )?confirmed\b/i,
  /\b(?:chance|probability|risk) of tb\b/i,
  /আপনার যক্ষ্মা হয়েছে/u,
  /আপনার যক্ষ্মা নেই/u,
  /যক্ষ্মা নিশ্চিত/u,
  /যক্ষ্মার সম্ভাবনা\s*\d/u,
];

export function isSafeAiExplanation(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized.length >= 3
    && normalized.length <= 500
    && !unsafeMedicalClaims.some((pattern) => pattern.test(normalized));
}

export function parseAiCompanionOutput(
  action: AiCompanionAction,
  value: unknown,
): AiCompanionResponse | null {
  if (!value || typeof value !== "object") return null;
  const output = value as Record<string, unknown>;
  if (!isSafeAiExplanation(output.explanationBn)
    || !isSafeAiExplanation(output.explanationEn)) return null;

  const explanation = {
    bn: output.explanationBn.trim(),
    en: output.explanationEn.trim(),
  };

  if (action === "CLASSIFY_BARRIER") {
    if (typeof output.barrier !== "string"
      || !FOLLOW_UP_BARRIERS.includes(output.barrier as FollowUpBarrier)) return null;
    return { action, barrier: output.barrier as FollowUpBarrier, explanation };
  }

  return { action, explanation };
}

async function requestAiCompanion(body: Record<string, unknown>): Promise<AiCompanionResponse> {
  const response = await fetch("/api/companion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as {
    result?: AiCompanionResponse;
    error?: string;
  } | null;
  if (!response.ok || !payload?.result) {
    throw new Error(payload?.error ?? "AI_COMPANION_FAILED");
  }
  return payload.result;
}

export async function classifyFollowUpBarrier(text: string, language: "bn" | "en") {
  const result = await requestAiCompanion({ action: "CLASSIFY_BARRIER", text, language });
  if (result.action !== "CLASSIFY_BARRIER") throw new Error("AI_RESPONSE_INVALID");
  return result;
}

export async function explainCareNextStep(input: {
  language: "bn" | "en";
  safetyOutcome: "FORMAL_TB_EVALUATION_RECOMMENDED";
  referralStatus: CareReferralStatus;
  nextAction: FollowUpAction | null;
  hasCentre: boolean;
}) {
  const result = await requestAiCompanion({ action: "EXPLAIN_NEXT_STEP", ...input });
  if (result.action !== "EXPLAIN_NEXT_STEP") throw new Error("AI_RESPONSE_INVALID");
  return result;
}
