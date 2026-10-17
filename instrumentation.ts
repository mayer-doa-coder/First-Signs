export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { formatServerConfigurationReport, inspectServerConfiguration } = await import("./lib/server-configuration");
  const report = inspectServerConfiguration();
  for (const line of formatServerConfigurationReport(report)) {
    if (report.coreReady || !line.includes("Core Supabase backend")) console.info(line);
    else console.warn(line);
  }
}
