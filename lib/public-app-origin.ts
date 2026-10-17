import "server-only";

import { headers } from "next/headers";
import { lanIpv4Addresses } from "@/lib/lan-network";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}

function parseHttpOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname === "::1";
}

function replaceDevelopmentLocalOrigin(origin: string) {
  const url = new URL(origin);
  if (process.env.NODE_ENV !== "development") return url.origin;

  const lanAddress = lanIpv4Addresses()[0];
  if (!lanAddress || !isLoopback(url.hostname)) return url.origin;

  url.hostname = lanAddress;
  return url.origin;
}

export async function getPublicAppOrigin() {
  const configuredOrigin = parseHttpOrigin(
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  );
  if (configuredOrigin) return configuredOrigin;

  const requestHeaders = await headers();
  const host = firstHeaderValue(requestHeaders.get("x-forwarded-host"))
    ?? firstHeaderValue(requestHeaders.get("host"));
  const protocol = firstHeaderValue(requestHeaders.get("x-forwarded-proto"))
    ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const requestOrigin = parseHttpOrigin(host ? `${protocol}://${host}` : undefined)
    ?? "http://localhost:3000";

  return replaceDevelopmentLocalOrigin(requestOrigin);
}
