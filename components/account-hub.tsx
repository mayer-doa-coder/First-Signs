"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { createBrowserAuthClient, isBrowserAuthConfigured } from "@/lib/auth-browser";
import { clearSessionPolicy, saveSessionPolicy } from "@/lib/session-policy";
import { ClayCard, PageShell, SectionHeading, StatusPill } from "@/components/ui";

type AccountRole = "PATIENT" | "PHARMACY_STAFF" | "TB_CENTRE_STAFF" | "GOVERNMENT_VIEWER" | "PLATFORM_ADMIN";
type Account = { user: { email: string; username: string; name: string; phone: string; patientId: string | null }; roles: { role: string; pharmacy_id: string | null; tb_center_id: string | null }[]; primaryRole: AccountRole; workspaceHome: string };
type Reminder = { reminder_id: string; scheduled_for: string; status: string; email_opt_in: boolean };
type AuthMode = "login" | "signup" | "forgot" | "reset";

const roleLabels: Record<AccountRole, Copy> = {
  PATIENT: { bn: "রোগী / সাধারণ ব্যবহারকারী", en: "Patient / general user" },
  PHARMACY_STAFF: { bn: "ফার্মেসি", en: "Pharmacy" },
  TB_CENTRE_STAFF: { bn: "টিবি কেন্দ্র", en: "TB centre" },
  GOVERNMENT_VIEWER: { bn: "সরকারি জনস্বাস্থ্য", en: "Government public health" },
  PLATFORM_ADMIN: { bn: "প্ল্যাটফর্ম অ্যাডমিন", en: "Platform admin" },
};

function message(language: "bn" | "en", value: string) {
  const values: Record<string, Copy> = {
    confirmation: { bn: "অ্যাকাউন্ট তৈরি হয়েছে। লগ ইন করার আগে ইমেইল নিশ্চিত করুন।", en: "Your account was created. Confirm your email before logging in." },
    resetSent: { bn: "কোড পাঠানো হয়েছে। ইমেইল দেখে ছয় সংখ্যার কোড লিখুন।", en: "A code was sent. Check your email and enter the six-digit code." },
    passwordReset: { bn: "পাসওয়ার্ড পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগ ইন করুন।", en: "Your password was changed. Log in with the new password." },
    sessionExpired: { bn: "নিষ্ক্রিয় থাকার কারণে সেশন শেষ হয়েছে। আবার লগ ইন করুন।", en: "Your session ended after inactivity. Please log in again." },
    invalidCredentials: { bn: "ইমেইল/ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।", en: "The email/username or password is incorrect." },
    usernameUnavailable: { bn: "এই ইউজারনেমটি পাওয়া যাচ্ছে না। অন্যটি চেষ্টা করুন।", en: "That username is unavailable. Try another." },
    invalidCode: { bn: "কোডটি সঠিক নয় বা মেয়াদ শেষ। নতুন কোড চেয়ে আবার চেষ্টা করুন।", en: "That code is invalid or expired. Request a new code and try again." },
    unavailable: { bn: "অ্যাকাউন্ট সাইন-ইন এখনো কনফিগার করা হয়নি।", en: "Account sign-in is not configured yet." },
    expired: { bn: "ইমেইল লিংকটি আর কাজ করছে না। আবার চেষ্টা করুন।", en: "That email link no longer works. Please try again." },
    saved: { bn: "আপনার তথ্য সংরক্ষণ করা হয়েছে।", en: "Your details were saved." },
    reminder: { bn: "রিমাইন্ডার যোগ করা হয়েছে।", en: "Your reminder was added." },
    sent: { bn: "আমন্ত্রণ পাঠানো হয়েছে।", en: "The invitation was sent." },
    error: { bn: "এই কাজটি এখন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।", en: "This could not be completed now. Please try again." },
  };
  return values[value]?.[language] ?? "";
}

function workspaceFor(role: AccountRole) {
  if (role === "PHARMACY_STAFF") return { href: "/pharmacy", title: { bn: "ফার্মেসি কর্মক্ষেত্র", en: "Pharmacy workspace" }, description: { bn: "দোকানের QR, রেফারেল, মোট সংখ্যা ও কর্মপ্রবাহভিত্তিক ক্রেডিট দেখুন।", en: "View the shop QR, referrals, totals, and workflow credits." } };
  if (role === "TB_CENTRE_STAFF") return { href: "/verify", title: { bn: "উপস্থিতি যাচাই", en: "Attendance verification" }, description: { bn: "শুধু আপনার কেন্দ্রের রেফারেল উপস্থিতি নিশ্চিত করুন।", en: "Confirm referral attendance only for your assigned centre." } };
  return { href: "/dashboard", title: { bn: "জনস্বাস্থ্য ড্যাশবোর্ড", en: "Public-health dashboard" }, description: { bn: "নামবিহীন সমষ্টিগত সংকেত, শতকরা হার এবং বাস্তব মানচিত্র দেখুন।", en: "View anonymous aggregate signals, rates, and the real map." } };
}

export function AccountHub() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const claimedCare = useRef(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notice, setNotice] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const rawMode = searchParams.get("mode");
  const mode: AuthMode = rawMode === "signup" || rawMode === "forgot" || rawMode === "reset" ? rawMode : "login";

  async function load() {
    if (!isBrowserAuthConfigured()) { setLoading(false); return; }
    const response = await fetch("/api/account", { cache: "no-store" });
    if (!response.ok) { setAccount(null); setLoading(false); return; }
    const body = await response.json() as Account;
    setAccount(body);
    if (body.primaryRole === "PATIENT") {
      const reminderResponse = await fetch("/api/reminders", { cache: "no-store" });
      if (reminderResponse.ok) setReminders((await reminderResponse.json() as { reminders: Reminder[] }).reminders);
    } else setReminders([]);
    setLoading(false);
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (searchParams.get("auth") === "failed" || hash.get("error_code") === "otp_expired") setNotice("expired");
      else if (searchParams.get("auth") === "unavailable") setNotice("unavailable");
      else if (searchParams.get("auth") === "session-expired") setNotice("sessionExpired");
      else if (searchParams.get("auth") === "password-reset") setNotice("passwordReset");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);
  useEffect(() => {
    if (mode !== "reset") return;
    const client = createBrowserAuthClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => { if (data.session) setRecoveryVerified(true); });
  }, [mode]);
  useEffect(() => {
    const patientId = searchParams.get("saveCare");
    if (!account || account.primaryRole !== "PATIENT" || !patientId || claimedCare.current) return;
    claimedCare.current = true;
    void fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patientId }) }).then((response) => { setNotice(response.ok ? "saved" : "error"); if (response.ok) void load(); });
  }, [account, searchParams]);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setNotice("");
    const form = new FormData(event.currentTarget); const remember = form.get("remember") === "on";
    const isSignup = mode === "signup";
    const payload = isSignup ? { name: form.get("name"), username: form.get("username"), email: form.get("email"), password: form.get("password") } : { identifier: form.get("identifier"), password: form.get("password") };
    const response = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null) as { error?: string; confirmationRequired?: boolean; redirectTo?: string } | null;
    setSubmitting(false);
    if (!response.ok) { setNotice(body?.error === "USERNAME_UNAVAILABLE" ? "usernameUnavailable" : body?.error === "INVALID_CREDENTIALS" ? "invalidCredentials" : "error"); return; }
    if (body?.confirmationRequired) { saveSessionPolicy(remember ? "remember" : "idle"); setNotice("confirmation"); return; }
    saveSessionPolicy(remember ? "remember" : "idle"); router.push(body?.redirectTo ?? "/account"); router.refresh();
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setNotice(""); const form = new FormData(event.currentTarget); const email = String(form.get("email") ?? "").trim().toLowerCase(); const client = createBrowserAuthClient();
    if (!client) { setSubmitting(false); setNotice("unavailable"); return; }
    const recoveryPath = "/account?mode=reset";
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(recoveryPath)}` });
    setSubmitting(false); if (error) { setNotice("error"); return; } setRecoveryEmail(email); setNotice("resetSent");
  }
  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setNotice(""); const form = new FormData(event.currentTarget); const email = String(form.get("email") ?? recoveryEmail).trim().toLowerCase(); const token = String(form.get("code") ?? "").replace(/\D/g, ""); const client = createBrowserAuthClient();
    if (!client) { setSubmitting(false); setNotice("unavailable"); return; }
    const { error } = await client.auth.verifyOtp({ email, token, type: "recovery" }); setSubmitting(false);
    if (error) { setNotice("invalidCode"); return; } setRecoveryEmail(email); setRecoveryVerified(true);
  }
  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setNotice(""); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || password !== confirmation) { setSubmitting(false); setNotice("error"); return; }
    const client = createBrowserAuthClient(); if (!client) { setSubmitting(false); setNotice("unavailable"); return; }
    const { error } = await client.auth.updateUser({ password }); if (!error) await client.auth.signOut(); clearSessionPolicy(); setSubmitting(false);
    if (error) { setNotice("error"); return; } router.push("/account?mode=login&auth=password-reset"); router.refresh();
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: form.get("name"), phone: form.get("phone") }) }); setNotice(response.ok ? "saved" : "error"); if (response.ok) void load(); }
  async function addReminder(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledFor: new Date(String(form.get("scheduledFor"))).toISOString(), emailOptIn: form.get("emailOptIn") === "on" }) }); setNotice(response.ok ? "reminder" : "error"); if (response.ok) void load(); }
  async function finishReminder(id: string, status: "COMPLETED" | "DISMISSED") { const response = await fetch("/api/reminders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reminderId: id, status }) }); if (response.ok) void load(); else setNotice("error"); }
  async function inviteStaff(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const role = String(form.get("role")); const scope = String(form.get("scope") ?? "").trim().toUpperCase(); const payload = { email: form.get("inviteEmail"), role, ...(role === "PHARMACY_STAFF" ? { pharmacyId: scope } : {}), ...(role === "TB_CENTRE_STAFF" ? { tbCenterId: scope } : {}) }; const response = await fetch("/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); setInviteNotice(response.ok ? "sent" : "error"); if (response.ok) event.currentTarget.reset(); }
  async function signOut() { const client = createBrowserAuthClient(); if (client) await client.auth.signOut(); clearSessionPolicy(); setAccount(null); setReminders([]); setNotice(""); }
  async function deleteAccount(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (deleteConfirmation !== "DELETE") return; const response = await fetch("/api/account", { method: "DELETE" }); if (!response.ok) { setNotice("error"); return; } const client = createBrowserAuthClient(); if (client) await client.auth.signOut(); clearSessionPolicy(); setAccount(null); setReminders([]); setDeleteOpen(false); setDeleteConfirmation(""); }

  const authCard = mode === "forgot" || mode === "reset" ? <RecoveryCard mode={mode} email={recoveryEmail} verified={recoveryVerified} submitting={submitting} onRequest={requestReset} onVerify={verifyRecoveryCode} onUpdate={updatePassword} /> : <CredentialsCard mode={mode} submitting={submitting} onSubmit={submitCredentials} language={language} />;
  const isPatient = account?.primaryRole === "PATIENT";
  const workspace = account ? workspaceFor(account.primaryRole) : null;

  return <PageShell showHero={Boolean(account)} eyebrow={{ bn: "আমার অ্যাকাউন্ট", en: "My account" }} title={{ bn: "আপনার সেবার পথটি মনে রাখুন", en: "Keep your care journey together" }} description={{ bn: "ভূমিকা অনুযায়ী ব্যক্তিগত ও কর্মক্ষেত্রের তথ্য আলাদা থাকে। এটি রোগ নির্ণয় নয়।", en: "Private and workspace information stays separated by role. This is not diagnosis." }} icon="care">
    {!isBrowserAuthConfigured() ? <ClayCard role="status"><BilingualText copy={{ bn: "অ্যাকাউন্ট ফিচার চালু করতে Supabase-এর public URL ও publishable key কনফিগার করুন।", en: "Configure the Supabase public URL and publishable key to enable accounts." }} /></ClayCard> : loading ? <ClayCard role="status"><BilingualText copy={{ bn: "অ্যাকাউন্ট দেখা হচ্ছে…", en: "Loading your account…" }} /></ClayCard> : !account ? authCard : <>
      <ClayCard className="account-profile-card"><div className="card-heading-row"><div><span className="mini-label"><BilingualText copy={roleLabels[account.primaryRole]} /></span><h2>{account.user.name || account.user.username || account.user.email}</h2><p lang="en">{account.user.username ? `@${account.user.username} · ` : ""}{account.user.email}</p></div><button className="button button-secondary" type="button" onClick={() => void signOut()}><BilingualText copy={{ bn: "সাইন আউট", en: "Sign out" }} /></button></div>{isPatient && <form onSubmit={saveProfile} className="account-form"><label><BilingualText copy={{ bn: "নাম", en: "Name" }} /><input name="name" defaultValue={account.user.name} required /></label><label><BilingualText copy={{ bn: "বাংলাদেশি ফোন (ঐচ্ছিক)", en: "Bangladesh phone (optional)" }} /><input name="phone" inputMode="tel" defaultValue={account.user.phone} /></label><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "তথ্য সংরক্ষণ", en: "Save details" }} /></button></form>}</ClayCard>
      {isPatient ? <PatientWorkspace account={account} reminders={reminders} addReminder={addReminder} finishReminder={finishReminder} /> : workspace && <section className="section-block"><SectionHeading title={{ bn: "আপনার কর্মক্ষেত্র", en: "Your workspace" }} description={{ bn: "রোগীর ব্যক্তিগত সরঞ্জাম এই ভূমিকায় দেখানো হয় না।", en: "Private patient tools are not shown for this role." }} /><ClayCard><h3><BilingualText copy={workspace.title} /></h3><p><BilingualText copy={workspace.description} /></p><Link className="button button-primary" href={workspace.href}><BilingualText copy={{ bn: "কর্মক্ষেত্র খুলুন", en: "Open workspace" }} /></Link></ClayCard></section>}
      {account.primaryRole === "PLATFORM_ADMIN" && <AdminInvites notice={inviteNotice} onInvite={inviteStaff} language={language} />}
      <section className="section-block"><SectionHeading title={{ bn: "অ্যাকাউন্ট নিয়ন্ত্রণ", en: "Account controls" }} description={{ bn: "আপনি যেকোনো সময় সাইন আউট বা নিজের অ্যাকাউন্ট মুছে ফেলতে পারেন।", en: "You can sign out or delete your own account at any time." }} /><ClayCard className="account-danger-zone"><div><h3><BilingualText copy={{ bn: "অ্যাকাউন্ট মুছুন", en: "Delete account" }} /></h3><p><BilingualText copy={{ bn: "এটি প্রোফাইল ও ব্যক্তিগত সেটিংস মুছে ফেলবে। নামবিহীন স্ক্রিনিং রেকর্ড থাকবে।", en: "This removes the profile and private settings. Anonymous screening records remain." }} /></p></div>{!deleteOpen ? <button className="button button-danger" type="button" onClick={() => setDeleteOpen(true)}><BilingualText copy={{ bn: "অ্যাকাউন্ট মুছুন", en: "Delete account" }} /></button> : <form onSubmit={deleteAccount} className="account-delete-form"><label><BilingualText copy={{ bn: "নিশ্চিত করতে DELETE লিখুন", en: "Type DELETE to confirm" }} /><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" required /></label><div className="button-row"><button className="button button-danger" type="submit" disabled={deleteConfirmation !== "DELETE"}><BilingualText copy={{ bn: "স্থায়ীভাবে মুছুন", en: "Delete permanently" }} /></button><button className="button button-secondary" type="button" onClick={() => { setDeleteOpen(false); setDeleteConfirmation(""); }}><BilingualText copy={{ bn: "বাতিল", en: "Cancel" }} /></button></div></form>}</ClayCard></section>
    </>}
    {notice && <p className="account-notice" role={["error", "invalidCredentials", "invalidCode"].includes(notice) ? "alert" : "status"}>{message(language, notice)}</p>}
  </PageShell>;
}

function CredentialsCard({ mode, submitting, onSubmit, language }: { mode: "login" | "signup"; submitting: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; language: "bn" | "en" }) {
  const tabs = <div className="account-auth-tabs" role="tablist" aria-label={language === "bn" ? "অ্যাকাউন্ট পছন্দ" : "Account choice"}><Link className={mode === "login" ? "active" : ""} href="/account?mode=login" role="tab" aria-selected={mode === "login"}><BilingualText copy={{ bn: "লগ ইন", en: "Log in" }} /></Link><Link className={mode === "signup" ? "active" : ""} href="/account?mode=signup" role="tab" aria-selected={mode === "signup"}><BilingualText copy={{ bn: "সাইন আপ", en: "Sign up" }} /></Link></div>;
  if (mode === "login") return <ClayCard className="account-auth-card account-login-card">{tabs}<SectionHeading title={{ bn: "আবার স্বাগতম", en: "Welcome back" }} description={{ bn: "ইমেইল অথবা ইউজারনেম এবং পাসওয়ার্ড দিয়ে লগ ইন করুন।", en: "Log in with your email or username and password." }} /><form className="account-auth-form" onSubmit={onSubmit}><div className="account-auth-field"><label htmlFor="login-identifier"><BilingualText copy={{ bn: "ইমেইল অথবা ইউজারনেম", en: "Email or username" }} /></label><input id="login-identifier" name="identifier" autoComplete="username" required /></div><div className="account-auth-field"><label htmlFor="login-password"><BilingualText copy={{ bn: "পাসওয়ার্ড", en: "Password" }} /></label><input id="login-password" name="password" type="password" autoComplete="current-password" minLength={8} required /></div><label className="check-row"><input name="remember" type="checkbox" /><BilingualText copy={{ bn: "আমাকে ১ মাস মনে রাখুন", en: "Remember me for 1 month" }} /></label><small><BilingualText copy={{ bn: "টিক না দিলে ১ ঘণ্টা নিষ্ক্রিয় থাকার পর লগ আউট হবে।", en: "If unchecked, you will be signed out after 1 hour of inactivity." }} /></small><button className="button button-primary" disabled={submitting} type="submit"><BilingualText copy={submitting ? { bn: "অপেক্ষা করুন…", en: "Please wait…" } : { bn: "লগ ইন", en: "Log in" }} /></button></form><Link className="account-text-link" href="/account?mode=forgot"><BilingualText copy={{ bn: "পাসওয়ার্ড ভুলে গেছেন?", en: "Forgot password?" }} /></Link></ClayCard>;
  return <ClayCard className="account-auth-card account-signup-card">{tabs}<SectionHeading title={{ bn: "আপনার অ্যাকাউন্ট তৈরি করুন", en: "Create your account" }} description={{ bn: "নাম, অনন্য ইউজারনেম, ইমেইল ও পাসওয়ার্ড দিন। নতুন অ্যাকাউন্ট রোগী হিসেবে শুরু হবে।", en: "Enter your name, unique username, email, and password. New accounts start with the patient role." }} /><form className="account-auth-form account-signup-form" onSubmit={onSubmit}><div className="account-auth-field"><label htmlFor="signup-name"><BilingualText copy={{ bn: "নাম", en: "Name" }} /></label><input id="signup-name" name="name" autoComplete="name" minLength={2} maxLength={80} required /></div><div className="account-auth-field"><label htmlFor="signup-username"><BilingualText copy={{ bn: "ইউজারনেম", en: "Username" }} /></label><input id="signup-username" name="username" autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" aria-describedby="username-help" required /><small id="username-help"><BilingualText copy={{ bn: "৩–৩২ অক্ষর; ইংরেজি বর্ণ, সংখ্যা, ডট, ড্যাশ বা আন্ডারস্কোর।", en: "3–32 characters: letters, numbers, dots, dashes, or underscores." }} /></small></div><div className="account-auth-field"><label htmlFor="signup-email"><BilingualText copy={{ bn: "ইমেইল", en: "Email" }} /></label><input id="signup-email" name="email" type="email" autoComplete="email" required /></div><div className="account-auth-field"><label htmlFor="signup-password"><BilingualText copy={{ bn: "পাসওয়ার্ড", en: "Password" }} /></label><input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><small><BilingualText copy={{ bn: "কমপক্ষে ৮ অক্ষর, একটি বর্ণ ও একটি সংখ্যা ব্যবহার করুন।", en: "Use at least 8 characters with a letter and a number." }} /></small></div><div className="account-signup-actions"><label className="check-row"><input name="remember" type="checkbox" /><BilingualText copy={{ bn: "আমাকে ১ মাস মনে রাখুন", en: "Remember me for 1 month" }} /></label><small><BilingualText copy={{ bn: "টিক না দিলে ১ ঘণ্টা নিষ্ক্রিয় থাকার পর লগ আউট হবে।", en: "If unchecked, you will be signed out after 1 hour of inactivity." }} /></small><button className="button button-primary" disabled={submitting} type="submit"><BilingualText copy={submitting ? { bn: "অপেক্ষা করুন…", en: "Please wait…" } : { bn: "অ্যাকাউন্ট তৈরি করুন", en: "Create account" }} /></button></div></form></ClayCard>;
}

function RecoveryCard({ mode, email, verified, submitting, onRequest, onVerify, onUpdate }: { mode: "forgot" | "reset"; email: string; verified: boolean; submitting: boolean; onRequest: (event: FormEvent<HTMLFormElement>) => void; onVerify: (event: FormEvent<HTMLFormElement>) => void; onUpdate: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ClayCard className="account-auth-card"><SectionHeading title={{ bn: "পাসওয়ার্ড পুনরুদ্ধার", en: "Reset your password" }} description={{ bn: "ইমেইলে পাঠানো ছয় সংখ্যার কোড দিয়ে নতুন পাসওয়ার্ড তৈরি করুন।", en: "Use the six-digit code sent to your email to create a new password." }} />{mode === "forgot" && !email ? <form onSubmit={onRequest}><label htmlFor="recovery-email"><BilingualText copy={{ bn: "ইমেইল", en: "Email" }} /></label><input id="recovery-email" name="email" type="email" autoComplete="email" required /><button className="button button-primary" disabled={submitting} type="submit"><BilingualText copy={{ bn: "কোড পাঠান", en: "Send code" }} /></button></form> : !verified ? <form onSubmit={onVerify}><label htmlFor="recovery-code-email"><BilingualText copy={{ bn: "ইমেইল", en: "Email" }} /></label><input id="recovery-code-email" name="email" type="email" autoComplete="email" defaultValue={email} required /><label htmlFor="recovery-code"><BilingualText copy={{ bn: "ছয় সংখ্যার কোড", en: "Six-digit code" }} /></label><input id="recovery-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /><button className="button button-primary" disabled={submitting} type="submit"><BilingualText copy={{ bn: "কোড যাচাই করুন", en: "Verify code" }} /></button></form> : <form onSubmit={onUpdate}><label htmlFor="new-password"><BilingualText copy={{ bn: "নতুন পাসওয়ার্ড", en: "New password" }} /></label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><label htmlFor="confirm-password"><BilingualText copy={{ bn: "নতুন পাসওয়ার্ড আবার লিখুন", en: "Confirm new password" }} /></label><input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={8} required /><button className="button button-primary" disabled={submitting} type="submit"><BilingualText copy={{ bn: "পাসওয়ার্ড পরিবর্তন করুন", en: "Change password" }} /></button></form>}<Link className="account-text-link" href="/account?mode=login"><BilingualText copy={{ bn: "লগ ইন পৃষ্ঠায় ফিরুন", en: "Back to login" }} /></Link></ClayCard>;
}

function PatientWorkspace({ account, reminders, addReminder, finishReminder }: { account: Account; reminders: Reminder[]; addReminder: (event: FormEvent<HTMLFormElement>) => void; finishReminder: (id: string, status: "COMPLETED" | "DISMISSED") => void }) {
  return <><section className="section-block"><SectionHeading title={{ bn: "রোগীর সরঞ্জাম", en: "Patient tools" }} description={{ bn: "স্ক্রিনিং, সহায়ক, ওষুধ শিক্ষা, অবস্থান ও নিজের সেবার তথ্য ব্যবহার করুন।", en: "Use screening, the assistant, medicine education, location support, and your own care record." }} /><div className="account-action-grid"><Link className="button button-primary" href="/screen?source=self"><BilingualText copy={{ bn: "স্ক্রিনিং শুরু করুন", en: "Start screening" }} /></Link><Link className="button button-secondary" href="/assistant"><BilingualText copy={{ bn: "সহায়ক খুলুন", en: "Open assistant" }} /></Link><Link className="button button-secondary" href="/medicines"><BilingualText copy={{ bn: "ওষুধ কর্নার", en: "Medicine Corner" }} /></Link><Link className="button button-secondary" href="/care"><BilingualText copy={{ bn: "কেন্দ্র ও পথ দেখুন", en: "Find centres and routes" }} /></Link></div></section><section className="section-block"><SectionHeading title={{ bn: "আমার সেবা", en: "My Care" }} />{account.user.patientId ? <ClayCard><StatusPill tone="success" label={{ bn: "সেবা সংরক্ষিত", en: "Care saved" }} /><Link className="button button-primary" href={`/care?patient=${encodeURIComponent(account.user.patientId)}&source=self`}><BilingualText copy={{ bn: "আমার সেবা খুলুন", en: "Open My Care" }} /></Link></ClayCard> : <ClayCard><BilingualText copy={{ bn: "আগে স্ক্রিনিং শেষ করুন; এরপর এখানে সেবার তথ্য সংরক্ষণ করা যাবে।", en: "Complete a screening first; you can then save its care information here." }} /></ClayCard>}</section><section className="section-block"><SectionHeading title={{ bn: "স্মরণ করিয়ে দিন", en: "Reminders" }} description={{ bn: "ইমেইলে স্বাস্থ্য বা রেফারেলের বিস্তারিত যাবে না।", en: "Emails never include health or referral details." }} /><ClayCard><form onSubmit={addReminder} className="account-form"><label><BilingualText copy={{ bn: "তারিখ ও সময়", en: "Date and time" }} /><input name="scheduledFor" type="datetime-local" required /></label><label className="check-row"><input name="emailOptIn" type="checkbox" /><BilingualText copy={{ bn: "সাধারণ ইমেইল রিমাইন্ডার পাঠান", en: "Send a generic email reminder" }} /></label><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "রিমাইন্ডার যোগ করুন", en: "Add reminder" }} /></button></form>{reminders.map((reminder) => <div className="account-reminder" key={reminder.reminder_id}><span lang="en">{new Date(reminder.scheduled_for).toLocaleString()}</span><StatusPill label={{ bn: reminder.status, en: reminder.status }} />{reminder.status === "PENDING" && <span><button className="button button-secondary" type="button" onClick={() => void finishReminder(reminder.reminder_id, "COMPLETED")}><BilingualText copy={{ bn: "সম্পন্ন", en: "Done" }} /></button><button className="button button-secondary" type="button" onClick={() => void finishReminder(reminder.reminder_id, "DISMISSED")}><BilingualText copy={{ bn: "বাদ দিন", en: "Dismiss" }} /></button></span>}</div>)}</ClayCard></section></>;
}

function AdminInvites({ notice, onInvite, language }: { notice: string; onInvite: (event: FormEvent<HTMLFormElement>) => void; language: "bn" | "en" }) {
  return <section className="section-block"><SectionHeading title={{ bn: "স্টাফ আমন্ত্রণ", en: "Invite staff" }} description={{ bn: "শুধু অনুমোদিত কর্মীদের ইমেইল দিয়ে ভূমিকা দিন।", en: "Assign roles only to approved staff by email." }} /><ClayCard><form onSubmit={onInvite} className="account-form"><label><BilingualText copy={{ bn: "ইমেইল", en: "Email" }} /><input name="inviteEmail" type="email" required /></label><label><BilingualText copy={{ bn: "কাজের ভূমিকা", en: "Workspace role" }} /><select name="role" defaultValue="PHARMACY_STAFF"><option value="PHARMACY_STAFF">Pharmacy staff</option><option value="TB_CENTRE_STAFF">TB-centre staff</option><option value="GOVERNMENT_VIEWER">Government viewer</option></select></label><label><BilingualText copy={{ bn: "ফার্মেসি বা কেন্দ্রের আইডি (সরকারের জন্য খালি রাখুন)", en: "Pharmacy or centre ID (leave blank for government)" }} /><input name="scope" /></label><button className="button button-primary" type="submit"><BilingualText copy={{ bn: "আমন্ত্রণ পাঠান", en: "Send invitation" }} /></button>{notice && <p role="status">{message(language, notice)}</p>}</form></ClayCard></section>;
}
