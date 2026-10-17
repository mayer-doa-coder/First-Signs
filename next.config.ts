import type { NextConfig } from "next";
import { lanIpv4Addresses } from "./lib/lan-network";

function configuredDevelopmentHost() {
  const configuredUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

const configuredHost = configuredDevelopmentHost();
const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set([
    ...lanIpv4Addresses(),
    ...(configuredHost ? [configuredHost] : []),
  ])],
};

export default nextConfig;
