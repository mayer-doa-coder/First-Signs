import { NextResponse } from "next/server";
import {
  COMMUNITY_FEEDBACK_CATEGORIES,
  isCommunityFeedbackCategory,
  type CommunityFeedbackCategory,
  type CommunitySummary,
} from "@/lib/community";
import { callSupabaseRpc } from "@/lib/supabase-server";

export const runtime = "nodejs";

type SummaryRow = {
  created?: boolean;
  total_responses: number | string;
  work_count: number | string;
  distance_count: number | string;
  fear_count: number | string;
  stigma_count: number | string;
  lack_of_information_count: number | string;
  transport_count: number | string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

function safeCount(value: number | string) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("INVALID_COMMUNITY_SUMMARY");
  return count;
}

function summaryFrom(row: SummaryRow): CommunitySummary {
  const databaseCounts: Record<CommunityFeedbackCategory, number | string> = {
    WORK: row.work_count,
    DISTANCE: row.distance_count,
    FEAR: row.fear_count,
    STIGMA: row.stigma_count,
    LACK_OF_INFORMATION: row.lack_of_information_count,
    TRANSPORT: row.transport_count,
  };
  const counts = Object.fromEntries(
    COMMUNITY_FEEDBACK_CATEGORIES.map((category) => [category, safeCount(databaseCounts[category])]),
  ) as Record<CommunityFeedbackCategory, number>;
  const totalResponses = safeCount(row.total_responses);
  if (Object.values(counts).reduce((total, count) => total + count, 0) !== totalResponses) {
    throw new Error("INCONSISTENT_COMMUNITY_SUMMARY");
  }
  return { totalResponses, counts };
}

export async function GET() {
  try {
    const rows = await callSupabaseRpc<SummaryRow[]>("get_part18_community_summary", {});
    if (rows.length !== 1) throw new Error("INVALID_COMMUNITY_SUMMARY");
    return json({ summary: summaryFrom(rows[0]) });
  } catch {
    return json({ error: "COMMUNITY_SUMMARY_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => key !== "submissionId" && key !== "category")
    || typeof input.submissionId !== "string"
    || !UUID_PATTERN.test(input.submissionId)
    || !isCommunityFeedbackCategory(input.category)
  ) {
    return json({ error: "INVALID_FEEDBACK" }, 400);
  }

  try {
    const rows = await callSupabaseRpc<SummaryRow[]>("submit_part18_community_feedback", {
      p_submission_id: input.submissionId,
      p_category: input.category,
    });
    if (rows.length !== 1 || typeof rows[0].created !== "boolean") {
      throw new Error("INVALID_COMMUNITY_SUBMISSION");
    }
    return json(
      { created: rows[0].created, summary: summaryFrom(rows[0]) },
      rows[0].created ? 201 : 200,
    );
  } catch {
    return json({ error: "COMMUNITY_SUBMISSION_UNAVAILABLE" }, 503);
  }
}
