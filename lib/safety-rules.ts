/**
 * Fixed symptom-safety rules for the Step 21 prototype.
 *
 * Product specification: PRD.md, section 14.
 * Evidence basis:
 * - Bangladesh NTP National Guideline and Operational Manual for Tuberculosis,
 *   sixth edition (2021), sections 3.3, 11.2, and 20.14.
 * - WHO TB Knowledge Sharing Platform, "3.1.1 Symptom screening".
 *
 * This module is deterministic and must remain independent of AI prompts and
 * experimental cough-audio processing.
 */

export const SAFETY_RULE_VERSION = "BD-NTP-WHO-SYMPTOM-V1" as const;

export const SAFETY_OUTCOMES = {
  CONTINUE: "CONTINUE_SCREENING",
  FORMAL_EVALUATION: "FORMAL_TB_EVALUATION_RECOMMENDED",
  URGENT_EVALUATION: "URGENT_MEDICAL_EVALUATION",
} as const;

export type SafetyOutcome = (typeof SAFETY_OUTCOMES)[keyof typeof SAFETY_OUTCOMES];

export type SafetyRuleAnswers = {
  coughDays: number;
  fever: boolean;
  nightSweats: boolean;
  weightLoss: boolean;
  bloodInSputum: boolean;
  tbExposure: boolean;
};

const FORMAL_EVALUATION_COUGH_DAYS = 14;

function assertValidAnswers(answers: SafetyRuleAnswers) {
  if (!Number.isSafeInteger(answers.coughDays) || answers.coughDays < 0) {
    throw new RangeError("coughDays must be a non-negative whole number");
  }

  const booleanAnswers = [
    answers.fever,
    answers.nightSweats,
    answers.weightLoss,
    answers.bloodInSputum,
    answers.tbExposure,
  ];

  if (booleanAnswers.some((answer) => typeof answer !== "boolean")) {
    throw new TypeError("Symptom and exposure answers must be boolean values");
  }
}

export function evaluateSafetyRules(answers: SafetyRuleAnswers): SafetyOutcome {
  assertValidAnswers(answers);

  // Urgent red flags always take precedence over TB referral criteria.
  if (answers.bloodInSputum) {
    return SAFETY_OUTCOMES.URGENT_EVALUATION;
  }

  if (
    answers.coughDays >= FORMAL_EVALUATION_COUGH_DAYS ||
    answers.fever ||
    answers.nightSweats ||
    answers.weightLoss ||
    answers.tbExposure
  ) {
    return SAFETY_OUTCOMES.FORMAL_EVALUATION;
  }

  return SAFETY_OUTCOMES.CONTINUE;
}
