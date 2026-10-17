import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const action = process.argv[2];
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
const appUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

function fail(message) {
  console.error(`[telegram:webhook] ${message}`);
  process.exitCode = 1;
}

function required(value, name) {
  if (!value) {
    fail(`Missing ${name}. Add it to .env.local or the current environment.`);
    return false;
  }
  return true;
}

function publicWebhookUrl() {
  try {
    const origin = new URL(appUrl);
    if (origin.protocol !== "https:") throw new Error("not HTTPS");
    return new URL("/api/channels/telegram", origin).toString();
  } catch {
    fail("APP_URL or NEXT_PUBLIC_APP_URL must be a public HTTPS URL.");
    return null;
  }
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    fail(`Telegram ${method} failed (HTTP ${response.status}). Check the bot token, public URL, and Telegram response in a private terminal.`);
    return null;
  }
  return result.result;
}

if (action === "set") {
  if (!required(botToken, "TELEGRAM_BOT_TOKEN") || !required(webhookSecret, "TELEGRAM_WEBHOOK_SECRET")) process.exit();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    fail("TELEGRAM_WEBHOOK_SECRET must contain 1–256 URL-safe letters, digits, underscores, or hyphens.");
  } else {
    const url = publicWebhookUrl();
    if (url) {
      const result = await telegram("setWebhook", {
        url,
        secret_token: webhookSecret,
        allowed_updates: ["message"],
      });
      if (result !== null) console.log(`[telegram:webhook] Webhook set for ${new URL(url).host}/api/channels/telegram.`);
    }
  }
} else if (action === "status") {
  if (required(botToken, "TELEGRAM_BOT_TOKEN")) {
    const result = await telegram("getWebhookInfo");
    if (result !== null) {
      const endpoint = typeof result.url === "string" ? new URL(result.url) : null;
      console.log(JSON.stringify({
        endpoint: endpoint ? `${endpoint.host}${endpoint.pathname}` : null,
        pendingUpdateCount: Number(result.pending_update_count ?? 0),
        lastErrorDate: result.last_error_date ?? null,
        lastErrorMessage: result.last_error_message ?? null,
      }, null, 2));
    }
  }
} else {
  console.error("Usage: npm run telegram:webhook:set | npm run telegram:webhook:status");
  process.exitCode = 1;
}
