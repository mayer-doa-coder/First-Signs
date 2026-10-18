import assert from "node:assert/strict";
import test from "node:test";
import { CARE_OUTCOMES, evaluateCarePathway, getPathway, type PathwayAnswers, type PathwayId } from "../lib/care-pathways.ts";

function blank(pathwayId: PathwayId): PathwayAnswers {
  const pathway = getPathway(pathwayId);
  return Object.fromEntries([
    ...(pathway.requiresCoughDays ? [["coughDays", 0]] : []),
    ...pathway.questions.map((question) => [question.id, false]),
  ]);
}

const cases: Array<{ pathwayId: PathwayId; referralKey: string; urgentKey: string }> = [
  { pathwayId: "RESPIRATORY_TB", referralKey: "fever", urgentKey: "bloodInSputum" },
  { pathwayId: "FEVER_MOSQUITO", referralKey: "currentFever", urgentKey: "bleeding" },
  { pathwayId: "DIARRHOEA_DEHYDRATION", referralKey: "frequentLooseStool", urgentKey: "unableToDrink" },
  { pathwayId: "SKIN_NERVE_LEPROSY", referralKey: "numbPatch", urgentKey: "eyeProblem" },
  { pathwayId: "CHILD_BREATHING", referralKey: "coughOrDifficultBreathing", urgentKey: "blueLips" },
];

for (const item of cases) {
  test(`${item.pathwayId}: normal, referral, and urgent outcomes`, () => {
    const normal = blank(item.pathwayId);
    assert.equal(evaluateCarePathway(item.pathwayId, "AGE_5_TO_17", normal), CARE_OUTCOMES.CONTINUE);
    assert.equal(evaluateCarePathway(item.pathwayId, "AGE_5_TO_17", { ...normal, [item.referralKey]: true }), CARE_OUTCOMES.EVALUATION);
    assert.equal(evaluateCarePathway(item.pathwayId, "AGE_5_TO_17", { ...normal, [item.referralKey]: true, [item.urgentKey]: true }), CARE_OUTCOMES.URGENT);
  });
}

test("adult child-breathing selection routes to general evaluation without a pneumonia result", () => {
  const answers = { ...blank("CHILD_BREATHING"), coughOrDifficultBreathing: true };
  assert.equal(evaluateCarePathway("CHILD_BREATHING", "ADULT", answers), CARE_OUTCOMES.EVALUATION);
});
