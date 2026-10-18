import { NextResponse } from "next/server";
import { processChannelAudio } from "@/lib/channel-audio";
import { analyzeWithHear, type HearTriageInputs } from "@/lib/hear-audio";

export const runtime = "nodejs";

const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

function parseTriageInputs(value: FormDataEntryValue | null): HearTriageInputs | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const input: unknown = JSON.parse(value);
    if (!input || typeof input !== "object") return undefined;
    const record = input as Record<string, unknown>;
    const flags = ["fever", "nightSweats", "weightLoss", "bloodInSputum"] as const;
    if (typeof record.coughDays !== "number" || !Number.isFinite(record.coughDays) || record.coughDays < 0 || record.coughDays > 3650 || !flags.every((key) => typeof record[key] === "boolean")) return undefined;
    return { coughDays: record.coughDays, fever: record.fever as boolean, nightSweats: record.nightSweats as boolean, weightLoss: record.weightLoss as boolean, bloodInSputum: record.bloodInSputum as boolean };
  } catch { return undefined; }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return response({ error: "INVALID_AUDIO_REQUEST" }, 400);
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) return response({ error: "AUDIO_REQUIRED" }, 400);

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const validated = await processChannelAudio(bytes, audio.type);
    const analysis = await analyzeWithHear(bytes, validated.mimeType, parseTriageInputs(form.get("triageInputs")));
    return response(analysis);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_AUDIO_FILE";
    const known = new Set([
      "UNSUPPORTED_AUDIO_TYPE",
      "AUDIO_TOO_SHORT",
      "AUDIO_TOO_LARGE",
      "INVALID_AUDIO_FILE",
    ]);
    return response({ error: known.has(code) ? code : "AUDIO_PROCESSING_FAILED" }, 400);
  }
}
