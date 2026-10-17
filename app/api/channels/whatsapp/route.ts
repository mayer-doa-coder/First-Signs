import { NextResponse } from "next/server";
import { constantTimeEqual, verifyMetaSignature } from "@/lib/channel-security";
import { processWhatsAppPayload, sendWhatsAppText } from "@/lib/whatsapp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  if (mode !== "subscribe" || !expected || !constantTimeEqual(token, expected) || !/^\d{1,20}$/.test(challenge)) {
    return new NextResponse("Forbidden", { status: 403, headers: responseHeaders });
  }
  return new NextResponse(challenge, { status: 200, headers: { ...responseHeaders, "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "WHATSAPP_NOT_CONFIGURED" }, { status: 503, headers: responseHeaders });
  const rawBody = await request.text();
  if (rawBody.length > 2_000_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: responseHeaders });
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 401, headers: responseHeaders });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK_PAYLOAD" }, { status: 400, headers: responseHeaders });
  }
  try {
    const replies = await processWhatsAppPayload(payload);
    for (const reply of replies) await sendWhatsAppText(reply.to, reply.text);
    return NextResponse.json({ received: true }, { headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 503, headers: responseHeaders });
  }
}
