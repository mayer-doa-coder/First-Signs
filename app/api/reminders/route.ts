import { NextResponse } from "next/server";
import { createAdminClient, currentAuthUser, isAccountAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
function error(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }

async function context() {
  if (!isAccountAuthConfigured()) return null;
  const user = await currentAuthUser(); const admin = createAdminClient();
  return user && admin ? { user, admin } : null;
}
export async function GET() {
  const value = await context(); if (!value) return error("AUTH_REQUIRED", 401);
  const { data } = await value.admin.from("care_reminders").select("reminder_id, scheduled_for, status, email_opt_in").eq("user_id", value.user.id).order("scheduled_for", { ascending: true });
  return NextResponse.json({ reminders: data ?? [] }, { headers });
}
export async function POST(request: Request) {
  const value = await context(); if (!value) return error("AUTH_REQUIRED", 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const scheduledFor = typeof body?.scheduledFor === "string" ? new Date(body.scheduledFor) : null;
  if (!scheduledFor || Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now()) return error("INVALID_REMINDER", 400);
  const { error: saveError } = await value.admin.from("care_reminders").insert({ user_id: value.user.id, scheduled_for: scheduledFor.toISOString(), email_opt_in: body?.emailOptIn === true });
  if (saveError) return error("REMINDER_SAVE_FAILED", 502);
  return GET();
}
export async function PATCH(request: Request) {
  const value = await context(); if (!value) return error("AUTH_REQUIRED", 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.reminderId === "string" ? body.reminderId : "";
  const status = body?.status === "COMPLETED" || body?.status === "DISMISSED" ? body.status : null;
  if (!id || !status) return error("INVALID_REMINDER", 400);
  const { error: updateError } = await value.admin.from("care_reminders").update({ status }).eq("reminder_id", id).eq("user_id", value.user.id);
  if (updateError) return error("REMINDER_UPDATE_FAILED", 502);
  return GET();
}
