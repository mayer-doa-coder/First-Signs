import assert from "node:assert/strict";
import test from "node:test";
import { medicines } from "../lib/medicines.ts";

test("medicine corner has at least 100 unique generic medicine entries", () => {
  assert.ok(medicines.length >= 100);
  assert.equal(new Set(medicines.map((medicine) => medicine.id)).size, medicines.length);
});

test("every medicine has bilingual safety information and a verified-source link", () => {
  for (const medicine of medicines) {
    assert.ok(medicine.genericName.en && medicine.genericName.bn);
    assert.ok(medicine.purpose.en && medicine.purpose.bn);
    assert.ok(medicine.commonWarnings.length && medicine.urgentWarnings.length);
    assert.match(medicine.sourceUrl, /^https:\/\/(dailymed\.nlm\.nih\.gov|www\.who\.int)\//);
  }
});
