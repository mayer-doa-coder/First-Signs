import { NextResponse } from "next/server";
import {
  isFollowUpAction,
  isFollowUpBarrier,
  isReferralStatus,
  type FollowUpStatus,
  type FollowUpView,
} from "@/lib/follow-ups";
import { REFERRAL_ID_PATTERN, REFERRAL_TOKEN_PATTERN } from "@/lib/referrals";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type FollowUpRpcRow = {
  referral_id: unknown;
  referral_status: unknown;
  followup_status: unknown;
  barrier: unknown;
  next_action: unknown;
  created_at: unknown;
};

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

function accessTokenFrom(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim().toLowerCase() ?? "";
  return REFERRAL_TOKEN_PATTERN.test(token) ? token : null;
}

function toFollowUpView(row: FollowUpRpcRow): FollowUpView | null {
  const referralId = String(row.referral_id ?? "");
  const referralStatus = row.referral_status;
  const status = row.followup_status === null ? null : String(row.followup_status) as FollowUpStatus;
  const barrier = row.barrier === null ? null : row.barrier;
  const nextAction = row.next_action === null ? null : row.next_action;
  const createdAt = row.created_at === null ? null : String(row.created_at);

  if (!REFERRAL_ID_PATTERN.test(referralId)
    || !isReferralStatus(referralStatus)
    || (status !== null && status !== "AWAITING_BARRIER" && status !== "ACTION_READY")
    || (barrier !== null && !isFollowUpBarrier(barrier))
    || (nextAction !== null && !isFollowUpAction(nextAction))
    || (createdAt !== null && Number.isNaN(Date.parse(createdAt)))) return null;

  if (status === null && (barrier !== null || nextAction !== null || createdAt !== null)) return null;
  if (status === "AWAITING_BARRIER" && (barrier !== null || nextAction !== null || createdAt === null)) return null;
  if (status === "ACTION_READY" && (barrier === null || nextAction === null || createdAt === null)) return null;

  return {
    referralId,
    referralStatus,
    status,
    barrier,
    nextAction,
    createdAt,
  };
}

async function callFollowUpRpc(functionName: "get_part12_follow_up" | "simulate_part12_follow_up", token: string) {
  const rows = await callReferralRpc<FollowUpRpcRow>(functionName, { p_access_token: token });
  return rows[0] ? toFollowUpView(rows[0]) : null;
}

export async function GET(request: Request) {
  const token = accessTokenFrom(request);
  if (!token) return errorResponse("INVALID_REFERRAL_TOKEN", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  try {
    const followUp = await callFollowUpRpc("get_part12_follow_up", token);
    if (!followUp) return errorResponse("REFERRAL_NOT_FOUND", 404);
    return NextResponse.json({ followUp }, { headers: responseHeaders });
  } catch {
    return errorResponse("FOLLOW_UP_FETCH_FAILED", 502);
  }
}

export async function POST(request: Request) {
  const token = accessTokenFrom(request);
  if (!token) return errorResponse("INVALID_REFERRAL_TOKEN", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  try {
    const followUp = await callFollowUpRpc("simulate_part12_follow_up", token);
    if (!followUp) return errorResponse("REFERRAL_NOT_FOUND", 404);
    return NextResponse.json({ followUp }, { headers: responseHeaders });
  } catch {
    return errorResponse("REFERRAL_NOT_PENDING", 409);
  }
}

export async function PATCH(request: Request) {
  const token = accessTokenFrom(request);
  if (!token) return errorResponse("INVALID_REFERRAL_TOKEN", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  let barrier: unknown;
  try {
    const body: unknown = await request.json();
    barrier = body && typeof body === "object" ? (body as Record<string, unknown>).barrier : null;
  } catch {
    return errorResponse("INVALID_FOLLOW_UP_BARRIER", 400);
  }
  if (!isFollowUpBarrier(barrier)) return errorResponse("INVALID_FOLLOW_UP_BARRIER", 400);

  try {
    const rows = await callReferralRpc<FollowUpRpcRow>("save_part12_follow_up_barrier", {
      p_access_token: token,
      p_barrier: barrier,
    });
    const followUp = rows[0] ? toFollowUpView(rows[0]) : null;
    if (!followUp) return errorResponse("REFERRAL_NOT_FOUND", 404);
    return NextResponse.json({ followUp }, { headers: responseHeaders });
  } catch {
    return errorResponse("FOLLOW_UP_BARRIER_SAVE_FAILED", 409);
  }
}
