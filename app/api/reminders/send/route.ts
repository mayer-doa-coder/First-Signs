import { Resend } from "resend";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || request.headers.get("x-reminder-cron-secret") !== secret) return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 401 });
  const admin = createAdminClient();
  const from = process.env.REMINDER_FROM_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!admin || !from || !resendKey) return NextResponse.json({ error: "REMINDER_EMAIL_NOT_CONFIGURED" }, { status: 503 });
  const now = new Date().toISOString();
  const { data: reminders, error } = await admin.from("care_reminders")
    .select("reminder_id, user_id").eq("status", "PENDING").eq("email_opt_in", true).lte("scheduled_for", now).limit(50);
  if (error) return NextResponse.json({ error: "REMINDER_LOOKUP_FAILED" }, { status: 502 });
  const resend = new Resend(resendKey);
  let sent = 0;
  for (const reminder of reminders ?? []) {
    const { data: profile } = await admin.from("account_profiles").select("email").eq("user_id", reminder.user_id).maybeSingle();
    if (!profile?.email) continue;
    const delivery = await resend.emails.send({ from, to: profile.email, subject: "First Signs reminder", text: "You have a First Signs reminder. Sign in to view your private care journey." });
    if (!delivery.error) {
      await admin.from("care_reminders").update({ status: "SENT", emailed_at: now, updated_at: now }).eq("reminder_id", reminder.reminder_id).eq("status", "PENDING");
      sent += 1;
    }
  }
  return NextResponse.json({ sent }, { headers: { "cache-control": "no-store" } });
}
