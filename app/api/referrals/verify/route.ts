import { NextResponse } from "next/server";
import {
  REFERRAL_ID_PATTERN,
  REFERRAL_STATUSES,
  REFERRAL_TOKEN_PATTERN,
  type ReferralLookup,
  type VerificationReferralView,
} from "@/lib/referrals";
import { callReferralRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";
import { getTbCentre } from "@/lib/tb-centres";
import { isTbCentreAccessConfigured, verifyTbCentreStaffPin } from "@/lib/tb-centre-access";
import { currentAuthUser, currentMemberships, isAccountAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";

type VerificationRpcRow = {
  referral_id: unknown;
  status: unknown;
  code_used: unknown;
  tb_center_id: unknown;
  centre_name: unknown;
  centre_area: unknown;
  centre_district: unknown;
  service_type: unknown;
  created_at: unknown;
  completed_at: unknown;
  already_used?: unknown;
  completion_reward_created?: unknown;
};

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

async function accessError(request: Request, tbCenterId?: string) {
  if (isAccountAuthConfigured()) {
    const user = await currentAuthUser();
    if (user) {
      const memberships = await currentMemberships(user.id);
      const membership = memberships.find((candidate) => candidate.role === "TB_CENTRE_STAFF" && candidate.tb_center_id);
      if (!membership || (tbCenterId && membership.tb_center_id !== tbCenterId)) return errorResponse("TB_CENTRE_ACCESS_DENIED", 403);
      return null;
    }
  }
  if (!isTbCentreAccessConfigured()) return errorResponse("TB_CENTRE_ACCESS_NOT_CONFIGURED", 503);
  if (!verifyTbCentreStaffPin(request.headers.get("x-jvh-tb-centre-pin"))) return errorResponse("TB_CENTRE_ACCESS_DENIED", 401);
  return null;
}

function parseLookup(referralIdValue: unknown, tokenValue: unknown): ReferralLookup | null {
  const referralId = typeof referralIdValue === "string" ? referralIdValue.trim().toUpperCase() : "";
  const token = typeof tokenValue === "string" ? tokenValue.trim().toLowerCase() : "";
  if (Boolean(referralId) === Boolean(token)) return null;
  if (referralId && REFERRAL_ID_PATTERN.test(referralId)) return { referralId };
  if (token && REFERRAL_TOKEN_PATTERN.test(token)) return { token };
  return null;
}

function rpcArguments(lookup: ReferralLookup) {
  return lookup.referralId
    ? { p_referral_id: lookup.referralId, p_access_token: null }
    : { p_referral_id: null, p_access_token: lookup.token ?? null };
}

function toVerificationView(row: VerificationRpcRow): VerificationReferralView | null {
  const status = String(row.status ?? "");
  const completedAt = row.completed_at === null || row.completed_at === undefined
    ? null
    : String(row.completed_at);
  const referral: VerificationReferralView = {
    referralId: String(row.referral_id ?? ""),
    status: status as VerificationReferralView["status"],
    codeUsed: row.code_used === true,
    tbCenterId: String(row.tb_center_id ?? ""),
    centreName: String(row.centre_name ?? ""),
    centreArea: String(row.centre_area ?? ""),
    centreDistrict: String(row.centre_district ?? ""),
    serviceType: String(row.service_type ?? ""),
    createdAt: String(row.created_at ?? ""),
    completedAt,
    ...(typeof row.already_used === "boolean" ? { alreadyUsed: row.already_used } : {}),
    ...(typeof row.completion_reward_created === "boolean"
      ? { completionRewardCreated: row.completion_reward_created }
      : {}),
  };

  if (!REFERRAL_ID_PATTERN.test(referral.referralId)
    || !REFERRAL_STATUSES.includes(referral.status)
    || !getTbCentre(referral.tbCenterId)
    || !referral.centreName
    || !referral.centreArea
    || !referral.centreDistrict
    || !referral.serviceType
    || Number.isNaN(Date.parse(referral.createdAt))
    || (referral.completedAt !== null && Number.isNaN(Date.parse(referral.completedAt)))) return null;

  if ((referral.status === "COMPLETED") !== (referral.codeUsed && referral.completedAt !== null)) return null;
  return referral;
}

export async function GET(request: Request) {
  const denied = await accessError(request);
  if (denied) return denied;
  const query = new URL(request.url).searchParams;
  const lookup = parseLookup(query.get("referralId"), query.get("token"));
  if (!lookup) return errorResponse("INVALID_REFERRAL_LOOKUP", 400);
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc<VerificationRpcRow>(
      "get_part10_referral_for_verification",
      rpcArguments(lookup),
    );
    const referral = rows[0] ? toVerificationView(rows[0]) : null;
    if (!referral) return errorResponse("REFERRAL_NOT_FOUND", 404);
    const scopedDenied = await accessError(request, referral.tbCenterId);
    if (scopedDenied) return scopedDenied;
    return NextResponse.json({ referral }, { headers: responseHeaders });
  } catch {
    return errorResponse("REFERRAL_VERIFY_FETCH_FAILED", 502);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object") return errorResponse("INVALID_CONFIRMATION_REQUEST", 400);
    body = value as Record<string, unknown>;
  } catch {
    return errorResponse("INVALID_CONFIRMATION_REQUEST", 400);
  }

  const lookup = parseLookup(body.referralId, body.token);
  const tbCenterId = typeof body.tbCenterId === "string" ? body.tbCenterId.trim() : "";
  if (!lookup || !getTbCentre(tbCenterId)) return errorResponse("INVALID_CONFIRMATION_REQUEST", 400);
  const denied = await accessError(request, tbCenterId);
  if (denied) return denied;
  if (!isReferralDatabaseConfigured()) return errorResponse("REFERRAL_BACKEND_NOT_CONFIGURED", 503);

  try {
    const rows = await callReferralRpc<VerificationRpcRow>("complete_part10_referral", {
      ...rpcArguments(lookup),
      p_tb_center_id: tbCenterId,
    });
    const referral = rows[0] ? toVerificationView(rows[0]) : null;
    if (!referral) return errorResponse("REFERRAL_NOT_FOUND", 404);
    return NextResponse.json({ referral }, { headers: responseHeaders });
  } catch {
    return errorResponse("REFERRAL_CONFIRM_FAILED", 409);
  }
}
