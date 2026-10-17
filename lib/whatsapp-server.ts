import "server-only";

import { CHANNEL_AUDIO_LIMIT_BYTES } from "@/lib/channel-audio";
import { handleChannelEvent, type IncomingChannelEvent } from "@/lib/messaging-server";

type WhatsAppMessage = {
  id?: unknown;
  from?: unknown;
  type?: unknown;
  text?: { body?: unknown };
  button?: { text?: unknown };
  interactive?: {
    button_reply?: { title?: unknown };
    list_reply?: { title?: unknown };
  };
  audio?: { id?: unknown; mime_type?: unknown };
};

type WhatsAppConfiguration = {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
};

function configuration(): WhatsAppConfiguration | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  if (!accessToken || !/^\d{5,30}$/.test(phoneNumberId ?? "") || !/^v\d+\.\d+$/.test(graphVersion ?? "")) return null;
  return { accessToken, phoneNumberId: phoneNumberId!, graphVersion: graphVersion! };
}

function graphUrl(config: WhatsAppConfiguration, path: string) {
  return `https://graph.facebook.com/${config.graphVersion}/${path}`;
}

function allowedMediaHost(hostname: string) {
  return ["facebook.com", "fbcdn.net", "fbsbx.com", "whatsapp.net"]
    .some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

async function downloadWhatsAppAudio(mediaId: string, fallbackMime: string) {
  const config = configuration();
  if (!config) throw new Error("WHATSAPP_NOT_CONFIGURED");
  const metadataResponse = await fetch(graphUrl(config, encodeURIComponent(mediaId)), {
    headers: { authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!metadataResponse.ok) throw new Error("WHATSAPP_MEDIA_LOOKUP_FAILED");
  const metadata = await metadataResponse.json() as Record<string, unknown>;
  const mediaUrl = new URL(String(metadata.url ?? ""));
  if (mediaUrl.protocol !== "https:" || !allowedMediaHost(mediaUrl.hostname)) {
    throw new Error("WHATSAPP_MEDIA_URL_INVALID");
  }
  const declaredSize = Number(metadata.file_size ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > CHANNEL_AUDIO_LIMIT_BYTES) {
    throw new Error("AUDIO_TOO_LARGE");
  }
  const mediaResponse = await fetch(mediaUrl, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!mediaResponse.ok) throw new Error("WHATSAPP_MEDIA_DOWNLOAD_FAILED");
  const contentLength = Number(mediaResponse.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > CHANNEL_AUDIO_LIMIT_BYTES) {
    throw new Error("AUDIO_TOO_LARGE");
  }
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  if (bytes.byteLength > CHANNEL_AUDIO_LIMIT_BYTES) throw new Error("AUDIO_TOO_LARGE");
  return {
    bytes,
    mimeType: String(metadata.mime_type ?? mediaResponse.headers.get("content-type") ?? fallbackMime),
  };
}

function messageText(message: WhatsAppMessage) {
  const candidates = [
    message.text?.body,
    message.button?.text,
    message.interactive?.button_reply?.title,
    message.interactive?.list_reply?.title,
  ];
  const value = candidates.find((candidate) => typeof candidate === "string");
  return typeof value === "string" ? value : undefined;
}

export function parseWhatsAppEvents(payload: unknown): IncomingChannelEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];
  const events: IncomingChannelEvent[] = [];
  for (const entry of entries) {
    const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown }).changes : null;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change && typeof change === "object" ? (change as { value?: unknown }).value : null;
      const messages = value && typeof value === "object" ? (value as { messages?: unknown }).messages : null;
      if (!Array.isArray(messages)) continue;
      for (const rawMessage of messages) {
        if (!rawMessage || typeof rawMessage !== "object") continue;
        const message = rawMessage as WhatsAppMessage;
        const eventId = typeof message.id === "string" ? message.id : "";
        const externalUserId = typeof message.from === "string" ? message.from : "";
        if (!eventId || !/^\d{8,20}$/.test(externalUserId)) continue;
        const audioId = typeof message.audio?.id === "string" ? message.audio.id : null;
        const audioMime = typeof message.audio?.mime_type === "string" ? message.audio.mime_type : "audio/ogg";
        events.push({
          provider: "WHATSAPP",
          eventId,
          externalUserId,
          ...(messageText(message) ? { text: messageText(message) } : {}),
          ...(audioId ? {
            audio: {
              declaredMimeType: audioMime,
              load: async () => (await downloadWhatsAppAudio(audioId, audioMime)).bytes,
            },
          } : {}),
        });
      }
    }
  }
  return events;
}

export async function processWhatsAppPayload(payload: unknown) {
  const replies: Array<{ to: string; text: string }> = [];
  for (const event of parseWhatsAppEvents(payload)) {
    const result = await handleChannelEvent(event);
    if (result.response) replies.push({ to: event.externalUserId, text: result.response });
  }
  return replies;
}

export async function sendWhatsAppText(to: string, text: string) {
  const config = configuration();
  if (!config) throw new Error("WHATSAPP_NOT_CONFIGURED");
  const response = await fetch(graphUrl(config, `${config.phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("WHATSAPP_SEND_FAILED");
}
