import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { getBroadArea, screeningAreas } from "@/lib/broad-areas";
import { processChannelAudio } from "@/lib/channel-audio";
import { analyzeWithHear, type HearResult } from "@/lib/hear-audio";
import { followUpActionCopy, type FollowUpAction, type FollowUpBarrier } from "@/lib/follow-ups";
import { getActivePharmacy } from "@/lib/pharmacies";
import type { ReferralSymptomAnswers } from "@/lib/referrals";
import { evaluateSafetyRules, SAFETY_OUTCOMES, type SafetyOutcome } from "@/lib/safety-rules";
import { callReferralRpc, callSupabaseRpc, isReferralDatabaseConfigured } from "@/lib/supabase-server";
import { getRecommendedCentre } from "@/lib/tb-centres";

export type MessagingProvider = "WHATSAPP" | "TELEGRAM";
type ChannelLanguage = "bn" | "en";
type ChannelStage =
  | "AWAITING_LANGUAGE"
  | "AWAITING_CONSENT"
  | "COUGH_DAYS"
  | "FEVER"
  | "NIGHT_SWEATS"
  | "WEIGHT_LOSS"
  | "BLOOD_IN_SPUTUM"
  | "TB_EXPOSURE"
  | "AREA"
  | "AUDIO"
  | "REFERRAL_CHOICE"
  | "FOLLOW_UP_BARRIER"
  | "COMPLETE"
  | "STOPPED";

type ChannelState = {
  screeningId: string;
  answers?: Partial<ReferralSymptomAnswers>;
  areaName?: string;
  audioStatus?: "uploaded" | "skipped";
  audioHash?: string;
  screeningOutcome?: SafetyOutcome;
  referralId?: string;
  accessToken?: string;
  tbCenterId?: string;
};

type ChannelSession = {
  channelKey: string;
  provider: MessagingProvider;
  patientId: string;
  sourceType: "SELF" | "PHARMACY";
  pharmacyId?: string;
  language: ChannelLanguage;
  stage: ChannelStage;
  state: ChannelState;
  version: number;
};

export type IncomingChannelEvent = {
  provider: MessagingProvider;
  eventId: string;
  externalUserId: string;
  text?: string;
  audio?: {
    declaredMimeType: string;
    load: () => Promise<Uint8Array>;
  };
};

export type ChannelEventResult = {
  response: string | null;
  replayed: boolean;
};

const STAGES = new Set<ChannelStage>([
  "AWAITING_LANGUAGE", "AWAITING_CONSENT", "COUGH_DAYS", "FEVER",
  "NIGHT_SWEATS", "WEIGHT_LOSS", "BLOOD_IN_SPUTUM", "TB_EXPOSURE",
  "AREA", "AUDIO", "REFERRAL_CHOICE", "FOLLOW_UP_BARRIER", "COMPLETE", "STOPPED",
]);
const PATIENT_ID_PATTERN = /^JVH-DEMO-[A-F0-9]{8}$/;
const SCREENING_ID_PATTERN = /^JVH-SCR-[A-F0-9]{32}$/;
const CHANNEL_KEY_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StartContext =
  | { kind: "none" }
  | { kind: "valid"; sourceType: "SELF" | "PHARMACY"; pharmacyId?: string }
  | { kind: "invalid" };

function textFor(language: ChannelLanguage, copy: { bn: string; en: string }) {
  return copy[language];
}

function webOrigin() {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("PUBLIC_APP_URL_NOT_CONFIGURED");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("PUBLIC_APP_URL_INVALID");
  return url.origin;
}

function absoluteWebLink(path: string) {
  return new URL(path, webOrigin()).toString();
}

function careLink(session: ChannelSession) {
  const query = new URLSearchParams({
    patient: session.patientId,
    source: session.sourceType === "SELF" ? "self" : "pharmacy",
  });
  if (session.pharmacyId) query.set("pharmacy", session.pharmacyId);
  return absoluteWebLink(`/care?${query.toString()}`);
}

function identityFor(provider: MessagingProvider, externalUserId: string) {
  const secret = process.env.MESSAGING_ID_SECRET;
  if (!secret || secret.length < 32) throw new Error("MESSAGING_ID_SECRET_NOT_CONFIGURED");
  if (!/^\d{1,20}$/.test(externalUserId)) throw new Error("INVALID_CHANNEL_USER");
  const digest = createHmac("sha256", secret)
    .update(`${provider}:${externalUserId}`, "utf8")
    .digest("hex");
  return {
    channelKey: digest,
    patientId: `JVH-DEMO-${digest.slice(0, 8).toUpperCase()}`,
  };
}

function createScreeningId() {
  return `JVH-SCR-${randomBytes(16).toString("hex").toUpperCase()}`;
}

function parseStart(provider: MessagingProvider, value: string | undefined): StartContext {
  const text = value?.trim() ?? "";
  if (!text) return { kind: "none" };

  let payload: string | null = null;
  if (provider === "TELEGRAM") {
    const match = text.match(/^\/start(?:@[A-Za-z][A-Za-z0-9_]{4,31})?(?:\s+([^\s]+))?$/i);
    if (!match) return { kind: "none" };
    payload = match[1]?.trim() ?? "self";
    if (payload.toLowerCase() === "self") return { kind: "valid", sourceType: "SELF" };
    const pharmacyMatch = payload.match(/^pharmacy_([A-Za-z0-9_-]+)$/i);
    if (!pharmacyMatch) return { kind: "invalid" };
    const pharmacy = getActivePharmacy(pharmacyMatch[1]);
    return pharmacy
      ? { kind: "valid", sourceType: "PHARMACY", pharmacyId: pharmacy.id }
      : { kind: "invalid" };
  }

  const match = text.match(/^START(?:\s+(SELF|PHARMACY)(?:\s+([A-Za-z0-9_-]+))?)?$/i);
  if (!match) return { kind: "none" };
  if (!match[1] || match[1].toUpperCase() === "SELF") {
    return match[2] ? { kind: "invalid" } : { kind: "valid", sourceType: "SELF" };
  }
  const pharmacy = getActivePharmacy(match[2]);
  return pharmacy
    ? { kind: "valid", sourceType: "PHARMACY", pharmacyId: pharmacy.id }
    : { kind: "invalid" };
}

function initialSession(
  provider: MessagingProvider,
  channelKey: string,
  patientId: string,
  entry: Extract<StartContext, { kind: "valid" }>,
  version: number,
): ChannelSession {
  return {
    channelKey,
    provider,
    patientId,
    sourceType: entry.sourceType,
    ...(entry.pharmacyId ? { pharmacyId: entry.pharmacyId } : {}),
    language: "bn",
    stage: "AWAITING_LANGUAGE",
    state: { screeningId: createScreeningId() },
    version,
  };
}

function languagePrompt() {
  return [
    "ফার্স্ট সাইনস — স্ক্রিনিং ও সেবার দিকনির্দেশনা। এটি যক্ষ্মা রোগ নির্ণয় করে না।",
    "ভাষা বেছে নিন: 1 বাংলা  |  2 English",
    "First Signs — screening and care navigation. This does not diagnose TB.",
    `Website backup: ${absoluteWebLink("/screen?source=self")}`,
  ].join("\n\n");
}

function invalidEntryPrompt() {
  return [
    "ফার্মেসি লিংকটি সঠিক বা সক্রিয় নয়। বাড়ি থেকে শুরু করতে START SELF লিখুন।",
    "The pharmacy link is invalid or inactive. Send START SELF to begin from home.",
    `Website backup: ${absoluteWebLink("/")}`,
  ].join("\n\n");
}

function parseSessionRow(row: Record<string, unknown>): ChannelSession | null {
  const channelKey = String(row.channel_key ?? "");
  const provider = row.provider;
  const patientId = String(row.patient_id ?? "");
  const sourceType = row.source_type;
  const pharmacyId = row.pharmacy_id === null ? undefined : String(row.pharmacy_id ?? "");
  const language = row.language;
  const stage = row.stage;
  const state = row.state;
  const version = Number(row.version);
  if (!CHANNEL_KEY_PATTERN.test(channelKey)
    || (provider !== "WHATSAPP" && provider !== "TELEGRAM")
    || !PATIENT_ID_PATTERN.test(patientId)
    || (sourceType !== "SELF" && sourceType !== "PHARMACY")
    || (sourceType === "SELF" ? pharmacyId !== undefined : !getActivePharmacy(pharmacyId))
    || (language !== "bn" && language !== "en")
    || typeof stage !== "string" || !STAGES.has(stage as ChannelStage)
    || !state || typeof state !== "object" || Array.isArray(state)
    || !SCREENING_ID_PATTERN.test(String((state as ChannelState).screeningId ?? ""))
    || !Number.isSafeInteger(version) || version < 1) return null;
  return {
    channelKey,
    provider,
    patientId,
    sourceType,
    ...(pharmacyId ? { pharmacyId } : {}),
    language,
    stage: stage as ChannelStage,
    state: state as ChannelState,
    version,
  };
}

async function loadSession(channelKey: string) {
  const rows = await callReferralRpc<Record<string, unknown>>("get_part16_channel_session", {
    p_channel_key: channelKey,
  });
  if (!rows[0]) return null;
  const session = parseSessionRow(rows[0]);
  if (!session) throw new Error("CHANNEL_SESSION_INVALID");
  return session;
}

async function saveSession(session: ChannelSession) {
  const rows = await callReferralRpc<Record<string, unknown>>("save_part16_channel_session", {
    p_channel_key: session.channelKey,
    p_provider: session.provider,
    p_patient_id: session.patientId,
    p_source_type: session.sourceType,
    p_pharmacy_id: session.pharmacyId ?? null,
    p_language: session.language,
    p_stage: session.stage,
    p_state: session.state,
    p_expected_version: session.version,
  });
  const saved = rows[0] ? parseSessionRow(rows[0]) : null;
  if (!saved) throw new Error("CHANNEL_SESSION_SAVE_FAILED");
  return saved;
}

async function beginEvent(session: ChannelSession, eventId: string) {
  const rows = await callReferralRpc<Record<string, unknown>>("begin_part16_channel_event", {
    p_provider: session.provider,
    p_event_id: eventId,
    p_channel_key: session.channelKey,
  });
  const row = rows[0];
  if (!row || typeof row.should_process !== "boolean") throw new Error("CHANNEL_EVENT_CLAIM_FAILED");
  return {
    shouldProcess: row.should_process,
    previousResponse: row.previous_response === null ? null : String(row.previous_response ?? ""),
  };
}

async function completeEvent(session: ChannelSession, eventId: string, response: string) {
  const completed = await callSupabaseRpc<boolean>("complete_part16_channel_event", {
    p_provider: session.provider,
    p_event_id: eventId,
    p_channel_key: session.channelKey,
    p_response_text: response,
  });
  if (completed !== true) throw new Error("CHANNEL_EVENT_COMPLETE_FAILED");
}

async function releaseEvent(session: ChannelSession, eventId: string) {
  await callSupabaseRpc<boolean>("release_part16_channel_event", {
    p_provider: session.provider,
    p_event_id: eventId,
    p_channel_key: session.channelKey,
  }).catch(() => false);
}

function consentPrompt(session: ChannelSession) {
  const entry = session.sourceType === "PHARMACY"
    ? textFor(session.language, {
        bn: `এই স্ক্রিনিংটি ${getActivePharmacy(session.pharmacyId)?.name.bn ?? "ফার্মেসি"}-এর সহায়তায় হচ্ছে।`,
        en: `This screening is being assisted by ${getActivePharmacy(session.pharmacyId)?.name.en ?? "the pharmacy"}.`,
      })
    : textFor(session.language, {
        bn: "আপনি নিজের ডিভাইস থেকে যাচাই করছেন।",
        en: "You are checking from your own device.",
      });
  return `${entry}\n\n${textFor(session.language, {
    bn: "এটি স্ক্রিনিং ও সেবার দিকনির্দেশনা—যক্ষ্মা রোগ নির্ণয় নয়। আপনি যেকোনো সময় থামতে পারেন। সম্মত হলে 1, থামতে 2 লিখুন।",
    en: "This is screening and care navigation—not a TB diagnosis. You can stop at any time. Send 1 to agree and continue, or 2 to stop.",
  })}`;
}

function yesNoPrompt(language: ChannelLanguage, copy: { bn: string; en: string }) {
  return `${textFor(language, copy)}\n${textFor(language, { bn: "1 হ্যাঁ  |  2 না", en: "1 Yes  |  2 No" })}`;
}

function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["1", "yes", "y", "হ্যাঁ", "হ্যা"].includes(normalized)) return true;
  if (["2", "no", "n", "না"].includes(normalized)) return false;
  return null;
}

function normalizeBanglaDigits(value: string) {
  const bangla = "০১২৩৪৫৬৭৮৯";
  return Array.from(value, (character) => {
    const index = bangla.indexOf(character);
    return index >= 0 ? String(index) : character;
  }).join("");
}

function fullAnswers(session: ChannelSession): ReferralSymptomAnswers {
  const answers = session.state.answers;
  if (!answers || !Number.isSafeInteger(answers.coughDays)
    || typeof answers.fever !== "boolean"
    || typeof answers.nightSweats !== "boolean"
    || typeof answers.weightLoss !== "boolean"
    || typeof answers.bloodInSputum !== "boolean"
    || typeof answers.tbExposure !== "boolean") throw new Error("CHANNEL_ANSWERS_INCOMPLETE");
  return answers as ReferralSymptomAnswers;
}

async function persistScreening(session: ChannelSession, outcome: SafetyOutcome) {
  const area = getBroadArea(session.state.areaName);
  if (!area) throw new Error("CHANNEL_AREA_INVALID");
  const audioStatus = session.state.audioStatus;
  if (audioStatus !== "uploaded" && audioStatus !== "skipped") throw new Error("CHANNEL_AUDIO_INCOMPLETE");
  await callReferralRpc("save_part11_screening", {
    p_screening_id: session.state.screeningId,
    p_patient_id: session.patientId,
    p_source_type: session.sourceType,
    p_pharmacy_id: session.pharmacyId ?? null,
    p_area_name: area.id,
    p_area_latitude: area.latitude,
    p_area_longitude: area.longitude,
    p_symptom_answers: fullAnswers(session),
    p_audio_status: audioStatus,
    p_audio_hash: session.state.audioHash ?? null,
    p_screening_result: outcome,
  });
}

function resultText(session: ChannelSession, outcome: SafetyOutcome) {
  if (outcome === SAFETY_OUTCOMES.URGENT_EVALUATION) {
    return textFor(session.language, {
      bn: "কাশির সঙ্গে রক্তের জন্য দ্রুত চিকিৎসা মূল্যায়ন নিন। বেশি রক্ত, শ্বাসকষ্ট, খুব দ্রুত হৃদস্পন্দন, বা বুক/পিঠের ওপরের অংশে ব্যথা হলে এখনই ৯৯৯-এ কল করুন বা হাসপাতালের জরুরি বিভাগে যান। এটি যক্ষ্মা রোগ নির্ণয় নয়।",
      en: "Seek prompt medical evaluation for blood in sputum. If there is more than a few spots of blood, breathing difficulty, a very fast heartbeat, or chest/upper-back pain, call 999 or go to an emergency department now. This is not a TB diagnosis.",
    });
  }
  if (outcome === SAFETY_OUTCOMES.FORMAL_EVALUATION) {
    return textFor(session.language, {
      bn: "আপনার স্ক্রিনিং বলছে যে আনুষ্ঠানিক যক্ষ্মা মূল্যায়নের পরামর্শ দেওয়া হচ্ছে। এটি যক্ষ্মা রোগ নির্ণয় নয়।",
      en: "Your screening suggests that formal TB evaluation is recommended. This is not a TB diagnosis.",
    });
  }
  return textFor(session.language, {
    bn: "বর্তমান উত্তরে জরুরি বা আনুষ্ঠানিক মূল্যায়নের নির্দিষ্ট মানদণ্ড মেলেনি। এতে যক্ষ্মা বা অন্য অসুস্থতা নেই—এমন প্রমাণ হয় না। উপসর্গ থাকলে বা বাড়লে চিকিৎসাসেবা নিন।",
    en: "Your answers did not meet a fixed urgent or formal-evaluation criterion. This does not rule out TB or another illness. Seek medical care if symptoms persist or worsen.",
  });
}

async function completeAudioStep(session: ChannelSession) {
  const outcome = evaluateSafetyRules(fullAnswers(session));
  await persistScreening(session, outcome);
  session.state.screeningOutcome = outcome;
  if (outcome === SAFETY_OUTCOMES.CONTINUE) {
    session.stage = "COMPLETE";
    return `${resultText(session, outcome)}\n\n${textFor(session.language, {
      bn: "আপনার সেবার তথ্য:", en: "Your care information:",
    })} ${careLink(session)}`;
  }
  session.stage = "REFERRAL_CHOICE";
  return `${resultText(session, outcome)}\n\n${textFor(session.language, {
    bn: "নিকটবর্তী যাচাইকৃত যক্ষ্মা সেবাকেন্দ্রে রেফারেল তৈরি করতে 1, এখন না করতে 2 লিখুন।",
    en: "Send 1 to create a referral to a nearby verified TB centre, or 2 for not now.",
  })}`;
}

async function createReferral(session: ChannelSession) {
  const area = getBroadArea(session.state.areaName);
  const outcome = session.state.screeningOutcome;
  if (!area || !outcome || outcome === SAFETY_OUTCOMES.CONTINUE) throw new Error("CHANNEL_REFERRAL_INVALID");
  const recommended = getRecommendedCentre(area);
  if (!recommended) throw new Error("CHANNEL_CENTRE_NOT_FOUND");
  const rows = await callReferralRpc<Record<string, unknown>>("create_part9_referral", {
    p_screening_id: session.state.screeningId,
    p_patient_id: session.patientId,
    p_source_type: session.sourceType,
    p_pharmacy_id: session.pharmacyId ?? null,
    p_area_name: area.id,
    p_area_latitude: area.latitude,
    p_area_longitude: area.longitude,
    p_symptom_answers: fullAnswers(session),
    p_audio_status: session.state.audioStatus,
    p_audio_hash: session.state.audioHash ?? null,
    p_screening_result: outcome,
    p_tb_center_id: recommended.centre.id,
  });
  const row = rows[0];
  const referralId = String(row?.referral_id ?? "");
  const accessToken = String(row?.access_token ?? "");
  if (!/^JVH-KHU-\d{5,}$/.test(referralId) || !UUID_PATTERN.test(accessToken)) {
    throw new Error("CHANNEL_REFERRAL_RESPONSE_INVALID");
  }
  session.state.referralId = referralId;
  session.state.accessToken = accessToken;
  session.state.tbCenterId = recommended.centre.id;
  session.stage = "COMPLETE";
  const referralUrl = absoluteWebLink(`/referral?${new URLSearchParams({ token: accessToken })}`);
  return textFor(session.language, {
    bn: `রেফারেল তৈরি হয়েছে: ${referralId}\nকেন্দ্র: ${recommended.centre.name.bn}\nরেফারেল ও QR: ${referralUrl}\nআমার সেবা: ${careLink(session)}\nএটি যক্ষ্মা রোগ নির্ণয় নয়। উপস্থিত হতে না পারলে MISSED লিখুন।`,
    en: `Referral created: ${referralId}\nCentre: ${recommended.centre.name.en}\nReferral and QR: ${referralUrl}\nMy Care: ${careLink(session)}\nThis is not a TB diagnosis. Send MISSED if you could not attend.`,
  });
}

async function careStatusResponse(session: ChannelSession) {
  const rows = await callReferralRpc<Record<string, unknown>>("get_part14_care_status", {
    p_patient_id: session.patientId,
  });
  const row = rows[0];
  if (!row) return textFor(session.language, {
    bn: "এখনো কোনো সম্পূর্ণ স্ক্রিনিং সংরক্ষিত হয়নি।", en: "No completed screening has been saved yet.",
  });
  const outcome = String(row.screening_result ?? "") as SafetyOutcome;
  const referralStatus = row.referral_status === null ? "NOT_REQUESTED" : String(row.referral_status);
  const nextAction = row.next_action === null ? null : String(row.next_action) as FollowUpAction;
  const statusText = referralStatus === "COMPLETED"
    ? textFor(session.language, { bn: "আনুষ্ঠানিক মূল্যায়নে উপস্থিতি নিশ্চিত হয়েছে।", en: "Formal evaluation attendance confirmed." })
    : referralStatus === "FOLLOW_UP"
      ? textFor(session.language, { bn: "রেফারেলের ফলো-আপ দরকার।", en: "Referral follow-up is needed." })
      : referralStatus === "PENDING"
        ? textFor(session.language, { bn: "রেফারেল অপেক্ষমাণ।", en: "Referral is pending." })
        : textFor(session.language, { bn: "কোনো রেফারেল তৈরি হয়নি।", en: "No referral was created." });
  const next = nextAction && followUpActionCopy[nextAction]
    ? `\n${textFor(session.language, followUpActionCopy[nextAction].title)}`
    : "";
  return `${resultText(session, outcome)}\n${statusText}${next}\n${careLink(session)}`;
}

const barrierByChoice: Record<string, FollowUpBarrier> = {
  "1": "WORK_SCHEDULE",
  "2": "CENTRE_TOO_FAR",
  "3": "FEAR",
  "4": "STIGMA",
  "5": "TRANSPORT_PROBLEM",
  "6": "DID_NOT_UNDERSTAND",
  "7": "OTHER",
};

function barrierPrompt(language: ChannelLanguage) {
  return textFor(language, {
    bn: "কেন যেতে পারেননি?\n1 কাজের সময়\n2 কেন্দ্র অনেক দূরে\n3 ভয়\n4 লোকলজ্জা/বৈষম্য\n5 যাতায়াত সমস্যা\n6 বুঝিনি\n7 অন্য কারণ",
    en: "Why could you not attend?\n1 Work schedule\n2 Centre too far\n3 Fear\n4 Stigma/discrimination\n5 Transport problem\n6 Did not understand\n7 Other",
  });
}

async function beginFollowUp(session: ChannelSession) {
  const token = session.state.accessToken;
  if (!token || !UUID_PATTERN.test(token)) return textFor(session.language, {
    bn: "ফলো-আপের জন্য কোনো রেফারেল পাওয়া যায়নি।", en: "No referral is available for follow-up.",
  });
  const rows = await callReferralRpc<Record<string, unknown>>("simulate_part12_follow_up", {
    p_access_token: token,
  });
  if (!rows[0]) return textFor(session.language, {
    bn: "এই রেফারেলটি ফলো-আপ করা যাচ্ছে না। আমার সেবা দেখুন।", en: "This referral cannot be moved to follow-up. Check My Care.",
  });
  session.stage = "FOLLOW_UP_BARRIER";
  return barrierPrompt(session.language);
}

async function saveBarrier(session: ChannelSession, barrier: FollowUpBarrier) {
  const token = session.state.accessToken;
  if (!token) throw new Error("CHANNEL_FOLLOW_UP_TOKEN_MISSING");
  const rows = await callReferralRpc<Record<string, unknown>>("save_part12_follow_up_barrier", {
    p_access_token: token,
    p_barrier: barrier,
  });
  const nextAction = String(rows[0]?.next_action ?? "") as FollowUpAction;
  const action = followUpActionCopy[nextAction];
  if (!action) throw new Error("CHANNEL_FOLLOW_UP_RESPONSE_INVALID");
  session.stage = "COMPLETE";
  return `${textFor(session.language, action.title)}\n${textFor(session.language, action.detail)}\n${careLink(session)}`;
}

async function processTurn(session: ChannelSession, event: IncomingChannelEvent) {
  const rawText = event.text?.trim().slice(0, 500) ?? "";
  const command = rawText.toUpperCase();
  if (command === "STATUS" || command === "CARE" || command === "আমার সেবা") {
    return { session, response: await careStatusResponse(session), changed: false };
  }
  if (command === "MISSED" || command === "FOLLOWUP" || command === "FOLLOW-UP") {
    const response = await beginFollowUp(session);
    return { session, response, changed: session.stage === "FOLLOW_UP_BARRIER" };
  }

  let response: string;
  switch (session.stage) {
    case "AWAITING_LANGUAGE": {
      if (rawText === "2" || rawText.toLowerCase() === "english") session.language = "en";
      else if (rawText === "1" || rawText === "বাংলা" || rawText.toLowerCase() === "bangla") session.language = "bn";
      else return { session, response: languagePrompt(), changed: false };
      session.stage = "AWAITING_CONSENT";
      response = consentPrompt(session);
      break;
    }
    case "AWAITING_CONSENT": {
      const answer = parseYesNo(rawText);
      if (answer === null) return { session, response: consentPrompt(session), changed: false };
      if (!answer) {
        session.stage = "STOPPED";
        response = textFor(session.language, {
          bn: "স্ক্রিনিং থামানো হয়েছে। আবার শুরু করতে START SELF লিখুন।",
          en: "Screening stopped. Send START SELF to begin again.",
        });
        break;
      }
      session.stage = "COUGH_DAYS";
      response = textFor(session.language, {
        bn: "আপনার কাশি কত দিন ধরে? পূর্ণ সংখ্যা লিখুন—কাশি না থাকলে 0।",
        en: "How many days have you had a cough? Send a whole number, or 0 for no cough.",
      });
      break;
    }
    case "COUGH_DAYS": {
      const normalized = normalizeBanglaDigits(rawText);
      if (!/^\d{1,4}$/.test(normalized) || Number(normalized) > 3650) {
        return { session, response: textFor(session.language, {
          bn: "0 থেকে 3650-এর মধ্যে পূর্ণ দিনের সংখ্যা লিখুন।", en: "Send a whole number of days from 0 to 3650.",
        }), changed: false };
      }
      session.state.answers = { ...session.state.answers, coughDays: Number(normalized) };
      session.stage = "FEVER";
      response = yesNoPrompt(session.language, { bn: "আপনার কি জ্বর আছে?", en: "Do you have a fever?" });
      break;
    }
    case "FEVER":
    case "NIGHT_SWEATS":
    case "WEIGHT_LOSS":
    case "BLOOD_IN_SPUTUM":
    case "TB_EXPOSURE": {
      const answer = parseYesNo(rawText);
      if (answer === null) return { session, response: textFor(session.language, {
        bn: "1 হ্যাঁ অথবা 2 না লিখুন।", en: "Send 1 for Yes or 2 for No.",
      }), changed: false };
      const mapping = {
        FEVER: ["fever", "NIGHT_SWEATS", { bn: "রাতে কি অস্বাভাবিকভাবে ঘাম হয়?", en: "Do you have unusual night sweats?" }],
        NIGHT_SWEATS: ["nightSweats", "WEIGHT_LOSS", { bn: "চেষ্টা না করেও কি ওজন কমেছে?", en: "Have you lost weight without trying?" }],
        WEIGHT_LOSS: ["weightLoss", "BLOOD_IN_SPUTUM", { bn: "কাশির সঙ্গে কি রক্ত আসে?", en: "Is there blood in your sputum when you cough?" }],
        BLOOD_IN_SPUTUM: ["bloodInSputum", "TB_EXPOSURE", { bn: "যক্ষ্মা আছে এমন কারও কাছাকাছি কি ছিলেন?", en: "Have you been in close contact with someone who has TB?" }],
        TB_EXPOSURE: ["tbExposure", "AREA", null],
      } as const;
      const [key, nextStage, prompt] = mapping[session.stage];
      session.state.answers = { ...session.state.answers, [key]: answer };
      session.stage = nextStage;
      response = prompt
        ? yesNoPrompt(session.language, prompt)
        : `${textFor(session.language, { bn: "আপনি এখন কোন বিভাগে আছেন?", en: "Which division are you currently in?" })}\n${screeningAreas.map((area, index) => `${index + 1} ${area.label[session.language]}`).join("\n")}`;
      break;
    }
    case "AREA": {
      const index = Number(normalizeBanglaDigits(rawText)) - 1;
      const area = screeningAreas[index];
      if (!area) return { session, response: textFor(session.language, {
        bn: "তালিকা থেকে 1–5 লিখুন।", en: "Send a number from 1–5.",
      }), changed: false };
      session.state.areaName = area.id;
      session.stage = "AUDIO";
      response = textFor(session.language, {
        bn: "ঐচ্ছিক: এখন একটি কাশির ভয়েস মেসেজ পাঠান, অথবা SKIP লিখুন। অডিও কেবল এই অনুরোধে প্রক্রিয়া হবে; ফাইল রাখা হবে না। এটি যক্ষ্মা রোগ নির্ণয় করতে পারে না।",
        en: "Optional: send a cough voice message now, or send SKIP. Audio is processed only for this request; the file is not retained. It cannot diagnose TB.",
      });
      break;
    }
    case "AUDIO": {
      let acousticResult: HearResult | null = null;
      if (command === "SKIP" || rawText === "বাদ") {
        session.state.audioStatus = "skipped";
        delete session.state.audioHash;
      } else if (event.audio) {
        try {
          const bytes = await event.audio.load();
          const processed = await processChannelAudio(bytes, event.audio.declaredMimeType);
          acousticResult = await analyzeWithHear(bytes, processed.mimeType);
          session.state.audioStatus = "uploaded";
          session.state.audioHash = processed.audioHash;
        } catch (error) {
          const code = error instanceof Error ? error.message : "AUDIO_PROCESSING_FAILED";
          const safeDiagnosticCodes = new Set([
            "AUDIO_TOO_LARGE",
            "AUDIO_TOO_SHORT",
            "INVALID_AUDIO_FILE",
            "UNSUPPORTED_AUDIO_TYPE",
            "TELEGRAM_MEDIA_LOOKUP_FAILED",
            "TELEGRAM_MEDIA_LOOKUP_RESPONSE_INVALID",
            "TELEGRAM_MEDIA_PATH_INVALID",
            "TELEGRAM_MEDIA_DOWNLOAD_FAILED",
            "TELEGRAM_MEDIA_DOWNLOAD_NETWORK_FAILED",
            "WHATSAPP_MEDIA_LOOKUP_FAILED",
            "WHATSAPP_MEDIA_URL_INVALID",
            "WHATSAPP_MEDIA_DOWNLOAD_FAILED",
          ]);
          // Provider diagnostics intentionally contain no patient identity,
          // message text, file ID, URL, media bytes, or secret.
          console.warn(
            `[JVH channel audio] ${session.provider} rejected: ${
              safeDiagnosticCodes.has(code)
                || /^TELEGRAM_MEDIA_(?:LOOKUP|DOWNLOAD)_HTTP_\d{3}$/.test(code)
                || /^TELEGRAM_MEDIA_(?:LOOKUP|DOWNLOAD)_NETWORK_[A-Z][A-Z0-9_]{0,63}$/.test(code)
                ? code
                : "AUDIO_PROCESSING_FAILED"
            }`,
          );
          const message = code === "AUDIO_TOO_LARGE"
            ? { bn: "অডিওটি 16 MB-এর বেশি। ছোট ভয়েস মেসেজ পাঠান বা SKIP লিখুন।", en: "The audio is over 16 MB. Send a shorter voice message or SKIP." }
            : { bn: "অডিওটি পড়া যায়নি। নতুন ভয়েস মেসেজ পাঠান বা SKIP লিখুন।", en: "The audio could not be read. Send another voice message or SKIP." };
          return { session, response: textFor(session.language, message), changed: false };
        }
      } else {
        return { session, response: textFor(session.language, {
          bn: "একটি ভয়েস মেসেজ পাঠান অথবা SKIP লিখুন।", en: "Send a voice message or send SKIP.",
        }), changed: false };
      }
      response = await completeAudioStep(session);
      if (event.audio) {
        const audioMessage = acousticResult?.available
          ? acousticResult.signal === "COUGH_LIKE_SIGNAL_PRESENT"
            ? { bn: "পরীক্ষামূলক HeAR বিশ্লেষণে কাশির মতো সংকেত পাওয়া গেছে। এটি যক্ষ্মা রোগ নির্ণয় নয় এবং উপসর্গভিত্তিক নিরাপত্তা ফলাফল বদলায় না।", en: "Experimental HeAR analysis found a cough-like signal. This is not a TB diagnosis and does not change the symptom-based safety result." }
            : acousticResult.signal === "NO_COUGH_LIKE_SIGNAL_DETECTED"
              ? { bn: "পরীক্ষামূলক HeAR বিশ্লেষণে কাশির মতো সংকেত পাওয়া যায়নি। এটি যক্ষ্মা রোগ নির্ণয় নয় এবং উপসর্গভিত্তিক নিরাপত্তা ফলাফল বদলায় না।", en: "Experimental HeAR analysis did not find a cough-like signal. This is not a TB diagnosis and does not change the symptom-based safety result." }
              : { bn: "পরীক্ষামূলক HeAR বিশ্লেষণের ফল অনির্দিষ্ট। উপসর্গভিত্তিক নিরাপত্তা ফলাফল অপরিবর্তিত থাকবে।", en: "The experimental HeAR analysis was inconclusive. The symptom-based safety result remains unchanged." }
          : { bn: "অ্যাকুস্টিক প্রক্রিয়াকরণ সম্পন্ন হয়নি। পরামর্শ নির্দিষ্ট উপসর্গভিত্তিক স্ক্রিনিংয়ের ওপর ভিত্তি করে দেওয়া হয়েছে।", en: "Acoustic processing could not be completed. The recommendation is based on the fixed symptom screening." };
        response = `${textFor(session.language, audioMessage)}\n\n${response}`;
      }
      break;
    }
    case "REFERRAL_CHOICE": {
      const answer = parseYesNo(rawText);
      if (answer === null) return { session, response: textFor(session.language, {
        bn: "রেফারেল তৈরি করতে 1, এখন না করতে 2 লিখুন।", en: "Send 1 to create the referral, or 2 for not now.",
      }), changed: false };
      if (answer) response = await createReferral(session);
      else {
        session.stage = "COMPLETE";
        response = `${textFor(session.language, {
          bn: "রেফারেল তৈরি করা হয়নি। সম্পূর্ণ স্ক্রিনিংটি সংরক্ষিত আছে। পরে কী করতে হবে দেখতে আমার সেবা খুলুন:",
          en: "No referral was created. The completed screening remains saved. Open My Care for the next step:",
        })} ${careLink(session)}`;
      }
      break;
    }
    case "FOLLOW_UP_BARRIER": {
      const barrier = barrierByChoice[normalizeBanglaDigits(rawText)];
      if (!barrier) return { session, response: barrierPrompt(session.language), changed: false };
      response = await saveBarrier(session, barrier);
      break;
    }
    case "COMPLETE":
      response = `${textFor(session.language, {
        bn: "আমার সেবা দেখতে STATUS, উপস্থিত হতে না পারলে MISSED, অথবা নতুন স্ক্রিনিংয়ের জন্য START SELF লিখুন।",
        en: "Send STATUS for My Care, MISSED if you could not attend, or START SELF for a new screening.",
      })}\n${careLink(session)}`;
      return { session, response, changed: false };
    case "STOPPED":
      response = textFor(session.language, {
        bn: "আবার শুরু করতে START SELF লিখুন।", en: "Send START SELF to begin again.",
      });
      return { session, response, changed: false };
  }
  return { session, response, changed: true };
}

export async function handleChannelEvent(event: IncomingChannelEvent): Promise<ChannelEventResult> {
  if (!isReferralDatabaseConfigured()) throw new Error("MESSAGING_BACKEND_NOT_CONFIGURED");
  if (!event.eventId || event.eventId.length > 255) throw new Error("INVALID_CHANNEL_EVENT");
  const identity = identityFor(event.provider, event.externalUserId);
  const start = parseStart(event.provider, event.text);
  let session = await loadSession(identity.channelKey);
  const sessionWasCreated = session === null;

  if (start.kind === "invalid") return { response: invalidEntryPrompt(), replayed: false };

  if (!session) {
    const entry: Extract<StartContext, { kind: "valid" }> = start.kind === "valid"
      ? start
      : { kind: "valid", sourceType: "SELF" };
    session = await saveSession(initialSession(
      event.provider,
      identity.channelKey,
      identity.patientId,
      entry,
      0,
    ));
  }

  const claim = await beginEvent(session, event.eventId);
  if (!claim.shouldProcess) {
    return { response: claim.previousResponse, replayed: claim.previousResponse !== null };
  }

  try {
    let response: string;
    if (start.kind === "valid" && !sessionWasCreated) {
      const reset = initialSession(
        event.provider,
        identity.channelKey,
        identity.patientId,
        start,
        session.version,
      );
      session = await saveSession(reset);
      response = languagePrompt();
    } else if (sessionWasCreated) {
      response = languagePrompt();
    } else {
      const turn = await processTurn(session, event);
      if (turn.changed) session = await saveSession(turn.session);
      response = turn.response;
    }

    if (response.length > 4096) throw new Error("CHANNEL_RESPONSE_TOO_LONG");
    await completeEvent(session, event.eventId, response);
    return { response, replayed: false };
  } catch (error) {
    await releaseEvent(session, event.eventId);
    throw error;
  }
}

export function channelConfigurationStatus() {
  return {
    identitySecret: Boolean(process.env.MESSAGING_ID_SECRET && process.env.MESSAGING_ID_SECRET.length >= 32),
    publicAppUrl: Boolean(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN
      && process.env.WHATSAPP_PHONE_NUMBER_ID
      && process.env.WHATSAPP_APP_SECRET
      && process.env.WHATSAPP_VERIFY_TOKEN
      && /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION ?? ""),
    ),
    telegram: Boolean(
      process.env.TELEGRAM_BOT_TOKEN
      && process.env.TELEGRAM_WEBHOOK_SECRET,
    ),
  };
}
