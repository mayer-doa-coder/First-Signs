import { request as httpsRequest } from "node:https";

const RETRY_DELAYS_MS = [300, 750] as const;
const MAX_REDIRECTS = 3;

export type TelegramRequest = (
  url: string,
  init: RequestInit,
  maximumBytes: number,
  timeoutMs: number,
) => Promise<Response>;

type FailurePrefix =
  | "TELEGRAM_MEDIA_LOOKUP"
  | "TELEGRAM_MEDIA_DOWNLOAD"
  | "TELEGRAM_SEND";

function safeNetworkCode(error: unknown) {
  const directCode = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : null;
  const cause = error instanceof Error ? error.cause : null;
  const causeCode = cause && typeof cause === "object" && "code" in cause
    ? (cause as { code?: unknown }).code
    : null;
  const code = typeof directCode === "string" ? directCode : causeCode;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "UNKNOWN";
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function allowedTelegramHost(hostname: string) {
  return hostname === "api.telegram.org"
    || hostname.endsWith(".telegram.org")
    || hostname === "telegram-cdn.org"
    || hostname.endsWith(".telegram-cdn.org")
    || hostname === "telesco.pe"
    || hostname.endsWith(".telesco.pe");
}

function responseHeaders(headers: Record<string, string | string[] | undefined>) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item));
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

function networkError(message: string, code: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

async function nativeTelegramRequestInternal(
  url: URL,
  init: RequestInit,
  maximumBytes: number,
  timeoutMs: number,
  redirects: number,
): Promise<Response> {
  if (url.protocol !== "https:" || !allowedTelegramHost(url.hostname)) {
    throw networkError("Invalid Telegram transport host", "TELEGRAM_HOST_INVALID");
  }
  const body = typeof init.body === "string" ? Buffer.from(init.body, "utf8") : undefined;
  if (init.body !== undefined && body === undefined) {
    throw networkError("Unsupported Telegram request body", "TELEGRAM_BODY_INVALID");
  }
  const headers = new Headers(init.headers);
  if (body) headers.set("content-length", String(body.byteLength));

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method ?? "GET",
      headers: Object.fromEntries(headers.entries()),
      family: 4,
    }, (incoming) => {
      const status = incoming.statusCode ?? 502;
      const location = incoming.headers.location;
      if (status >= 300 && status < 400 && location) {
        incoming.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(networkError("Too many Telegram redirects", "TELEGRAM_REDIRECT_LIMIT"));
          return;
        }
        let redirected: URL;
        try {
          redirected = new URL(location, url);
        } catch {
          reject(networkError("Invalid Telegram redirect", "TELEGRAM_REDIRECT_INVALID"));
          return;
        }
        const switchToGet = status === 303
          || ((status === 301 || status === 302) && (init.method ?? "GET") === "POST");
        const redirectedInit = switchToGet
          ? { ...init, method: "GET", body: undefined }
          : init;
        void nativeTelegramRequestInternal(
          redirected,
          redirectedInit,
          maximumBytes,
          timeoutMs,
          redirects + 1,
        ).then(resolve, reject);
        return;
      }

      const contentLength = Number(incoming.headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        incoming.destroy(networkError("Telegram response too large", "TELEGRAM_RESPONSE_TOO_LARGE"));
        reject(networkError("Telegram response too large", "TELEGRAM_RESPONSE_TOO_LARGE"));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      incoming.on("data", (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > maximumBytes) {
          incoming.destroy(networkError("Telegram response too large", "TELEGRAM_RESPONSE_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => {
        if (received > maximumBytes) {
          reject(networkError("Telegram response too large", "TELEGRAM_RESPONSE_TOO_LARGE"));
          return;
        }
        resolve(new Response(Buffer.concat(chunks), {
          status,
          headers: responseHeaders(incoming.headers),
        }));
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(networkError("Telegram request timed out", "ETIMEDOUT"));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export const nativeTelegramRequest: TelegramRequest = (url, init, maximumBytes, timeoutMs) => (
  nativeTelegramRequestInternal(new URL(url), init, maximumBytes, timeoutMs, 0)
);

export async function requestTelegramWithRetry(
  url: string,
  init: RequestInit,
  options: {
    failurePrefix: FailurePrefix;
    maximumBytes: number;
    timeoutMs: number;
    requestImpl?: TelegramRequest;
  },
) {
  const requestImpl = options.requestImpl ?? nativeTelegramRequest;
  let lastNetworkCode = "UNKNOWN";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await requestImpl(url, init, options.maximumBytes, options.timeoutMs);
      if (response.ok) return response;
      if (!shouldRetryStatus(response.status) || attempt === 2) {
        throw new Error(`${options.failurePrefix}_HTTP_${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${options.failurePrefix}_HTTP_`)) {
        throw error;
      }
      lastNetworkCode = safeNetworkCode(error);
    }
    if (attempt < RETRY_DELAYS_MS.length) await pause(RETRY_DELAYS_MS[attempt]);
  }
  throw new Error(`${options.failurePrefix}_NETWORK_${lastNetworkCode}`);
}
