import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination = new URL(next?.startsWith("/") ? next : "/account", url.origin);
  const response = NextResponse.redirect(destination);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !supabaseUrl || !publishableKey) return NextResponse.redirect(new URL("/account?auth=unavailable", url.origin));
  const client = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => request.headers.get("cookie")?.split(";").map((entry) => {
        const [name, ...rest] = entry.trim().split("=");
        return { name, value: rest.join("=") };
      }) ?? [],
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/account?auth=failed", url.origin));
  return response;
}
