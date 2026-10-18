import assert from "node:assert/strict";
import { test } from "node:test";
import { processChannelAudio } from "../lib/channel-audio.ts";
import { telegramEntryLink } from "../lib/messaging-links.ts";
import { nativeTelegramRequest, requestTelegramWithRetry, type TelegramRequest } from "../lib/telegram-http.ts";
import { downloadTelegramAudio } from "../lib/telegram-media.ts";

test("self-use and pharmacy links preserve the intended source", () => {
  const selfTelegram = telegramEntryLink("@JvhDemoBot", { source: "SELF" });
  const pharmacyTelegram = telegramEntryLink("JvhDemoBot", {
    source: "PHARMACY",
    pharmacyId: "DEMO-KHL-RAHMAN",
  });

  assert.equal(new URL(selfTelegram!).searchParams.get("start"), "self");
  assert.equal(new URL(pharmacyTelegram!).searchParams.get("start"), "pharmacy_DEMO-KHL-RAHMAN");
  assert.equal(telegramEntryLink("bad", { source: "SELF" }), null);
});

test("channel audio uses the shared lowercase SHA-256 path and rejects invalid files", async () => {
  const ogg = new Uint8Array(2_048);
  ogg.set(new TextEncoder().encode("OggS"));
  const result = await processChannelAudio(ogg, "audio/ogg; codecs=opus");
  assert.match(result.audioHash, /^[0-9a-f]{64}$/);
  assert.equal(result.byteLength, 2_048);
  assert.equal(result.mimeType, "audio/ogg");

  await assert.rejects(() => processChannelAudio(ogg, "text/html"), /UNSUPPORTED_AUDIO_TYPE/);
  await assert.rejects(() => processChannelAudio(new Uint8Array(2_048), "audio/ogg"), /INVALID_AUDIO_FILE/);
  await assert.rejects(() => processChannelAudio(ogg.slice(0, 100), "audio/ogg"), /AUDIO_TOO_SHORT/);
});

test("Telegram voice downloads allow provider CDN redirects without a referrer", async () => {
  const calls: RequestInit[] = [];
  const ogg = new Uint8Array(2_048);
  ogg.set(new TextEncoder().encode("OggS"));

  const fetchStub: typeof fetch = async (_input, init) => {
    calls.push(init ?? {});
    if (calls.length === 1) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file_1.ogg" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(ogg, {
      status: 200,
      headers: { "content-type": "audio/ogg", "content-length": String(ogg.byteLength) },
    });
  };

  const bytes = await downloadTelegramAudio("voice-file", ogg.byteLength, "test-token", fetchStub);
  assert.deepEqual(bytes, ogg);
  assert.equal(calls[1]?.redirect, "follow");
  assert.equal(calls[1]?.referrerPolicy, "no-referrer");
});

test("Telegram media download failures retain only a safe HTTP status code", async () => {
  const fetchStub: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file_1.ogg" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, { status: 502 });
  };

  await assert.rejects(
    () => downloadTelegramAudio("voice-file", 2_048, "test-token", fetchStub),
    /TELEGRAM_MEDIA_DOWNLOAD_HTTP_502/,
  );
});

test("Telegram media network failures retain only a safe network code", async () => {
  const fetchStub: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file_1.ogg" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const error = new TypeError("network request failed");
    Object.assign(error, { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    throw error;
  };

  await assert.rejects(
    () => downloadTelegramAudio("voice-file", 2_048, "test-token", fetchStub),
    /TELEGRAM_MEDIA_DOWNLOAD_NETWORK_UND_ERR_CONNECT_TIMEOUT/,
  );
});

test("Telegram media lookup retries transient network failures", async () => {
  const ogg = new Uint8Array(2_048);
  ogg.set(new TextEncoder().encode("OggS"));
  let calls = 0;
  const fetchStub: typeof fetch = async (_input, init) => {
    calls += 1;
    if (calls === 1) throw new TypeError("temporary network issue");
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file_1.ogg" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(ogg, { status: 200, headers: { "content-length": String(ogg.byteLength) } });
  };

  assert.deepEqual(await downloadTelegramAudio("voice-file", ogg.byteLength, "test-token", fetchStub), ogg);
  assert.equal(calls, 3);
});

test("Telegram outbound replies retry transient server responses without changing the payload", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const requestStub: TelegramRequest = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? new Response(null, { status: 503 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const body = JSON.stringify({ chat_id: "1234", text: "safe response" });

  const response = await requestTelegramWithRetry(
    "https://api.telegram.org/bottest/sendMessage",
    { method: "POST", headers: { "content-type": "application/json" }, body },
    { failurePrefix: "TELEGRAM_SEND", maximumBytes: 262_144, timeoutMs: 8_000, requestImpl: requestStub },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.init.body, body);
  assert.equal(calls[1]?.init.body, body);
});

test("Telegram outbound replies do not retry permanent authorization failures", async () => {
  let calls = 0;
  const requestStub: TelegramRequest = async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  };

  await assert.rejects(
    () => requestTelegramWithRetry(
      "https://api.telegram.org/bottest/sendMessage",
      { method: "POST", body: "{}" },
      { failurePrefix: "TELEGRAM_SEND", maximumBytes: 262_144, timeoutMs: 8_000, requestImpl: requestStub },
    ),
    /TELEGRAM_SEND_HTTP_401/,
  );
  assert.equal(calls, 1);
});

test("native Telegram transport rejects non-Telegram hosts before connecting", async () => {
  await assert.rejects(
    () => nativeTelegramRequest("https://example.com/file", { method: "GET" }, 1_024, 1_000),
    /Invalid Telegram transport host/,
  );
});
