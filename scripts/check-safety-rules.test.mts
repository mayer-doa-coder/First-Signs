import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSafetyRules,
  SAFETY_OUTCOMES,
  type SafetyRuleAnswers,
} from "../lib/safety-rules.ts";

const noCriteria: SafetyRuleAnswers = {
  coughDays: 0,
  fever: false,
  nightSweats: false,
  weightLoss: false,
  bloodInSputum: false,
  tbExposure: false,
};

test("continues when no fixed criterion is present", () => {
  assert.equal(evaluateSafetyRules(noCriteria), SAFETY_OUTCOMES.CONTINUE);
  assert.equal(
    evaluateSafetyRules({ ...noCriteria, coughDays: 13 }),
    SAFETY_OUTCOMES.CONTINUE,
  );
});

test("recommends formal evaluation at the 14-day cough boundary", () => {
  assert.equal(
    evaluateSafetyRules({ ...noCriteria, coughDays: 14 }),
    SAFETY_OUTCOMES.FORMAL_EVALUATION,
  );
});

for (const criterion of ["fever", "nightSweats", "weightLoss", "tbExposure"] as const) {
  test(`recommends formal evaluation for ${criterion}`, () => {
    assert.equal(
      evaluateSafetyRules({ ...noCriteria, [criterion]: true }),
      SAFETY_OUTCOMES.FORMAL_EVALUATION,
    );
  });
}

test("gives blood in sputum urgent precedence over every other criterion", () => {
  assert.equal(
    evaluateSafetyRules({
      coughDays: 30,
      fever: true,
      nightSweats: true,
      weightLoss: true,
      bloodInSputum: true,
      tbExposure: true,
    }),
    SAFETY_OUTCOMES.URGENT_EVALUATION,
  );
});

test("rejects invalid cough durations instead of producing a safety outcome", () => {
  for (const coughDays of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => evaluateSafetyRules({ ...noCriteria, coughDays }), RangeError);
  }
});

test("rejects malformed symptom values", () => {
  assert.throws(
    () => evaluateSafetyRules({ ...noCriteria, fever: "yes" as unknown as boolean }),
    TypeError,
  );
});
