import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type AccountRole = "PATIENT" | "PHARMACY_STAFF" | "TB_CENTRE_STAFF" | "GOVERNMENT_VIEWER" | "PLATFORM_ADMIN";
type Role = Exclude<AccountRole, "PATIENT">;

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

function secretConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function isAccountAuthConfigured() {
  return publicConfig() !== null && secretConfig() !== null;
}

export function createAdminClient() {
  const config = secretConfig();
  if (!config) return null;
  return createClient(config.url, config.key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function currentAuthUser(): Promise<User | null> {
  const config = publicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
}

export async function currentMemberships(userId: string) {
  const admin = createAdminClient();
  if (!admin) return [] as { role: Role; pharmacy_id: string | null; tb_center_id: string | null }[];
  const { data } = await admin.from("staff_memberships")
    .select("role, pharmacy_id, tb_center_id")
    .eq("user_id", userId)
    .eq("active", true);
  return (data ?? []) as { role: Role; pharmacy_id: string | null; tb_center_id: string | null }[];
}

export async function hasRole(userId: string, role: Role, scopeId?: string) {
  const memberships = await currentMemberships(userId);
  return memberships.some((membership) => membership.role === "PLATFORM_ADMIN"
    || (membership.role === role && (!scopeId || membership.pharmacy_id === scopeId || membership.tb_center_id === scopeId)));
}

export function primaryAccountRole(memberships: { role: Role }[]): AccountRole {
  const roles = new Set(memberships.map((membership) => membership.role));
  if (roles.has("PLATFORM_ADMIN")) return "PLATFORM_ADMIN";
  if (roles.has("GOVERNMENT_VIEWER")) return "GOVERNMENT_VIEWER";
  if (roles.has("TB_CENTRE_STAFF")) return "TB_CENTRE_STAFF";
  if (roles.has("PHARMACY_STAFF")) return "PHARMACY_STAFF";
  return "PATIENT";
}

export function roleHome(role: AccountRole) {
  if (role === "PHARMACY_STAFF") return "/pharmacy";
  if (role === "TB_CENTRE_STAFF") return "/verify";
  if (role === "GOVERNMENT_VIEWER" || role === "PLATFORM_ADMIN") return "/dashboard";
  return "/account";
}

export type StaffRole = Role;
