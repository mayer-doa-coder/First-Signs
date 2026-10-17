import { hashUploadedAudio } from "./audio-hash.ts";

const MIN_AUDIO_BYTES = 1_024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/amr",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

export type ChannelAudioResult = {
  audioHash: string;
  byteLength: number;
  mimeType: string;
};

function normalizedMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function hasRecognizedAudioHeader(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  if (ascii(bytes, 0, 4) === "OggS") return true;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return true;
  if (ascii(bytes, 0, 3) === "ID3") return true;
  if (ascii(bytes, 4, 4) === "ftyp") return true;
  if (ascii(bytes, 0, 5) === "#!AMR") return true;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/**
 * Performs the shared, provider-neutral part of the prototype audio pipeline.
 * It validates the declared audio type, size, and container signature, creates
 * the same lowercase SHA-256 digest used by web uploads, and retains no bytes.
 * Acoustic decoding and HeAR inference happen in the separate transient model
 * service; this boundary intentionally performs no persistence.
 */
export async function processChannelAudio(
  bytes: Uint8Array,
  declaredMimeType: string,
): Promise<ChannelAudioResult> {
  const mimeType = normalizedMimeType(declaredMimeType);
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) throw new Error("UNSUPPORTED_AUDIO_TYPE");
  if (bytes.byteLength < MIN_AUDIO_BYTES) throw new Error("AUDIO_TOO_SHORT");
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("AUDIO_TOO_LARGE");
  if (!hasRecognizedAudioHeader(bytes)) throw new Error("INVALID_AUDIO_FILE");

  const audioBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(audioBuffer).set(bytes);
  const audioHash = await hashUploadedAudio(new Blob([audioBuffer], { type: mimeType }));
  return { audioHash, byteLength: bytes.byteLength, mimeType };
}

export const CHANNEL_AUDIO_LIMIT_BYTES = MAX_AUDIO_BYTES;
