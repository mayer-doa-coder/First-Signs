import { NextResponse } from "next/server";
import { broadAreas } from "@/lib/broad-areas";
import { CARE_OUTCOMES, isAgeBand, isPathwayId } from "@/lib/care-pathways";
import type { CareSignalInput } from "@/lib/care-signals";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

const SIGNAL_ID_PATTERN = /^JVH-SIG-[A-F0-9]{32}$/;
const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function parseInput(value: unknown): CareSignalInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<CareSignalInput>;
  if (!SIGNAL_ID_PATTERN.test(input.signalId ?? "")
    || !isPathwayId(input.pathwayId)
    || !isAgeBand(input.ageBand)
    || !Object.values(CARE_OUTCOMES).includes(input.careOutcome as never)
    || (input.sourceType !== "SELF" && input.sourceType !== "PHARMACY")
    || !broadAreas.some((area) => area.id === input.areaName)) return null;
  return input as CareSignalInput;
}

export async function POST(request: Request) {
  let input: CareSignalInput | null;
  try {
    input = parseInput(await request.json());
  } catch {
    input = null;
  }
  if (!input) return NextResponse.json({ error: "INVALID_CARE_SIGNAL" }, { status: 400, headers: responseHeaders });
  if (!isReferralDatabaseConfigured()) return NextResponse.json({ error: "SIGNAL_BACKEND_NOT_CONFIGURED" }, { status: 503, headers: responseHeaders });

  try {
    await callReferralRpc("save_care_signal", {
      p_signal_id: input.signalId,
      p_pathway_id: input.pathwayId,
      p_age_band: input.ageBand,
      p_care_outcome: input.careOutcome,
      p_source_type: input.sourceType,
      p_area_name: input.areaName,
    });
    return NextResponse.json({ accepted: true }, { status: 201, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "CARE_SIGNAL_SAVE_FAILED" }, { status: 502, headers: responseHeaders });
  }
}
