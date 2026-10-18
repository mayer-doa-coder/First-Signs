"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BilingualText, useLanguage } from "@/components/language";
import { createBrowserAuthClient, isBrowserAuthConfigured } from "@/lib/auth-browser";
import { ClayCard, PageShell, SectionHeading, StatusPill } from "@/components/ui";

type Account = { user: { email: string; name: string; phone: string; patientId: string | null }; roles: { role: string; pharmacy_id: string | null; tb_center_id: string | null }[] };
type Reminder = { reminder_id: string; scheduled_for: string; status: string; email_opt_in: boolean };

function message(language: "bn" | "en", value: string) {
  const values: Record<string, { bn: string; en: string }> = {
    sent: { bn: "সাইন-ইন লিংক পাঠানো হয়েছে। ইমেইল খুলে আবার আসুন।", en: "Your sign-in link was sent. Open the email, then return here." },
    unavailable: { bn: "অ্যাকাউন্ট সাইন-ইন এখনো কনফিগার করা হয়নি।", en: "Account sign-in is not configured yet." },
    saved: { bn: "আপনার তথ্য সংরক্ষণ করা হয়েছে।", en: "Your details were saved." },
    reminder: { bn: "রিমাইন্ডার যোগ করা হয়েছে।", en: "Your reminder was added." },
    error: { bn: "এই কাজটি এখন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।", en: "This could not be completed now. Please try again." },
  };
  return values[value]?.[language] ?? "";
}

export function AccountHub() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const claimedCare = useRef(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!isBrowserAuthConfigured()) { setLoading(false); return; }
    const response = await fetch("/api/account", { cache: "no-store" });
    if (!response.ok) { setAccount(null); setLoading(false); return; }
    const body = await response.json() as Account;
    setAccount(body);
    const reminderResponse = await fetch("/api/reminders", { cache: "no-store" });
    if (reminderResponse.ok) setReminders((await reminderResponse.json() as { reminders: Reminder[] }).reminders);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const patientId = searchParams.get("saveCare");
    if (!account || !patientId || claimedCare.current) return;
    claimedCare.current = true;
    void fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patientId }) })
      .then((response) => { setNotice(response.ok ? "saved" : "error"); if (response.ok) void load(); });
  }, [account, searchParams]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = createBrowserAuthClient();
    if (!client) { setNotice("unavailable"); return; }
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` } });
    setNotice(error ? "error" : "sent");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: form.get("name"), phone: form.get("phone") }) });
    setNotice(response.ok ? "saved" : "error"); if (response.ok) void load();
  }

  async function addReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scheduledFor = new Date(String(form.get("scheduledFor"))).toISOString();
    const response = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledFor, emailOptIn: form.get("emailOptIn") === "on" }) });
    setNotice(response.ok ? "reminder" : "error"); if (response.ok) void load();
  }

  async function finishReminder(id: string, status: "COMPLETED" | "DISMISSED") {
    const response = await fetch("/api/reminders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reminderId: id, status }) });
    if (response.ok) void load(); else setNotice("error");
  }

  async function inviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get("role"));
    const scope = String(form.get("scope") ?? "").trim().toUpperCase();
    const payload = { email: form.get("inviteEmail"), role, ...(role === "PHARMACY_STAFF" ? { pharmacyId: scope } : {}), ...(role === "TB_CENTRE_STAFF" ? { tbCenterId: scope } : {}) };
    const response = await fetch("/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setInviteNotice(response.ok ? "sent" : "error");
    if (response.ok) event.currentTarget.reset();
  }

  async function signOut() {
    const client = createBrowserAuthClient(); if (client) await client.auth.signOut();
    setAccount(null); setReminders([]); setNotice("");
  }

  return <PageShell eyebrow={{ bn: "আমার অ্যাকাউন্ট", en: "My account" }} title={{ bn: "আপনার সেবার পথটি মনে রাখুন", en: "Keep your care journey together" }} description={{ bn: "এটি যক্ষ্মা রোগ নির্ণয় বা চিকিৎসা ব্যবস্থাপনা নয়।", en: "This is not TB diagnosis or treatment management." }} icon="care">
    {!isBrowserAuthConfigured() ? <ClayCard role="status"><BilingualText copy={{ bn: "অ্যাকাউন্ট ফিচার চালু করতে Supabase-এর public URL ও publishable key কনফিগার করুন।", en: "Configure the Supabase public URL and publishable key to enable accounts." }} /></ClayCard> : loading ? <ClayCard role="status"><BilingualText copy={{ bn: "অ্যাকাউন্ট দেখা হচ্ছে…", en: "Loading your account…" }} /></ClayCard> : !account ? <ClayCard className="account-auth-card"><SectionHeading title={{ bn: "ইমেইল দিয়ে সাইন ইন করুন", en: "Sign in with email" }} description={{ bn: "পাসওয়ার্ড লাগবে না। আমরা একটি নিরাপদ লিংক পাঠাব।", en: "No password needed. We will send a secure link." }} /><form onSubmit={signIn}><label htmlFor="account-email"><BilingualText copy={{ bn: "ইমেইল", en: "Email" }} /></label><input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "সাইন-ইন লিংক পাঠান", en: "Send sign-in link" }} /></button></form></ClayCard> : <>
      <ClayCard className="account-profile-card"><div className="card-heading-row"><div><span className="mini-label"><BilingualText copy={{ bn: "ব্যক্তিগত তথ্য", en: "Your details" }} /></span><h2>{account.user.name || account.user.email}</h2><p lang="en">{account.user.email}</p></div><button className="button button-secondary" type="button" onClick={() => void signOut()}><BilingualText copy={{ bn: "সাইন আউট", en: "Sign out" }} /></button></div><form onSubmit={saveProfile} className="account-form"><label><BilingualText copy={{ bn: "নাম (ঐচ্ছিক)", en: "Name (optional)" }} /><input name="name" defaultValue={account.user.name} /></label><label><BilingualText copy={{ bn: "বাংলাদেশি ফোন (ঐচ্ছিক)", en: "Bangladesh phone (optional)" }} /><input name="phone" inputMode="tel" defaultValue={account.user.phone} /></label><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "তথ্য সংরক্ষণ", en: "Save details" }} /></button></form></ClayCard>
      <section className="section-block"><SectionHeading title={{ bn: "আমার সেবা", en: "My Care" }} description={{ bn: "স্ক্রিনিং, রেফারেল ও পরবর্তী কাজের ব্যক্তিগত সারাংশ।", en: "Your private screening, referral, and next-action summary." }} />{account.user.patientId ? <ClayCard><StatusPill tone="success" label={{ bn: "সেবা সংরক্ষিত", en: "Care saved" }} /><p><BilingualText copy={{ bn: "আপনার সংরক্ষিত সেবার তথ্য খুলুন।", en: "Open your saved care information." }} /></p><Link className="button button-primary" href={`/care?patient=${encodeURIComponent(account.user.patientId)}&source=self`}><BilingualText copy={{ bn: "আমার সেবা খুলুন", en: "Open My Care" }} /></Link></ClayCard> : <ClayCard><BilingualText copy={{ bn: "আগে স্ক্রিনিং শেষ করুন; এরপর এখান থেকে আপনার সেবার তথ্য সংরক্ষণ করা যাবে।", en: "Complete a screening first; you can then save its care information here." }} /></ClayCard>}</section>
      <section className="section-block"><SectionHeading title={{ bn: "স্মরণ করিয়ে দিন", en: "Reminders" }} description={{ bn: "ইমেইলে কখনো স্বাস্থ্য বা রেফারেলের বিস্তারিত যাবে না।", en: "Emails never include health or referral details." }} /><ClayCard><form onSubmit={addReminder} className="account-form"><label><BilingualText copy={{ bn: "তারিখ ও সময়", en: "Date and time" }} /><input name="scheduledFor" type="datetime-local" required /></label><label className="check-row"><input name="emailOptIn" type="checkbox" /><BilingualText copy={{ bn: "সাধারণ ইমেইল রিমাইন্ডার পাঠান", en: "Send a generic email reminder" }} /></label><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "রিমাইন্ডার যোগ করুন", en: "Add reminder" }} /></button></form>{reminders.map((reminder) => <div className="account-reminder" key={reminder.reminder_id}><span lang="en">{new Date(reminder.scheduled_for).toLocaleString()}</span><StatusPill label={{ bn: reminder.status, en: reminder.status }} />{reminder.status === "PENDING" && <span><button className="button button-secondary" type="button" onClick={() => void finishReminder(reminder.reminder_id, "COMPLETED")}><BilingualText copy={{ bn: "সম্পন্ন", en: "Done" }} /></button><button className="button button-secondary" type="button" onClick={() => void finishReminder(reminder.reminder_id, "DISMISSED")}><BilingualText copy={{ bn: "বাদ দিন", en: "Dismiss" }} /></button></span>}</div>)}</ClayCard></section>
      {account.roles.length > 0 && <section className="section-block"><SectionHeading title={{ bn: "কর্মক্ষেত্র", en: "Workspaces" }} /><ClayCard>{account.roles.map((role) => <p key={`${role.role}-${role.pharmacy_id}-${role.tb_center_id}`}><strong lang="en">{role.role.replaceAll("_", " ")}</strong></p>)}</ClayCard></section>}
      {account.roles.some((role) => role.role === "PLATFORM_ADMIN") && <section className="section-block"><SectionHeading title={{ bn: "স্টাফ আমন্ত্রণ", en: "Invite staff" }} description={{ bn: "শুধু অনুমোদিত ডেমো কর্মীদের ইমেইল দিয়ে আমন্ত্রণ দিন।", en: "Invite approved demo staff by email." }} /><ClayCard><form onSubmit={inviteStaff} className="account-form"><label><BilingualText copy={{ bn: "ইমেইল", en: "Email" }} /><input name="inviteEmail" type="email" required /></label><label><BilingualText copy={{ bn: "কাজের ভূমিকা", en: "Workspace role" }} /><select name="role" defaultValue="PHARMACY_STAFF"><option value="PHARMACY_STAFF">Pharmacy staff</option><option value="TB_CENTRE_STAFF">TB-centre staff</option><option value="GOVERNMENT_VIEWER">Government viewer</option></select></label><label><BilingualText copy={{ bn: "ফার্মেসি বা কেন্দ্রের আইডি (সরকারের জন্য খালি রাখুন)", en: "Pharmacy or centre ID (leave blank for government)" }} /><input name="scope" /></label><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "আমন্ত্রণ পাঠান", en: "Send invitation" }} /></button>{inviteNotice && <p role="status">{message(language, inviteNotice)}</p>}</form></ClayCard></section>}
    </>}
    {notice && <p className="account-notice" role="status">{message(language, notice)}</p>}
  </PageShell>;
}
