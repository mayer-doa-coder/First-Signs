import { CHANNEL_AUDIO_LIMIT_BYTES } from "./channel-audio.ts";
import { requestTelegramWithRetry, type TelegramRequest } from "./telegram-http.ts";

const TELEGRAM_JSON_LIMIT_BYTES = 256 * 1024;
const TELEGRAM_FILE_LIMIT_BYTES = 20 * 1024 * 1024;

/**
 * Downloads a short Telegram voice message without retaining it. The caller is
 * responsible for keeping the bot token server-only.
 */
export async function downloadTelegramAudio(
  fileId: string,
  declaredSize: number,
  botToken: string,
  requestImpl?: TelegramRequest,
) {
  if (declaredSize > CHANNEL_AUDIO_LIMIT_BYTES) throw new Error("AUDIO_TOO_LARGE");

  const lookupResponse = await requestTelegramWithRetry(
    `https://api.telegram.org/bot${botToken}/getFile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      cache: "no-store",
    },
    {
      failurePrefix: "TELEGRAM_MEDIA_LOOKUP",
      maximumBytes: TELEGRAM_JSON_LIMIT_BYTES,
      timeoutMs: 8_000,
      requestImpl,
    },
  );

  const lookup = await lookupResponse.json() as Record<string, unknown>;
  const result = lookup.ok === true && lookup.result && typeof lookup.result === "object"
    ? lookup.result as Record<string, unknown>
    : null;
  if (!result) throw new Error("TELEGRAM_MEDIA_LOOKUP_RESPONSE_INVALID");
  const filePath = String(result?.file_path ?? "");
  if (!/^[A-Za-z0-9_./-]{1,255}$/.test(filePath) || filePath.includes("..")) {
    throw new Error("TELEGRAM_MEDIA_PATH_INVALID");
  }

  const response = await requestTelegramWithRetry(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
    {
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    },
    {
      failurePrefix: "TELEGRAM_MEDIA_DOWNLOAD",
      maximumBytes: TELEGRAM_FILE_LIMIT_BYTES,
      timeoutMs: 12_000,
      requestImpl,
    },
  );
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > CHANNEL_AUDIO_LIMIT_BYTES) {
    throw new Error("AUDIO_TOO_LARGE");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > CHANNEL_AUDIO_LIMIT_BYTES) throw new Error("AUDIO_TOO_LARGE");
  return bytes;
}
