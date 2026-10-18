import { SAFETY_OUTCOMES, type SafetyOutcome } from "@/lib/safety-rules";
import { CARE_OUTCOMES, isAgeBand, isPathwayId, type AgeBand, type CareOutcome, type PathwayAnswers, type PathwayId } from "@/lib/care-pathways";
import type { FollowUpView } from "@/lib/follow-ups";
import type { ReferralView } from "@/lib/referrals";

export type CareEntrySource = "self" | "pharmacy";
export type CareReferralStatus = "NOT_REQUESTED" | "READY_TO_CONTINUE" | "PENDING" | "FOLLOW_UP_NEEDED" | "COMPLETED" | "CLOSED";
export type CareAudioChoice = "recorded" | "uploaded" | "skipped";
export type StoredCareOutcome = SafetyOutcome | CareOutcome;

export type CareRecord = {
  version: 1;
  patientId: string;
  source: CareEntrySource;
  pharmacyId?: string;
  /** Optional. Digits only, normalised to 01XXXXXXXXX. Used only to reopen care in this browser. */
  phone?: string;
  area: string;
  pathwayId?: PathwayId;
  ruleVersion?: string;
  ageBand?: AgeBand;
  screeningOutcome: StoredCareOutcome;
  /** Present for screenings completed after Part 9; used for server-side fixed-rule revalidation. */
  symptomAnswers?: PathwayAnswers;
  screeningId?: string;
  audioChoice?: CareAudioChoice;
  /** SHA-256 only; the uploaded audio itself remains browser-local. */
  audioHash?: string;
  referralStatus: CareReferralStatus;
  selectedCentreId?: string;
  referral?: ReferralView;
  followUp?: FollowUpView;
  followUpNeeded: boolean;
  createdAt: string;
  updatedAt: string;
};

const RECORD_PREFIX = "jvh-care-v1:";
const PHONE_PREFIX = "jvh-care-phone-v1:";
const ACTIVE_KEY = "jvh-care-active-v1";

/** Accept legacy IDs while issuing the neutral care-ID format for new sessions. */
export const CARE_PATIENT_ID_PATTERN = /^(?:FS-CARE|JVH-DEMO)-[A-F0-9]{8}$/;

/**
 * Self-use care stays in this browser so the person can reopen `My Care` later.
 * Pharmacy-assisted care stays in the tab session only, so a shared pharmacy
 * device does not keep one person's care information for the next person.
 */
function storageFor(source: CareEntrySource) {
  return source === "self" ? window.localStorage : window.sessionStorage;
}

function allStorages() {
  return [window.sessionStorage, window.localStorage];
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("880")) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
}

export function isValidPhone(value: string) {
  return /^01[3-9]\d{8}$/.test(normalizePhone(value));
}

export function normalizePatientId(value: string) {
  return value.trim().toUpperCase();
}

export function isCareRecord(value: unknown): value is CareRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CareRecord>;

  return record.version === 1
    && typeof record.patientId === "string"
    && CARE_PATIENT_ID_PATTERN.test(record.patientId)
    && (record.source === "self" || record.source === "pharmacy")
    && typeof record.area === "string"
    && (Object.values(SAFETY_OUTCOMES).includes(record.screeningOutcome as SafetyOutcome)
      || Object.values(CARE_OUTCOMES).includes(record.screeningOutcome as CareOutcome))
    && ["NOT_REQUESTED", "READY_TO_CONTINUE", "PENDING", "FOLLOW_UP_NEEDED", "COMPLETED", "CLOSED"].includes(record.referralStatus ?? "")
    && typeof record.followUpNeeded === "boolean"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string"
    && (record.audioChoice === undefined || ["recorded", "uploaded", "skipped"].includes(record.audioChoice))
    && (record.audioHash === undefined || /^[0-9a-f]{64}$/.test(record.audioHash))
    && (record.screeningId === undefined || typeof record.screeningId === "string")
    && (record.symptomAnswers === undefined || typeof record.symptomAnswers === "object")
    && (record.selectedCentreId === undefined || typeof record.selectedCentreId === "string")
    && (record.referral === undefined || typeof record.referral === "object")
    && (record.followUp === undefined || typeof record.followUp === "object")
    && (record.pharmacyId === undefined || typeof record.pharmacyId === "string")
    && (record.phone === undefined || typeof record.phone === "string")
    && (record.pathwayId === undefined || isPathwayId(record.pathwayId))
    && (record.ageBand === undefined || isAgeBand(record.ageBand))
    && (record.ruleVersion === undefined || typeof record.ruleVersion === "string");
}

export async function fetchPersistedCareRecord(patientId: string): Promise<CareRecord> {
  const response = await fetch("/api/care", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patientId: normalizePatientId(patientId) }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { care?: unknown; error?: string } | null;
  if (!response.ok || !isCareRecord(body?.care)) {
    throw new Error(body?.error ?? "CARE_FETCH_FAILED");
  }
  return body.care;
}

function readRecord(storage: Storage, patientId: string) {
  const rawRecord = storage.getItem(`${RECORD_PREFIX}${patientId}`);
  if (!rawRecord) return null;

  try {
    const parsedRecord: unknown = JSON.parse(rawRecord);
    if (isCareRecord(parsedRecord) && parsedRecord.patientId === patientId) return parsedRecord;
  } catch {
    // A damaged entry is removed so the person can start again cleanly.
  }

  storage.removeItem(`${RECORD_PREFIX}${patientId}`);
  return null;
}

export function createCarePatientId() {
  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `FS-CARE-${suffix}`;
}

export function saveCareRecord(record: CareRecord) {
  const storage = storageFor(record.source);
  const previousRecord = readRecord(storage, record.patientId);

  if (previousRecord?.phone && previousRecord.phone !== record.phone) {
    storage.removeItem(`${PHONE_PREFIX}${previousRecord.phone}`);
  }

  storage.setItem(`${RECORD_PREFIX}${record.patientId}`, JSON.stringify(record));
  storage.setItem(ACTIVE_KEY, record.patientId);
  if (record.phone) storage.setItem(`${PHONE_PREFIX}${record.phone}`, record.patientId);
}

export function loadCareRecord(patientId: string, source?: CareEntrySource) {
  const normalizedId = normalizePatientId(patientId);
  const stores = source ? [storageFor(source)] : allStorages();

  for (const storage of stores) {
    const record = readRecord(storage, normalizedId);
    if (record) return record;
  }

  return null;
}

/** Opens the care record last used in this tab session, then in this browser. */
export function loadActiveCareRecord() {
  for (const storage of allStorages()) {
    const patientId = storage.getItem(ACTIVE_KEY);
    if (!patientId) continue;

    const record = readRecord(storage, patientId);
    if (record) return record;

    storage.removeItem(ACTIVE_KEY);
  }

  return null;
}

export function findCareRecordByPhone(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) return null;

  for (const storage of allStorages()) {
    const patientId = storage.getItem(`${PHONE_PREFIX}${normalizedPhone}`);
    if (!patientId) continue;

    const record = readRecord(storage, patientId);
    if (record?.phone === normalizedPhone) return record;

    storage.removeItem(`${PHONE_PREFIX}${normalizedPhone}`);
  }

  return null;
}

export function removeCareRecord(patientId: string, source: CareEntrySource) {
  const normalizedId = normalizePatientId(patientId);
  const storage = storageFor(source);
  const record = readRecord(storage, normalizedId);

  if (record?.phone) storage.removeItem(`${PHONE_PREFIX}${record.phone}`);
  storage.removeItem(`${RECORD_PREFIX}${normalizedId}`);
  if (storage.getItem(ACTIVE_KEY) === normalizedId) storage.removeItem(ACTIVE_KEY);
}

export function careLinkFor(record: Pick<CareRecord, "patientId" | "source" | "pharmacyId">) {
  const query = new URLSearchParams({ patient: record.patientId, source: record.source });
  if (record.pharmacyId) query.set("pharmacy", record.pharmacyId);
  return `/care?${query.toString()}`;
}
