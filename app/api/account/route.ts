import { NextResponse } from "next/server";
import { createAdminClient, currentAuthUser, currentMemberships, isAccountAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const phonePattern = /^01[3-9]\d{8}$/;

function error(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }

async function accountContext() {
  if (!isAccountAuthConfigured()) return { error: error("ACCOUNT_AUTH_NOT_CONFIGURED", 503) };
  const user = await currentAuthUser();
  const admin = createAdminClient();
  if (!user || !admin) return { error: error("AUTH_REQUIRED", 401) };
  return { user, admin };
}

export async function GET() {
  const context = await accountContext();
  if ("error" in context) return context.error;
  const { user, admin } = context;
  await admin.from("account_profiles").upsert({ user_id: user.id, email: user.email ?? "", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  const [{ data: profile }, { data: link }, memberships] = await Promise.all([
    admin.from("account_profiles").select("display_name, phone, email").eq("user_id", user.id).maybeSingle(),
    admin.from("account_patient_links").select("patient_id").eq("user_id", user.id).maybeSingle(),
    currentMemberships(user.id),
  ]);
  return NextResponse.json({
    user: { email: user.email ?? "", name: profile?.display_name ?? "", phone: profile?.phone ?? "", patientId: link?.patient_id ?? null },
    roles: memberships,
  }, { headers });
}

export async function PATCH(request: Request) {
  const context = await accountContext();
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  if (phone && !phonePattern.test(phone)) return error("INVALID_PHONE", 400);
  const { error: saveError } = await context.admin.from("account_profiles").upsert({
    user_id: context.user.id, email: context.user.email ?? "", display_name: displayName || null, phone: phone || null, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (saveError) return error("PROFILE_SAVE_FAILED", 502);
  return GET();
}

export async function POST(request: Request) {
  const context = await accountContext();
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const patientId = typeof body?.patientId === "string" ? body.patientId.trim().toUpperCase() : "";
  if (!/^JVH-DEMO-[A-F0-9]{8}$/.test(patientId)) return error("INVALID_CARE_RECORD", 400);
  const { error: linkError } = await context.admin.from("account_patient_links").upsert({ user_id: context.user.id, patient_id: patientId }, { onConflict: "user_id" });
  if (linkError) return error("CARE_SAVE_FAILED", 409);
  return GET();
}

export async function DELETE() {
  const context = await accountContext();
  if ("error" in context) return context.error;
  await context.admin.auth.admin.signOut(context.user.id, "global");
  const { error: deleteError } = await context.admin.auth.admin.deleteUser(context.user.id, false);
  if (deleteError) return error("ACCOUNT_DELETE_FAILED", 502);
  return NextResponse.json({ deleted: true }, { headers });
}
