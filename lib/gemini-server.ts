import "server-only";
import {
  parseAiCompanionOutput,
  type AiCompanionAction,
  type AiCompanionResponse,
} from "@/lib/ai-companion";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 12_000;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{2,80}$/;

type GeminiRequest = {
  action: AiCompanionAction;
  prompt: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

const outputSchema = {
  type: "object",
  properties: {
    barrier: {
      type: "string",
      enum: [
        "WORK_SCHEDULE",
        "CENTRE_TOO_FAR",
        "FEAR",
        "STIGMA",
        "TRANSPORT_PROBLEM",
        "DID_NOT_UNDERSTAND",
        "OTHER",
      ],
    },
    explanationBn: { type: "string" },
    explanationEn: { type: "string" },
  },
  required: ["barrier", "explanationBn", "explanationEn"],
};

function configuredModel() {
  const configured = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return MODEL_PATTERN.test(configured) ? configured : DEFAULT_GEMINI_MODEL;
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function responseText(payload: GeminiResponse) {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim() ?? "";
}

async function parsedGeminiResult(response: Response, action: AiCompanionAction) {
  let payload: GeminiResponse;
  try {
    payload = await response.json() as GeminiResponse;
  } catch {
    return null;
  }
  const text = responseText(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parseAiCompanionOutput(action, parsed);
}

export async function requestGeminiCompanion({ action, prompt }: GeminiRequest): Promise<AiCompanionResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const schema = action === "CLASSIFY_BARRIER"
    ? outputSchema
    : {
        ...outputSchema,
        properties: {
          explanationBn: outputSchema.properties.explanationBn,
          explanationEn: outputSchema.properties.explanationEn,
        },
        required: ["explanationBn", "explanationEn"],
      };
  const requestBody = JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "You are a limited TB care-navigation language helper for Bangladesh. Never diagnose TB, estimate TB probability, change a screening outcome, weaken urgent advice, or invent services. Classify only into the supplied categories and explain only the already-approved next action. Use clear, respectful Bangla and English. Do not repeat names, phone numbers, referral IDs, or other identifiers.",
        }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 320,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
  });

  const requestModel = async (model: string) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  };

  const model = configuredModel();
  let response: Response;
  try {
    response = await requestModel(model);
  } catch {
    if (model === FALLBACK_GEMINI_MODEL) throw new Error("AI_PROVIDER_FAILED");
    try {
      response = await requestModel(FALLBACK_GEMINI_MODEL);
    } catch {
      throw new Error("AI_PROVIDER_FAILED");
    }
  }

  if (response.ok) {
    const result = await parsedGeminiResult(response, action);
    if (result) return result;
    if (model === FALLBACK_GEMINI_MODEL) throw new Error("AI_RESPONSE_INVALID");
  } else {
    if (response.status === 429) throw new Error("AI_RATE_LIMITED");
    if (response.status !== 404 && response.status < 500) throw new Error("AI_PROVIDER_FAILED");
    if (model === FALLBACK_GEMINI_MODEL) throw new Error("AI_PROVIDER_FAILED");
  }

  try {
    response = await requestModel(FALLBACK_GEMINI_MODEL);
  } catch {
    throw new Error("AI_PROVIDER_FAILED");
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("AI_RATE_LIMITED");
    throw new Error("AI_PROVIDER_FAILED");
  }
  const result = await parsedGeminiResult(response, action);
  if (!result) throw new Error("AI_RESPONSE_INVALID");
  return result;
}
