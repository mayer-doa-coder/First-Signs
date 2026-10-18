export type ConfigurationIssue = {
  id: string;
  label: string;
  variables: string[];
  status: "ready" | "disabled" | "incomplete";
};

export type ServerConfigurationReport = {
  coreReady: boolean;
  coreMissing: string[];
  recommended: ConfigurationIssue[];
  optional: ConfigurationIssue[];
};

type Environment = Record<string, string | undefined>;

function configured(environment: Environment, name: string) {
  return Boolean(environment[name]?.trim());
}

function validHttpUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validHearServiceUrl(value: string | undefined, environment: Environment) {
  if (!validHttpUrl(value)) return false;
  const hostname = new URL(value!).hostname.toLowerCase();
  const isLoopback = hostname === "localhost"
    || hostname === "::1"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0";
  // A Render/production Next.js service does not run the Python model server
  // on its loopback interface. Requiring a separate reachable service avoids
  // silently falling back for every uploaded voice message.
  return environment.NODE_ENV !== "production" || !isLoopback;
}

function validTelegramWebhookSecret(value: string | undefined) {
  return Boolean(value && /^[A-Za-z0-9_-]{1,256}$/.test(value));
}

function integration(
  id: string,
  label: string,
  variables: string[],
  isReady: boolean,
): ConfigurationIssue {
  return {
    id,
    label,
    variables,
    status: isReady ? "ready" : "disabled",
  };
}

/**
 * Reports configuration names and states only. Values and secrets must never
 * be logged or sent to a browser.
 */
export function inspectServerConfiguration(
  environment: Environment = process.env,
): ServerConfigurationReport {
  const hasSupabaseUrl = validHttpUrl(environment.SUPABASE_URL);
  const hasSupabaseSecret = configured(environment, "SUPABASE_SECRET_KEY")
    || configured(environment, "SUPABASE_SERVICE_ROLE_KEY");
  const coreMissing = [
    ...(hasSupabaseUrl ? [] : ["SUPABASE_URL (valid http(s) URL)"]),
    ...(hasSupabaseSecret ? [] : ["SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY"]),
  ];

  const publicAppUrl = environment.APP_URL ?? environment.NEXT_PUBLIC_APP_URL;
  const hasPublicAppUrl = validHttpUrl(publicAppUrl);
  const hasHearUrl = validHearServiceUrl(environment.HEAR_SERVICE_URL, environment);
  const hasHearToken = configured(environment, "HEAR_SERVICE_TOKEN");
  const hasTelegramVariables = configured(environment, "TELEGRAM_BOT_TOKEN")
    && validTelegramWebhookSecret(environment.TELEGRAM_WEBHOOK_SECRET)
    && configured(environment, "MESSAGING_ID_SECRET");

  const optional: ConfigurationIssue[] = [
    integration(
      "tb-centre-verification",
      "TB-centre verification",
      ["TB_CENTRE_STAFF_PIN"],
      configured(environment, "TB_CENTRE_STAFF_PIN"),
    ),
    integration(
      "gemini",
      "Gemini companion",
      ["GEMINI_API_KEY"],
      configured(environment, "GEMINI_API_KEY"),
    ),
    integration(
      "hear",
      "HeAR acoustic processing",
      ["HEAR_SERVICE_URL", "HEAR_SERVICE_TOKEN"],
      hasHearUrl && hasHearToken,
    ),
    integration(
      "telegram",
      "Telegram webhook",
      [
        "APP_URL or NEXT_PUBLIC_APP_URL",
        "MESSAGING_ID_SECRET",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_WEBHOOK_SECRET",
      ],
      hasPublicAppUrl && hasTelegramVariables,
    ),
  ];

  return {
    coreReady: coreMissing.length === 0,
    coreMissing,
    recommended: [
      {
        id: "public-app-url",
        label: "Stable public application URL",
        variables: ["APP_URL or NEXT_PUBLIC_APP_URL"],
        status: hasPublicAppUrl ? "ready" : "incomplete",
      },
    ],
    optional,
  };
}

export function formatServerConfigurationReport(report: ServerConfigurationReport) {
  const lines = [
    report.coreReady
      ? "[JVH configuration] Core Supabase backend: ready."
      : `[JVH configuration] Core Supabase backend: incomplete (${report.coreMissing.join(", ")}).`,
  ];

  for (const issue of report.recommended) {
    if (issue.status === "ready") continue;
    lines.push(`[JVH configuration] Recommended: ${issue.label} is incomplete (${issue.variables.join(", ")}).`);
  }

  const disabled = report.optional.filter((issue) => issue.status !== "ready");
  if (disabled.length) {
    lines.push(`[JVH configuration] Optional integrations disabled: ${disabled.map((issue) => issue.label).join("; ")}. Run npm run check:config for required variable names.`);
  }

  return lines;
}
