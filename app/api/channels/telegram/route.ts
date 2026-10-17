import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/channel-security";
import { processTelegramPayload, sendTelegramText } from "@/lib/telegram-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const maximumPayloadBytes = 256 * 1024;

function isWebhookSecret(value: string) {
  return /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function hasValidWebhookSecret(supplied: string) {
  const current = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET_PREVIOUS ?? "";
  return (isWebhookSecret(current) && constantTimeEqual(supplied, current))
    || (isWebhookSecret(previous) && constantTimeEqual(supplied, previous));
}

export async function POST(request: Request) {
  const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!hasValidWebhookSecret(supplied)) {
    return NextResponse.json({ error: "INVALID_WEBHOOK_SECRET" }, { status: 401, headers: responseHeaders });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > maximumPayloadBytes) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: responseHeaders });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK_PAYLOAD" }, { status: 400, headers: responseHeaders });
  }
  try {
    const reply = await processTelegramPayload(payload);
    if (reply) await sendTelegramText(reply.chatId, reply.text);
    return NextResponse.json({ received: true }, { headers: responseHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_WEBHOOK_FAILED";
    const safeCode = /^TELEGRAM_(?:SEND|MEDIA_(?:LOOKUP|DOWNLOAD))_(?:HTTP_\d{3}|NETWORK_[A-Z][A-Z0-9_]{0,63})$/.test(code)
      || ["TELEGRAM_MEDIA_LOOKUP_RESPONSE_INVALID", "TELEGRAM_MEDIA_PATH_INVALID"].includes(code)
      ? code
      : "TELEGRAM_WEBHOOK_FAILED";
    // Never log chat IDs, update payloads, media paths, URLs, or credentials.
    console.warn(`[JVH Telegram webhook] failed: ${safeCode}`);
    return NextResponse.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 503, headers: responseHeaders });
  }
}
