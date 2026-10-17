import "server-only";

export const HEAR_SIGNAL_CODES = [
  "COUGH_LIKE_SIGNAL_PRESENT",
  "NO_COUGH_LIKE_SIGNAL_DETECTED",
  "INCONCLUSIVE",
] as const;

export type HearSignalCode = (typeof HEAR_SIGNAL_CODES)[number];

export type HearAnalysis = {
  available: true;
  model: "GOOGLE_HEAR";
  modelVersion: string;
  classifierVersion: string;
  embeddingCreated: true;
  coughDetected: boolean;
  signal: HearSignalCode;
};

export type HearUnavailable = {
  available: false;
  reason: "NOT_CONFIGURED" | "INVALID_RESPONSE" | "PROCESSING_FAILED" | "TIMEOUT";
};

export type HearResult = HearAnalysis | HearUnavailable;

const REQUEST_TIMEOUT_MS = 45_000;

function isHearAnalysis(value: unknown): value is HearAnalysis {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<HearAnalysis>;
  return result.available === true
    && result.model === "GOOGLE_HEAR"
    && typeof result.modelVersion === "string"
    && result.modelVersion.length > 0
    && typeof result.classifierVersion === "string"
    && result.classifierVersion.length > 0
    && result.embeddingCreated === true
    && typeof result.coughDetected === "boolean"
    && HEAR_SIGNAL_CODES.includes(result.signal as HearSignalCode);
}

/**
 * Sends transient audio to the separately hosted HeAR inference service.
 * Neither raw audio nor the 512-value embedding is returned or persisted.
 */
export async function analyzeWithHear(
  bytes: Uint8Array,
  mimeType: string,
): Promise<HearResult> {
  const serviceUrl = process.env.HEAR_SERVICE_URL?.trim();
  const serviceToken = process.env.HEAR_SERVICE_TOKEN?.trim();
  if (!serviceUrl || !serviceToken) return { available: false, reason: "NOT_CONFIGURED" };

  let endpoint: URL;
  try {
    endpoint = new URL("/analyze", serviceUrl);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      return { available: false, reason: "NOT_CONFIGURED" };
    }
  } catch {
    return { available: false, reason: "NOT_CONFIGURED" };
  }

  const body = new FormData();
  const audioBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(audioBuffer).set(bytes);
  body.set("audio", new Blob([audioBuffer], { type: mimeType }), "cough-audio");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${serviceToken}` },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { available: false, reason: "PROCESSING_FAILED" };
    const result: unknown = await response.json();
    return isHearAnalysis(result)
      ? result
      : { available: false, reason: "INVALID_RESPONSE" };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof DOMException && error.name === "AbortError"
        ? "TIMEOUT"
        : "PROCESSING_FAILED",
    };
  } finally {
    clearTimeout(timeout);
  }
}
