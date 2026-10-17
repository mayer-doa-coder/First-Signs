import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeAiExplanation,
  normalizeAiFreeText,
  parseAiCompanionOutput,
} from "../lib/ai-companion.ts";

test("normalizes a short free-text barrier without retaining extra whitespace", () => {
  assert.equal(normalizeAiFreeText("  অফিস থেকে   ছুটি পাইনি  "), "অফিস থেকে ছুটি পাইনি");
});

test("rejects missing, too-short, and oversized free text", () => {
  assert.equal(normalizeAiFreeText(null), null);
  assert.equal(normalizeAiFreeText("no"), null);
  assert.equal(normalizeAiFreeText("x".repeat(301)), null);
});

test("accepts only a documented barrier category", () => {
  const valid = parseAiCompanionOutput("CLASSIFY_BARRIER", {
    barrier: "WORK_SCHEDULE",
    explanationBn: "কাজের সময়ের কারণে যাওয়া কঠিন হয়েছে।",
    explanationEn: "Work made attendance difficult.",
  });
  assert.equal(valid?.action, "CLASSIFY_BARRIER");
  assert.equal(valid?.action === "CLASSIFY_BARRIER" ? valid.barrier : null, "WORK_SCHEDULE");

  assert.equal(parseAiCompanionOutput("CLASSIFY_BARRIER", {
    barrier: "POSITIVE_TB_RESULT",
    explanationBn: "একটি ভুল বিভাগ।",
    explanationEn: "An invalid category.",
  }), null);
});

test("rejects diagnostic and probability claims from generated text", () => {
  assert.equal(isSafeAiExplanation("You have TB."), false);
  assert.equal(isSafeAiExplanation("Your chance of TB is high."), false);
  assert.equal(isSafeAiExplanation("আপনার যক্ষ্মা হয়েছে।"), false);
  assert.equal(parseAiCompanionOutput("EXPLAIN_NEXT_STEP", {
    explanationBn: "আপনার যক্ষ্মা নিশ্চিত।",
    explanationEn: "TB is confirmed.",
  }), null);
});

test("allows a non-diagnostic next-step explanation", () => {
  const result = parseAiCompanionOutput("EXPLAIN_NEXT_STEP", {
    explanationBn: "রেফারেল কিউআরটি সঙ্গে নিয়ে নির্ধারিত সেবাকেন্দ্রে যান।",
    explanationEn: "Take the referral QR to the intended TB centre.",
  });
  assert.deepEqual(result, {
    action: "EXPLAIN_NEXT_STEP",
    explanation: {
      bn: "রেফারেল কিউআরটি সঙ্গে নিয়ে নির্ধারিত সেবাকেন্দ্রে যান।",
      en: "Take the referral QR to the intended TB centre.",
    },
  });
});
