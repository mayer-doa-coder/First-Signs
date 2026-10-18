import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/auth";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const emailPattern = /^\S+@\S+\.\S+$/;

function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createAdminClient();
  if (!url || !key || !admin) return fail("ACCOUNT_AUTH_NOT_CONFIGURED", 503);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (name.length < 2 || !usernamePattern.test(username) || !emailPattern.test(email)
    || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return fail("INVALID_SIGNUP", 400);
  }

  const { data: existingUsername } = await admin.from("account_profiles").select("user_id").eq("username", username).maybeSingle();
  if (existingUsername) return fail("USERNAME_UNAVAILABLE", 409);

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const client = createServerClient(url.replace(/\/$/, ""), key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { pendingCookies.push(...cookies); },
    },
  });
  const origin = new URL(request.url).origin;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: name, username }, emailRedirectTo: `${origin}/auth/callback?next=/account` },
  });
  if (error || !data.user || data.user.identities?.length === 0) return fail("SIGNUP_FAILED", 409);

  const { error: profileError } = await admin.from("account_profiles").insert({
    user_id: data.user.id,
    email,
    display_name: name,
    username,
    account_role: "PATIENT",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id, false);
    return fail(profileError.code === "23505" ? "USERNAME_UNAVAILABLE" : "SIGNUP_FAILED", 409);
  }

  const response = NextResponse.json({ signedUp: true, confirmationRequired: !data.session, redirectTo: "/account" }, { headers });
  pendingCookies.forEach(({ name: cookieName, value, options }) => response.cookies.set(cookieName, value, options));
  return response;
}
