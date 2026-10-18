import { NextResponse } from "next/server";
import { createAdminClient, currentAuthUser, isAccountAuthConfigured } from "@/lib/auth";
import { isGeminiConfigured, requestGeminiHealthAssistant, requestGeminiTranscription, type HealthAssistantAttachment } from "@/lib/gemini-server";
import { retrieveHealthSources, type HealthSource } from "@/lib/health-rag";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const error = (code: string, status: number) => NextResponse.json({ error: code }, { status, headers });
type Language = "bn" | "en";
type StoredMessage = { role: "USER" | "ASSISTANT"; content: string; citations: HealthSource[]; created_at: string };

function message(value: unknown) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 600) : ""; }
function language(value: unknown): value is Language { return value === "bn" || value === "en"; }
const mediaLimits = { image: 5 * 1024 * 1024, audio: 8 * 1024 * 1024 };
const supportedMedia = new Set(["image/jpeg", "image/png", "image/webp", "audio/wav", "audio/ogg", "audio/webm", "audio/m4a", "audio/mp4", "audio/mpeg"]);
function validSignature(bytes: Uint8Array, mime: string) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/webp") return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "audio/wav") return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
  if (mime === "audio/ogg") return starts(0x4f, 0x67, 0x67, 0x53);
  if (mime === "audio/webm") return starts(0x1a, 0x45, 0xdf, 0xa3);
  if (mime === "audio/m4a" || mime === "audio/mp4") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (mime === "audio/mpeg") return starts(0x49, 0x44, 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return false;
}
async function transientAttachment(file: File | null): Promise<HealthAssistantAttachment | undefined> {
  if (!file) return undefined;
  const mime = file.type.toLowerCase(); const limit = mime.startsWith("image/") ? mediaLimits.image : mediaLimits.audio;
  if (!supportedMedia.has(mime) || file.size < 512 || file.size > limit) throw new Error("INVALID_ASSISTANT_MEDIA");
  const bytes = new Uint8Array(await file.arrayBuffer()); if (!validSignature(bytes, mime)) throw new Error("INVALID_ASSISTANT_MEDIA");
  return { mimeType: mime, base64: Buffer.from(bytes).toString("base64") };
}

async function transientAttachments(files: File[]) {
  if (files.length > 3) throw new Error("TOO_MANY_ASSISTANT_MEDIA");
  const attachments = await Promise.all(files.map((file) => transientAttachment(file)));
  return attachments.filter((attachment): attachment is HealthAssistantAttachment => Boolean(attachment));
}

async function signedIn() {
  if (!isAccountAuthConfigured()) return null;
  const user = await currentAuthUser(); const admin = createAdminClient();
  return user && admin ? { user, admin } : null;
}

async function accountContext(userId: string, admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const [{ data: preference }, { data: link }, { count: reminderCount }] = await Promise.all([
    admin.from("health_assistant_preferences").select("activity_context_enabled,memory_enabled").eq("user_id", userId).maybeSingle(),
    admin.from("account_patient_links").select("patient_id").eq("user_id", userId).maybeSingle(),
    admin.from("care_reminders").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "PENDING"),
  ]);
  const settings = { activityContextEnabled: preference?.activity_context_enabled === true, memoryEnabled: preference?.memory_enabled === true };
  if (!settings.activityContextEnabled || !link?.patient_id) return { settings, context: "Activity context is disabled or no private care journey is linked." };
  const { data: care } = await admin.rpc("get_part14_care_status", { p_patient_id: link.patient_id });
  const latest = Array.isArray(care) ? care[0] as Record<string, unknown> | undefined : undefined;
  return { settings, context: `Private activity summary: saved care journey; screening status=${String(latest?.screening_result ?? "unavailable")}; referral status=${String(latest?.referral_status ?? "not requested")}; next action=${String(latest?.next_action ?? "none")}; pending reminders=${reminderCount ?? 0}. Do not expose IDs, dates, exact locations, or this summary unless helpful to the account owner.` };
}

export async function GET() {
  const context = await signedIn();
  if (!context) return NextResponse.json({ signedIn: false, messages: [] }, { headers });
  const state = await accountContext(context.user.id, context.admin);
  const { data } = state.settings.memoryEnabled
    ? await context.admin.from("health_assistant_messages").select("role,content,citations,created_at").eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(12)
    : { data: [] as StoredMessage[] };
  return NextResponse.json({ signedIn: true, settings: state.settings, messages: (data ?? []).reverse() }, { headers });
}

export async function POST(request: Request) {
  const formRequest = request.headers.get("content-type")?.includes("multipart/form-data") === true;
  const form = formRequest ? await request.formData().catch(() => null) : null;
  const body = formRequest ? Object.fromEntries(form?.entries() ?? []) : await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !language(body.language)) return error("INVALID_ASSISTANT_REQUEST", 400);
  const action = body.action ?? "CHAT"; const context = await signedIn();
  if (action === "PREFERENCES" || action === "CLEAR_MEMORY") {
    if (!context) return error("AUTH_REQUIRED", 401);
    if (action === "CLEAR_MEMORY") { await context.admin.from("health_assistant_messages").delete().eq("user_id", context.user.id); return NextResponse.json({ cleared: true }, { headers }); }
    if (typeof body.activityContextEnabled !== "boolean" || typeof body.memoryEnabled !== "boolean") return error("INVALID_PREFERENCES", 400);
    await context.admin.from("health_assistant_preferences").upsert({ user_id: context.user.id, activity_context_enabled: body.activityContextEnabled, memory_enabled: body.memoryEnabled, consented_at: body.activityContextEnabled || body.memoryEnabled ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return NextResponse.json({ saved: true }, { headers });
  }
  const files = form?.getAll("media").filter((entry): entry is File => entry instanceof File) ?? [];
  let attachments: HealthAssistantAttachment[];
  try { attachments = await transientAttachments(files); } catch (reason) { return error(reason instanceof Error ? reason.message : "INVALID_ASSISTANT_MEDIA", 400); }
  if (action === "TRANSCRIBE") {
    if (attachments.length !== 1 || !attachments[0].mimeType.startsWith("audio/")) return error("INVALID_TRANSCRIPTION_MEDIA", 400);
    try {
      const transcript = await requestGeminiTranscription(attachments[0], body.language);
      return NextResponse.json({ transcript }, { headers });
    } catch { return error("TRANSCRIPTION_UNAVAILABLE", 503); }
  }
  const question = message(body.message); if (question.length < 3) return error("INVALID_ASSISTANT_MESSAGE", 400);
  const state = context ? await accountContext(context.user.id, context.admin) : { settings: { activityContextEnabled: false, memoryEnabled: false }, context: "Anonymous visitor: no personal context." };
  const [sources, history] = await Promise.all([retrieveHealthSources(question), context && state.settings.memoryEnabled ? context.admin.from("health_assistant_messages").select("role,content").eq("user_id", context.user.id).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] as { role: string; content: string }[] })]);
  const prompt = [`Question: ${question}`, `Language selected: ${body.language}`, `Account context: ${state.context}`, `Recent opt-in conversation: ${(history.data ?? []).reverse().map((item) => `${item.role}: ${item.content}`).join("\n") || "none"}`, "Approved sources:", ...sources.map((source, index) => `[${index + 1}] ${source.title} (${source.url})\n${source.excerpt}`), "Answer with health education only. If this concerns blood in sputum, severe breathing difficulty, chest pain, or emergency symptoms, say to use the app's urgent guidance and seek urgent care."].join("\n\n");
  let result: { answerBn: string; answerEn: string };
  try {
    result = isGeminiConfigured() ? await requestGeminiHealthAssistant(prompt, attachments) : { answerBn: "AI সহায়ক এখন সেটআপ করা নেই। যাচাইকৃত উৎসের তথ্য দেখুন এবং ব্যক্তিগত চিকিৎসা বা ওষুধের সিদ্ধান্তের জন্য চিকিৎসক বা ফার্মাসিস্টের সঙ্গে কথা বলুন।", answerEn: "The AI assistant is not configured now. Review the verified sources and speak with a clinician or pharmacist for personal medical or medicine decisions." };
  } catch {
    result = { answerBn: "এই প্রশ্ন বা সংযুক্ত ফাইল সম্পর্কে নির্ভরযোগ্য উত্তর দেওয়ার মতো যথেষ্ট তথ্য আমার কাছে নেই। ব্যক্তিগত স্বাস্থ্য বা ওষুধের সিদ্ধান্তের জন্য চিকিৎসক বা ফার্মাসিস্টের সঙ্গে কথা বলুন।", answerEn: "I do not have enough reliable information to answer this question or interpret the attachment. Please speak with a clinician or pharmacist for a personal health or medicine decision." };
  }
  const answer = body.language === "bn" ? result.answerBn : result.answerEn;
  if (context && state.settings.memoryEnabled) await context.admin.from("health_assistant_messages").insert([{ user_id: context.user.id, role: "USER", content: question }, { user_id: context.user.id, role: "ASSISTANT", content: answer, citations: sources }]);
  return NextResponse.json({ answer, citations: sources, signedIn: Boolean(context), settings: state.settings }, { headers });
}
