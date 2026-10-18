import { NextResponse } from "next/server";
import { createAdminClient, currentAuthUser, hasRole, isAccountAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
const roles = new Set(["PHARMACY_STAFF", "TB_CENTRE_STAFF", "GOVERNMENT_VIEWER"]);
function error(error: string, status: number) { return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } }); }

export async function POST(request: Request) {
  if (!isAccountAuthConfigured()) return error("ACCOUNT_AUTH_NOT_CONFIGURED", 503);
  const requester = await currentAuthUser(); const admin = createAdminClient();
  if (!requester || !admin) return error("AUTH_REQUIRED", 401);
  if (!await hasRole(requester.id, "PLATFORM_ADMIN")) return error("ADMIN_ACCESS_DENIED", 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role : "";
  const pharmacyId = typeof body?.pharmacyId === "string" ? body.pharmacyId.trim().toUpperCase() : null;
  const tbCenterId = typeof body?.tbCenterId === "string" ? body.tbCenterId.trim().toUpperCase() : null;
  if (!/^\S+@\S+\.\S+$/.test(email) || !roles.has(role)) return error("INVALID_INVITATION", 400);
  if ((role === "PHARMACY_STAFF") !== Boolean(pharmacyId) || (role === "TB_CENTRE_STAFF") !== Boolean(tbCenterId) || (role === "GOVERNMENT_VIEWER" && (pharmacyId || tbCenterId))) return error("INVALID_INVITATION_SCOPE", 400);
  const origin = new URL(request.url).origin;
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/callback?next=/account` });
  if (inviteError || !data.user) return error("INVITATION_FAILED", 502);
  const { error: membershipError } = await admin.from("staff_memberships").upsert({ user_id: data.user.id, role, pharmacy_id: pharmacyId, tb_center_id: tbCenterId, active: true }, { onConflict: "user_id,role,pharmacy_id,tb_center_id" });
  if (membershipError) return error("MEMBERSHIP_SAVE_FAILED", 502);
  return NextResponse.json({ invited: true }, { headers: { "cache-control": "no-store" } });
}
