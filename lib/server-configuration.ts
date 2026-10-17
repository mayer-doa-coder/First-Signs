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
  const hasHearUrl = validHttpUrl(environment.HEAR_SERVICE_URL);
  const hasHearToken = configured(environment, "HEAR_SERVICE_TOKEN");
  const hasWhatsAppVariables = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_GRAPH_VERSION",
    "MESSAGING_ID_SECRET",
  ].every((name) => configured(environment, name));
  const hasTelegramVariables = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "MESSAGING_ID_SECRET",
  ].every((name) => configured(environment, name));

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
      "whatsapp",
      "WhatsApp webhook",
      [
        "APP_URL or NEXT_PUBLIC_APP_URL",
        "MESSAGING_ID_SECRET",
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_APP_SECRET",
        "WHATSAPP_VERIFY_TOKEN",
        "WHATSAPP_GRAPH_VERSION",
      ],
      hasPublicAppUrl && hasWhatsAppVariables,
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
