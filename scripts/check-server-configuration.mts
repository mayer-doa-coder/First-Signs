import nextEnv from "@next/env";
import {
  formatServerConfigurationReport,
  inspectServerConfiguration,
} from "../lib/server-configuration.ts";

nextEnv.loadEnvConfig(process.cwd());

const report = inspectServerConfiguration();
for (const line of formatServerConfigurationReport(report)) console.log(line);

if (!report.coreReady) {
  console.error("[JVH configuration] Core checks failed. Add the missing variable names to .env.local or your deployment environment, then restart the server.");
  process.exitCode = 1;
}
