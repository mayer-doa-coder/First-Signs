import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient, currentMemberships, primaryAccountRole, roleHome } from "@/lib/auth";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createAdminClient();
  if (!url || !key || !admin) return fail("ACCOUNT_AUTH_NOT_CONFIGURED", 503);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!identifier || !password) return fail("INVALID_CREDENTIALS", 400);

  let email = identifier;
  if (!identifier.includes("@")) {
    const { data } = await admin.from("account_profiles").select("email").eq("username", identifier).maybeSingle();
    email = data?.email ?? "invalid-account@invalid.local";
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const client = createServerClient(url.replace(/\/$/, ""), key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { pendingCookies.push(...cookies); },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return fail("INVALID_CREDENTIALS", 401);

  const memberships = await currentMemberships(data.user.id);
  const primaryRole = primaryAccountRole(memberships);
  const response = NextResponse.json({ signedIn: true, primaryRole, redirectTo: roleHome(primaryRole) }, { headers });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
