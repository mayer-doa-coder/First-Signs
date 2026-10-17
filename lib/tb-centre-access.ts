import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function configuredPin() {
  const pin = process.env.TB_CENTRE_STAFF_PIN?.trim();
  return pin || null;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isTbCentreAccessConfigured() {
  return configuredPin() !== null;
}

export function verifyTbCentreStaffPin(value: string | null) {
  const expected = configuredPin();
  if (!expected || !value) return false;
  return timingSafeEqual(digest(expected), digest(value.trim()));
}
