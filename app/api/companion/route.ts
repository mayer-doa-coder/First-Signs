import { NextResponse } from "next/server";
import {
  isAiFollowUpAction,
  isAiLanguage,
  isAiReferralStatus,
  normalizeAiFreeText,
} from "@/lib/ai-companion";
import { isGeminiConfigured, requestGeminiCompanion } from "@/lib/gemini-server";

export const runtime = "nodejs";

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

const nextActionContext = {
  PLAN_SUITABLE_TIME: "Plan a practical day and time and ask the centre or a trusted helper about coordination.",
  SHOW_ANOTHER_CENTRE: "Review another nearby verified centre; the existing referral centre must be changed with help before using it elsewhere.",
  EXPLAIN_EVALUATION: "Explain that referral is not a diagnosis; trained staff review symptoms and choose appropriate tests.",
  PRIVACY_AND_SUPPORT: "Protect the referral QR, consider a trusted companion, and ask for human support if needed.",
  SEEK_TRANSPORT_SUPPORT: "Review nearby verified centres and ask a trusted person or support worker for travel help; this service provides no fare or transport.",
  EXPLAIN_WHY_EVALUATION_MATTERS: "Explain that screening does not diagnose illness and formal evaluation helps identify the cause and appropriate care.",
  HUMAN_SUPPORT: "The service records the reason for human support but does not automatically notify a support team.",
} as const;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return errorResponse("INVALID_AI_REQUEST", 400);
    }
    body = value as Record<string, unknown>;
  } catch {
    return errorResponse("INVALID_AI_REQUEST", 400);
  }

  if (!isAiLanguage(body.language)) return errorResponse("INVALID_AI_REQUEST", 400);

  if (body.action === "CLASSIFY_BARRIER") {
    const text = normalizeAiFreeText(body.text);
    if (!text) return errorResponse("INVALID_AI_FREE_TEXT", 400);
    if (!isGeminiConfigured()) return errorResponse("AI_NOT_CONFIGURED", 503);
    const prompt = [
      "Classify the person's reason for missing a formal TB evaluation.",
      "Allowed barrier values: WORK_SCHEDULE, CENTRE_TOO_FAR, FEAR, STIGMA, TRANSPORT_PROBLEM, DID_NOT_UNDERSTAND, OTHER.",
      "Return the closest single category. If uncertain, return OTHER.",
      "Write one short, non-judgmental explanation in Bangla and one in English. Do not give a diagnosis.",
      `The interface language is ${body.language === "bn" ? "Bangla" : "English"}.`,
      `Person's answer: ${JSON.stringify(text)}`,
    ].join("\n");

    try {
      const result = await requestGeminiCompanion({ action: "CLASSIFY_BARRIER", prompt });
      return NextResponse.json({ result }, { headers: responseHeaders });
    } catch (error) {
      const code = error instanceof Error ? error.message : "AI_PROVIDER_FAILED";
      return errorResponse(code, code === "AI_RATE_LIMITED" ? 429 : 502);
    }
  }

  if (body.action === "EXPLAIN_NEXT_STEP") {
    // AI explanations are deliberately limited to the already-fixed formal
    // evaluation pathway. Urgent and non-referral guidance stays fully static.
    if (body.safetyOutcome !== "FORMAL_TB_EVALUATION_RECOMMENDED"
      || !isAiReferralStatus(body.referralStatus)
      || typeof body.hasCentre !== "boolean"
      || (body.nextAction !== null && !isAiFollowUpAction(body.nextAction))) {
      return errorResponse("AI_SAFETY_BOUNDARY", 400);
    }
    if (!isGeminiConfigured()) return errorResponse("AI_NOT_CONFIGURED", 503);

    const approvedAction = body.nextAction
      ? nextActionContext[body.nextAction]
      : body.referralStatus === "COMPLETED"
        ? "Follow the TB centre's next instructions. Attendance confirmation is not a diagnosis or test result."
        : body.referralStatus === "PENDING"
          ? "Take the referral QR to the intended TB centre for formal evaluation."
          : body.referralStatus === "FOLLOW_UP_NEEDED"
            ? "Ask what prevented attendance, then use the fixed barrier-to-action guidance."
            : body.hasCentre
              ? "Continue to referral if the person chooses. The decision remains theirs."
              : "Choose a nearby verified TB centre, then decide whether to continue to referral.";

    const prompt = [
      "Explain only the approved care-navigation action below in simple Bangla and English.",
      "The fixed screening outcome remains FORMAL_TB_EVALUATION_RECOMMENDED and must not be changed or reinterpreted.",
      "Do not diagnose TB, estimate probability, invent opening hours, promise transport, or claim that attendance proves disease.",
      `Approved action: ${approvedAction}`,
    ].join("\n");

    try {
      const result = await requestGeminiCompanion({ action: "EXPLAIN_NEXT_STEP", prompt });
      return NextResponse.json({ result }, { headers: responseHeaders });
    } catch (error) {
      const code = error instanceof Error ? error.message : "AI_PROVIDER_FAILED";
      return errorResponse(code, code === "AI_RATE_LIMITED" ? 429 : 502);
    }
  }

  return errorResponse("INVALID_AI_REQUEST", 400);
}
