import { NextResponse } from "next/server";
import { processChannelAudio } from "@/lib/channel-audio";
import { analyzeWithHear } from "@/lib/hear-audio";

export const runtime = "nodejs";

const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders });
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
    const analysis = await analyzeWithHear(bytes, validated.mimeType);
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
