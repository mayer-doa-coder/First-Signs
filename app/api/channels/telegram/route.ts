import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/channel-security";
import { processTelegramPayload, sendTelegramText } from "@/lib/telegram-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !constantTimeEqual(supplied, expected)) {
    return NextResponse.json({ error: "INVALID_WEBHOOK_SECRET" }, { status: 401, headers: responseHeaders });
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
