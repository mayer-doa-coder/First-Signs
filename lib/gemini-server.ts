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

export type HealthAssistantAiResponse = { answerBn: string; answerEn: string };
export type HealthAssistantAttachment = { mimeType: string; base64: string };

export async function requestGeminiHealthAssistant(prompt: string, attachments: HealthAssistantAttachment[] = []): Promise<HealthAssistantAiResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  const request = async (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: "You are First Signs, a cautious bilingual health-education companion for Bangladesh. Support the approved respiratory/TB, fever or mosquito-borne, diarrhoea/dehydration, skin or nerve, and child-breathing pathways only when supplied sources support the answer. Use only supplied sources and activity context. Never diagnose illness, prescribe, recommend doses, start or stop medicines, calculate probability, or replace urgent instructions. Images and audio are supporting context only: do not identify medicine, confirm a condition, or make a personal clinical conclusion from them. If sources or media are insufficient, say clearly that you do not know. For personal medicine questions, advise a clinician or pharmacist. Do not repeat identifiers. Return concise Bangla and English answers." }] }, contents: [{ role: "user", parts: [{ text: prompt }, ...attachments.map((attachment) => ({ inlineData: { mimeType: attachment.mimeType, data: attachment.base64 } }))] }], generationConfig: { temperature: 0.05, maxOutputTokens: 700, responseMimeType: "application/json", responseSchema: { type: "object", properties: { answerBn: { type: "string" }, answerEn: { type: "string" } }, required: ["answerBn", "answerEn"] } } }),
  });
  for (const model of [configuredModel(), FALLBACK_GEMINI_MODEL]) {
    try {
      const response = await request(model); if (!response.ok) continue;
      const payload = await response.json() as GeminiResponse; const text = responseText(payload); const output = JSON.parse(text) as Record<string, unknown>;
      if (typeof output.answerBn === "string" && typeof output.answerEn === "string" && output.answerBn.length >= 3 && output.answerBn.length <= 700 && output.answerEn.length >= 3 && output.answerEn.length <= 700 && !/আপনার যক্ষ্মা হয়েছে|আপনার যক্ষ্মা নেই/u.test(output.answerBn) && !/you (?:definitely )?(?:have|do not have) tb|tb probability/i.test(output.answerEn)) return { answerBn: output.answerBn.trim(), answerEn: output.answerEn.trim() };
    } catch { /* try the safe fallback model */ }
  }
  throw new Error("AI_PROVIDER_FAILED");
}

export async function requestGeminiTranscription(attachment: HealthAssistantAttachment, language: "bn" | "en") {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  for (const model of [configuredModel(), FALLBACK_GEMINI_MODEL]) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Transcribe only the audible spoken words. Do not infer, answer, summarize, translate, diagnose, identify a medicine, or add information. If speech is unclear or absent, return exactly: [inaudible]." }] },
          contents: [{ role: "user", parts: [{ text: language === "bn" ? "এই অডিওর হুবহু লেখা দিন।" : "Provide an exact transcript of this audio." }, { inlineData: { mimeType: attachment.mimeType, data: attachment.base64 } }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 500 },
        }),
      });
      if (!response.ok) continue;
      const transcript = responseText(await response.json() as GeminiResponse).replace(/\s+/g, " ").trim();
      if (transcript && transcript.length <= 600) return transcript;
    } catch { /* Try the fallback model. */ }
  }
  throw new Error("AI_TRANSCRIPTION_FAILED");
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
