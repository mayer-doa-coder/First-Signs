import type { AgeBand, CareOutcome, PathwayId } from "@/lib/care-pathways";

export type CareSignalInput = {
  signalId: string;
  pathwayId: PathwayId;
  ageBand: AgeBand;
  careOutcome: CareOutcome;
  sourceType: "SELF" | "PHARMACY";
  areaName: string;
};

export function createCareSignalId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `JVH-SIG-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export async function submitCareSignal(input: CareSignalInput) {
  const response = await fetch("/api/signals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("CARE_SIGNAL_SAVE_FAILED");
}
