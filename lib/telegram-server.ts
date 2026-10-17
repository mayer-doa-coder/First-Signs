import "server-only";

import { handleChannelEvent, type IncomingChannelEvent } from "@/lib/messaging-server";
import { requestTelegramWithRetry } from "@/lib/telegram-http";
import { downloadTelegramAudio } from "@/lib/telegram-media";

type TelegramMessage = {
  message_id?: unknown;
  chat?: { id?: unknown; type?: unknown };
  text?: unknown;
  caption?: unknown;
  voice?: { file_id?: unknown; file_size?: unknown; mime_type?: unknown };
  audio?: { file_id?: unknown; file_size?: unknown; mime_type?: unknown };
};

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value || !/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(value)) throw new Error("TELEGRAM_NOT_CONFIGURED");
  return value;
}

function apiUrl(method: string) {
  return `https://api.telegram.org/bot${token()}/${method}`;
}

export function parseTelegramEvent(payload: unknown): IncomingChannelEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const update = payload as { update_id?: unknown; message?: unknown };
  if (!Number.isSafeInteger(update.update_id) || !update.message || typeof update.message !== "object") return null;
  const message = update.message as TelegramMessage;
  if (message.chat?.type !== "private") return null;
  const chatId = String(message.chat.id ?? "");
  if (!/^\d{1,20}$/.test(chatId)) return null;
  const media = message.voice ?? message.audio;
  const fileId = typeof media?.file_id === "string" ? media.file_id : null;
  const declaredMimeType = typeof media?.mime_type === "string" ? media.mime_type : "audio/ogg";
  const declaredSize = Number(media?.file_size ?? 0);
  const text = typeof message.text === "string"
    ? message.text
    : typeof message.caption === "string" ? message.caption : undefined;
  return {
    provider: "TELEGRAM",
    eventId: String(update.update_id),
    externalUserId: chatId,
    ...(text ? { text } : {}),
    ...(fileId ? {
      audio: {
        declaredMimeType,
        load: () => downloadTelegramAudio(fileId, declaredSize, token()),
      },
    } : {}),
  };
}

export async function processTelegramPayload(payload: unknown) {
  const event = parseTelegramEvent(payload);
  if (!event) return null;
  const result = await handleChannelEvent(event);
  return result.response ? { chatId: event.externalUserId, text: result.response } : null;
}

export async function sendTelegramText(chatId: string, text: string) {
  await requestTelegramWithRetry(
    apiUrl("sendMessage"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    },
    {
      failurePrefix: "TELEGRAM_SEND",
      maximumBytes: 256 * 1024,
      timeoutMs: 8_000,
    },
  );
}
