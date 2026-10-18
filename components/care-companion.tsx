"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BilingualText, type Copy, useLanguage } from "@/components/language";
import { Icon } from "@/components/icons";
import { ActionLink, ClayCard, DemoNotice, IconTile, PageShell, SectionHeading, StatusPill } from "@/components/ui";
import {
  careLinkFor,
  fetchPersistedCareRecord,
  findCareRecordByPhone,
  isValidPhone,
  loadActiveCareRecord,
  loadCareRecord,
  normalizePatientId,
  normalizePhone,
  removeCareRecord,
  saveCareRecord,
  type CareAudioChoice,
  type CareEntrySource,
  type CareRecord,
  type CareReferralStatus,
} from "@/lib/care-session";
import { getActivePharmacy } from "@/lib/pharmacies";
import { SAFETY_OUTCOMES, type SafetyOutcome } from "@/lib/safety-rules";
import { getBroadArea } from "@/lib/broad-areas";
import { getRecommendedCentre, getTbCentre, rankCentresByDistance, tbCentres } from "@/lib/tb-centres";
import { TbCentreMap } from "@/components/tb-centre-map";
import { fetchReferral, referralLinkFor, requestReferral } from "@/lib/referrals";
import {
  FOLLOW_UP_BARRIERS,
  fetchFollowUp,
  followUpActionCopy,
  followUpBarrierLabels,
  saveFollowUpBarrier,
  simulateTwentyFourHours,
  type FollowUpBarrier,
} from "@/lib/follow-ups";
import {
  AI_FREE_TEXT_MAX_LENGTH,
  classifyFollowUpBarrier,
  explainCareNextStep,
} from "@/lib/ai-companion";

const outcomeLabels: Record<SafetyOutcome, Copy> = {
  CONTINUE_SCREENING: { bn: "নির্দিষ্ট রেফারেল মানদণ্ড মেলেনি", en: "No fixed referral criterion met" },
  FORMAL_TB_EVALUATION_RECOMMENDED: { bn: "আনুষ্ঠানিক মূল্যায়নের পরামর্শ", en: "Formal evaluation recommended" },
  URGENT_MEDICAL_EVALUATION: { bn: "জরুরি চিকিৎসা মূল্যায়ন", en: "Urgent medical evaluation" },
};

const recommendationCopy: Record<SafetyOutcome, Copy> = {
  CONTINUE_SCREENING: {
    bn: "বর্তমান উত্তরে জরুরি বা আনুষ্ঠানিক মূল্যায়নের নির্দিষ্ট মানদণ্ড মেলেনি। এতে যক্ষ্মা বা অন্য অসুস্থতা নেই—এমন প্রমাণ হয় না। উপসর্গ থেকে গেলে, বেড়ে গেলে বা উদ্বেগ হলে চিকিৎসাসেবা নিন।",
    en: "Your current answers did not meet a fixed urgent or formal-evaluation criterion. This does not rule out TB or another illness. Seek medical care if symptoms persist, worsen, or concern you.",
  },
  FORMAL_TB_EVALUATION_RECOMMENDED: {
    bn: "আপনার স্ক্রিনিং বলছে যে আনুষ্ঠানিক যক্ষ্মা মূল্যায়নের পরামর্শ দেওয়া হচ্ছে। এই ফলাফলের অর্থ এই নয় যে আপনার যক্ষ্মা হয়েছে। যাচাইকৃত যক্ষ্মা সেবাকেন্দ্রে মূল্যায়ন ও উপযুক্ত পরীক্ষা করান।",
    en: "Your screening suggests that formal TB evaluation is recommended. This result does not mean that you have TB. Please receive evaluation and appropriate testing at a verified TB centre.",
  },
  URGENT_MEDICAL_EVALUATION: {
    bn: "কাশির সঙ্গে রক্ত এলে দ্রুত চিকিৎসকের মূল্যায়ন প্রয়োজন। এটি যক্ষ্মা রোগ নির্ণয় নয় এবং অন্য গুরুতর কারণও থাকতে পারে।",
    en: "Blood in the sputum needs prompt medical assessment. This is not a TB diagnosis, and there may be another serious cause.",
  },
};

const emergencyCopy: Copy = {
  bn: "কয়েকটি ছোট দাগের চেয়ে বেশি রক্ত এলে, শ্বাস নিতে কষ্ট হলে, হৃদস্পন্দন খুব দ্রুত হলে, অথবা বুক বা পিঠের ওপরের অংশে ব্যথা হলে এখনই ৯৯৯ নম্বরে কল করুন বা নিকটস্থ হাসপাতালের জরুরি বিভাগে যান। যক্ষ্মা সেবাকেন্দ্রের রেফারেল জরুরি চিকিৎসার বিকল্প নয়।",
  en: "If there is more than a few spots or streaks of blood, difficulty breathing, a very fast heartbeat, or chest or upper-back pain, call Bangladesh National Emergency Service 999 or go to the nearest hospital emergency department now. A TB-centre referral does not replace emergency care.",
};

const referralStatusLabels: Record<CareReferralStatus, Copy> = {
  NOT_REQUESTED: { bn: "রেফারেল তৈরি হয়নি", en: "No referral created" },
  READY_TO_CONTINUE: { bn: "রেফারেলের পথে এগোতে প্রস্তুত", en: "Ready to continue to referral" },
  PENDING: { bn: "অপেক্ষমাণ (PENDING)", en: "Pending" },
  FOLLOW_UP_NEEDED: { bn: "ফলো-আপ প্রয়োজন", en: "Follow-up needed" },
  COMPLETED: { bn: "সম্পন্ন", en: "Completed" },
  CLOSED: { bn: "বন্ধ", en: "Closed" },
};

const audioChoiceLabels: Record<CareAudioChoice, Copy> = {
  recorded: { bn: "কাশির অডিও এই ডিভাইসে রেকর্ড করা হয়েছে", en: "Cough audio recorded on this device" },
  uploaded: { bn: "কাশির অডিও ডিভাইস থেকে আপলোড করা হয়েছে", en: "Cough audio uploaded from the device" },
  skipped: { bn: "কাশির অডিও এইবার দেওয়া হয়নি", en: "Cough audio was skipped this time" },
};

function nextActionCopy(record: CareRecord, hasCentre: boolean): Copy {
  if (record.screeningOutcome === SAFETY_OUTCOMES.URGENT_EVALUATION && !record.followUpNeeded) {
    return { bn: "আগে জরুরি চিকিৎসা নির্দেশনা অনুসরণ করুন", en: "Follow the urgent medical guidance first" };
  }
  if (record.screeningOutcome === SAFETY_OUTCOMES.CONTINUE) {
    return { bn: "উপসর্গ লক্ষ্য করুন এবং প্রয়োজন হলে চিকিৎসাসেবা নিন", en: "Watch your symptoms and seek medical care when needed" };
  }
  if (record.followUpNeeded && record.followUp?.nextAction) {
    return followUpActionCopy[record.followUp.nextAction].title;
  }
  if (record.followUpNeeded) {
    return { bn: "যেতে না পারার কারণটি জানান", en: "Tell us what prevented your visit" };
  }
  if (!hasCentre) {
    return { bn: "একটি যক্ষ্মা সেবাকেন্দ্র বেছে নিন", en: "Choose a TB centre" };
  }
  if (record.referralStatus === "PENDING") {
    return { bn: "রেফারেল কিউআর সঙ্গে নিয়ে সেবাকেন্দ্রে যান", en: "Take the referral QR to the TB centre" };
  }
  if (record.referralStatus === "COMPLETED") {
    return { bn: "সেবাকেন্দ্রের পরবর্তী নির্দেশনা অনুসরণ করুন", en: "Follow the TB centre's next instructions" };
  }
  if (record.referralStatus === "CLOSED") {
    return { bn: "প্রয়োজনে আবার চিকিৎসাসেবা নিন", en: "Seek medical care again if needed" };
  }
  return record.referralStatus === "READY_TO_CONTINUE"
    ? { bn: "রেফারেল তৈরির ধাপে এগিয়ে যান", en: "Continue to the referral step" }
    : { bn: "রেফারেলের পথে এগোতে চান কি না জানান", en: "Choose whether to continue to referral" };
}

function followUpMessageCopy(record: CareRecord, centreName?: Copy): Copy | null {
  if (!record.followUpNeeded) return null;

  const centreSuffix = centreName
    ? { bn: ` বর্তমানে বেছে নেওয়া কেন্দ্র: ${centreName.bn}।`, en: ` Your currently selected centre is ${centreName.en}.` }
    : { bn: " এখনো কোনো সেবাকেন্দ্র বেছে নেওয়া হয়নি।", en: " No TB centre has been selected yet." };

  return {
    bn: `আপনি যেতে পারেননি—এটি রাখা হয়েছে। দেরি হলেও আনুষ্ঠানিক মূল্যায়ন এখনো প্রয়োজন।${centreSuffix.bn} ${record.followUp?.nextAction ? "আপনার বলা কারণ অনুযায়ী পরবর্তী কাজ নিচে দেখানো হয়েছে।" : "যেতে না পারার কারণ জানালে পরবর্তী কাজ দেখানো হবে।"}`,
    en: `We recorded that you could not attend. Formal evaluation is still needed, even if it is late.${centreSuffix.en} ${record.followUp?.nextAction ? "The next action based on your reason is shown below." : "Tell us what prevented the visit to see the next action."}`,
  };
}

function mergePersistedCare(persisted: CareRecord, local: CareRecord | null) {
  const area = getBroadArea(persisted.area);
  const fallbackCentreId = area ? getRecommendedCentre(area)?.centre.id : undefined;
  const selectedCentreId = persisted.selectedCentreId ?? local?.selectedCentreId ?? fallbackCentreId;
  const keepLocalChoice = !persisted.referral
    && local
    && (local.referralStatus === "NOT_REQUESTED" || local.referralStatus === "READY_TO_CONTINUE");

  return {
    ...persisted,
    ...(local?.phone ? { phone: local.phone } : {}),
    ...(selectedCentreId ? { selectedCentreId } : {}),
    ...(keepLocalChoice ? { referralStatus: local.referralStatus } : {}),
  } satisfies CareRecord;
}

function CareLookup({
  initialPatientId,
  notFound,
  onFound,
}: {
  initialPatientId?: string;
  notFound: boolean;
  onFound: (record: CareRecord) => void;
}) {
  const [lookupValue, setLookupValue] = useState(initialPatientId ?? "");
  const [lookupError, setLookupError] = useState(false);
  const [lookupUnavailable, setLookupUnavailable] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  async function findCare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedValue = lookupValue.trim();
    const localRecord = isValidPhone(trimmedValue)
      ? findCareRecordByPhone(trimmedValue)
      : loadCareRecord(normalizePatientId(trimmedValue));
    const patientId = localRecord?.patientId ?? normalizePatientId(trimmedValue);

    setLookupBusy(true);
    setLookupError(false);
    setLookupUnavailable(false);
    try {
      const persisted = await fetchPersistedCareRecord(patientId);
      onFound(mergePersistedCare(persisted, localRecord));
    } catch (error) {
      if (localRecord) {
        onFound(localRecord);
      } else {
        const code = error instanceof Error ? error.message : "CARE_FETCH_FAILED";
        setLookupError(code === "CARE_NOT_FOUND" || code === "INVALID_CARE_LOOKUP");
        setLookupUnavailable(code !== "CARE_NOT_FOUND" && code !== "INVALID_CARE_LOOKUP");
      }
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <PageShell
      eyebrow={{ bn: "আমার সেবা", en: "My Care" }}
      title={notFound
        ? { bn: "এই ডেমো সেবার তথ্য পাওয়া যায়নি", en: "This demo care record was not found" }
        : { bn: "আপনার সেবার তথ্য খুলুন", en: "Open your care information" }}
      description={{
        bn: "স্ক্রিনিং শেষে পাওয়া ডেমো রোগী আইডি দিয়ে সংরক্ষিত সেবার অবস্থা খুলুন। এই ডিভাইসে আগে নম্বর রাখলে সেটিও ব্যবহার করতে পারেন।",
        en: "Use the demo patient ID from the end of screening to open the persisted care status. You can also use a phone number previously saved on this device.",
      }}
      icon="care"
    >
      <DemoNotice />
      <ClayCard className="care-lookup-card">
        <form className="care-lookup-form" onSubmit={findCare}>
          <label htmlFor="care-lookup-value">
            <BilingualText copy={{ bn: "ডেমো রোগী আইডি বা মোবাইল নম্বর", en: "Demo patient ID or mobile number" }} />
          </label>
          <input
            id="care-lookup-value"
            name="careLookup"
            type="text"
            lang="en"
            autoCapitalize="characters"
            autoComplete="off"
            value={lookupValue}
            onChange={(event) => {
              setLookupValue(event.target.value);
              setLookupError(false);
              setLookupUnavailable(false);
            }}
            placeholder="JVH-DEMO-XXXXXXXX"
            required
          />
          {lookupError && (
            <p className="care-form-error" role="alert">
              <BilingualText copy={{
                bn: "এই আইডি বা নম্বরের সেবার তথ্য পাওয়া যায়নি। আইডিটি ঠিক আছে কি না দেখুন, অথবা নতুন স্ক্রিনিং শুরু করুন।",
                en: "No care information was found for this ID or number. Check it and try again, or start a new screening.",
              }} />
            </p>
          )}
          {lookupUnavailable && (
            <p className="care-form-error" role="alert">
              <BilingualText copy={{
                bn: "সংরক্ষিত সেবার তথ্য এখন যাচাই করা যাচ্ছে না। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
                en: "The persisted care status cannot be checked now. Check the connection and try again.",
              }} />
            </p>
          )}
          <button className="button button-primary" type="submit" disabled={lookupBusy}>
            <BilingualText copy={lookupBusy
              ? { bn: "সেবার তথ্য দেখা হচ্ছে…", en: "Checking care status…" }
              : { bn: "আমার সেবা খুলুন", en: "Open My Care" }} />
            <Icon name="arrow" />
          </button>
        </form>
        <div className="care-lookup-help">
          <p>
            <BilingualText copy={{
              bn: "সেবার সর্বশেষ অবস্থা নিরাপদ সার্ভার রেকর্ড থেকে দেখা হয়। ফার্মেসির শেয়ার করা ডিভাইসে ব্রাউজার কপি শুধু চলমান সেশনেই থাকে।",
              en: "The latest care status is read from the protected server record. On a shared pharmacy device, the browser copy remains only for the current session.",
            }} />
          </p>
          <Link className="button button-secondary" href="/screen?source=self">
            <BilingualText copy={{ bn: "নতুন স্ক্রিনিং শুরু করুন", en: "Start a new screening" }} />
            <Icon name="screen" />
          </Link>
        </div>
      </ClayCard>
    </PageShell>
  );
}

export function CareCompanion({
  initialPatientId,
  initialSource,
  initialPharmacyId,
}: {
  initialPatientId?: string;
  initialSource?: CareEntrySource;
  initialPharmacyId?: string;
}) {
  const { language } = useLanguage();
  const [record, setRecord] = useState<CareRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCentre, setShowCentre] = useState(false);
  const [feedback, setFeedback] = useState<Copy | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [referralBusy, setReferralBusy] = useState(false);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [selectedBarrier, setSelectedBarrier] = useState<FollowUpBarrier | "">("");
  const [editingBarrier, setEditingBarrier] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [barrierFreeText, setBarrierFreeText] = useState("");
  const [aiBarrierMessage, setAiBarrierMessage] = useState<Copy | null>(null);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        const requestedRecord = initialPatientId ? loadCareRecord(initialPatientId, initialSource) : loadActiveCareRecord();
        const localContextMatches = requestedRecord
          && (!initialPharmacyId || requestedRecord.pharmacyId === initialPharmacyId);
        const localRecord = localContextMatches ? requestedRecord : null;
        const patientId = initialPatientId ?? localRecord?.patientId;
        let careRecord = localRecord;

        if (patientId) {
          try {
            const persisted = await fetchPersistedCareRecord(patientId);
            const sourceMatches = !initialSource || persisted.source === initialSource;
            const pharmacyMatches = !initialPharmacyId || persisted.pharmacyId === initialPharmacyId;
            if (sourceMatches && pharmacyMatches) {
              careRecord = mergePersistedCare(persisted, localRecord);
              saveCareRecord(careRecord);
            } else {
              careRecord = null;
            }
          } catch {
            // A locally saved record remains available during a temporary backend failure.
          }
        }

        if (!active) return;
        setRecord(careRecord);
        setPhoneValue(careRecord?.phone ?? "");
        setLoaded(true);
      })();
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [initialPatientId, initialSource, initialPharmacyId]);

  const referralToken = record?.referral?.accessToken;
  useEffect(() => {
    if (!referralToken) return;
    let active = true;

    fetchReferral(referralToken).then((latestReferral) => {
      if (!active) return;
      setRecord((current) => {
        if (!current?.referral || current.referral.accessToken !== referralToken) return current;
        const nextStatus = latestReferral.status === "FOLLOW_UP" ? "FOLLOW_UP_NEEDED" : latestReferral.status;
        const changed = current.referral.status !== latestReferral.status || current.referralStatus !== nextStatus;
        if (!changed) return current;
        const updated: CareRecord = {
          ...current,
          referral: latestReferral,
          referralStatus: nextStatus,
          followUpNeeded: nextStatus === "FOLLOW_UP_NEEDED",
          updatedAt: new Date().toISOString(),
        };
        saveCareRecord(updated);
        return updated;
      });
    }).catch(() => {
      // Keep the locally saved care record available while the network is down.
    });

    return () => { active = false; };
  }, [referralToken]);

  useEffect(() => {
    if (!referralToken) return;
    let active = true;

    fetchFollowUp(referralToken).then((latestFollowUp) => {
      if (!active) return;
      setRecord((current) => {
        if (!current?.referral || current.referral.accessToken !== referralToken) return current;
        const nextStatus = latestFollowUp.referralStatus === "FOLLOW_UP"
          ? "FOLLOW_UP_NEEDED"
          : latestFollowUp.referralStatus;
        const updated: CareRecord = {
          ...current,
          referral: { ...current.referral, status: latestFollowUp.referralStatus },
          referralStatus: nextStatus,
          followUpNeeded: nextStatus === "FOLLOW_UP_NEEDED",
          ...(latestFollowUp.status ? { followUp: latestFollowUp } : {}),
          updatedAt: new Date().toISOString(),
        };
        saveCareRecord(updated);
        return updated;
      });
      setSelectedBarrier(latestFollowUp.barrier ?? "");
      setEditingBarrier(false);
    }).catch(() => {
      // Referral status remains usable if the follow-up endpoint is unavailable.
    });

    return () => { active = false; };
  }, [referralToken]);

  function openRecord(careRecord: CareRecord) {
    window.history.replaceState(null, "", careLinkFor(careRecord));
    setRecord(careRecord);
    setPhoneValue(careRecord.phone ?? "");
    setFeedback(null);
  }

  // Computed here (not after the early returns below) because React Hooks
  // must run in the same order on every render, even before a record has
  // loaded. Memoized so their identity stays stable across unrelated
  // re-renders (for example, clicking a check-up action) — TbCentreMap uses
  // that stability to avoid rebuilding the map and refetching the route
  // whenever the area and selected centre have not actually changed.
  const broadArea = record ? getBroadArea(record.area) : undefined;
  // Older/offline records may predate selectedCentreId. Preserve a usable,
  // broad-area recommendation instead of rendering an empty centre panel.
  const centre = record
    ? getTbCentre(record.selectedCentreId) ?? (broadArea ? getRecommendedCentre(broadArea)?.centre : undefined)
    : undefined;
  const rankedCentres = useMemo(() => (broadArea ? rankCentresByDistance(broadArea) : []), [broadArea]);
  const recommendedCentreId = useMemo(() => (broadArea ? getRecommendedCentre(broadArea)?.centre.id : undefined), [broadArea]);
  const mapAlternates = useMemo(
    () => rankedCentres.filter((entry) => entry.centre.id !== centre?.id),
    [rankedCentres, centre?.id],
  );

  if (!loaded) {
    return (
      <PageShell
        eyebrow={{ bn: "আমার সেবা", en: "My Care" }}
        title={{ bn: "সেবার তথ্য খোলা হচ্ছে", en: "Opening care information" }}
        description={{ bn: "একটু অপেক্ষা করুন।", en: "Please wait." }}
        icon="care"
      >
        <ClayCard className="care-loading" aria-live="polite">
          <BilingualText copy={{ bn: "সেবার অবস্থা যাচাই করা হচ্ছে…", en: "Checking care status…" }} />
        </ClayCard>
      </PageShell>
    );
  }

  if (!record) {
    return <CareLookup initialPatientId={initialPatientId} notFound={Boolean(initialPatientId)} onFound={openRecord} />;
  }

  const currentRecord = record;
  const pharmacy = currentRecord.source === "pharmacy" ? getActivePharmacy(currentRecord.pharmacyId) : undefined;
  const area = broadArea?.label ?? { bn: currentRecord.area, en: currentRecord.area };
  const referralStatus = referralStatusLabels[currentRecord.referralStatus];
  const nextAction = nextActionCopy(currentRecord, Boolean(centre));
  const followUpMessage = followUpMessageCopy(currentRecord, centre?.name);
  const followUpAction = currentRecord.followUp?.nextAction
    ? followUpActionCopy[currentRecord.followUp.nextAction]
    : null;
  const isUrgent = currentRecord.screeningOutcome === SAFETY_OUTCOMES.URGENT_EVALUATION;
  const referralPathwayAvailable = currentRecord.screeningOutcome !== SAFETY_OUTCOMES.CONTINUE;
  function updateCare(changes: Partial<CareRecord>, nextFeedback: Copy) {
    const updatedRecord: CareRecord = { ...currentRecord, ...changes, updatedAt: new Date().toISOString() };
    saveCareRecord(updatedRecord);
    setRecord(updatedRecord);
    setFeedback(nextFeedback);
  }

  function selectCentre(centreId: string) {
    if (currentRecord.referral) {
      setFeedback({
        bn: "রেফারেল তৈরি হওয়ার পরে সেবাকেন্দ্র বদলানো যায় না। নতুন সহায়তার জন্য কেন্দ্রের সঙ্গে কথা বলুন।",
        en: "The TB centre cannot be changed after the referral is created. Ask the centre for help if a change is needed.",
      });
      return;
    }
    const selectedCentre = getTbCentre(centreId);
    if (!selectedCentre) return;
    updateCare(
      { selectedCentreId: selectedCentre.id },
      {
        bn: `সেবাকেন্দ্র বেছে নেওয়া হয়েছে: ${selectedCentre.name.bn} (${selectedCentre.area.bn})।`,
        en: `TB centre selected: ${selectedCentre.name.en} (${selectedCentre.area.en}).`,
      },
    );
  }

  async function continueToReferral() {
    if (referralBusy) return;
    if (currentRecord.referral) {
      window.location.assign(referralLinkFor(currentRecord.referral.accessToken));
      return;
    }
    if (!centre || !broadArea) {
      setShowCentre(true);
      setFeedback({
        bn: "রেফারেল তৈরির আগে একটি যক্ষ্মা সেবাকেন্দ্র বেছে নিন।",
        en: "Choose a TB centre before creating the referral.",
      });
      return;
    }
    if (!currentRecord.screeningId || !currentRecord.symptomAnswers) {
      setFeedback({
        bn: "এই পুরোনো ডেমো স্ক্রিনিংয়ে রেফারেল তৈরির জন্য প্রয়োজনীয় সম্পূর্ণ তথ্য নেই। নতুন করে স্ক্রিনিং সম্পন্ন করুন।",
        en: "This older demo screening does not contain all data required to create a referral. Please complete a new screening.",
      });
      return;
    }

    updateCare(
      { referralStatus: "READY_TO_CONTINUE", followUpNeeded: false },
      {
        bn: "আপনার সিদ্ধান্ত রাখা হয়েছে। রেফারেল রেকর্ড তৈরি করা হচ্ছে…",
        en: "Your choice is saved. Creating the referral record…",
      },
    );
    setReferralBusy(true);
    try {
      const referral = await requestReferral({
        screeningId: currentRecord.screeningId,
        patientId: currentRecord.patientId,
        sourceType: currentRecord.source === "self" ? "SELF" : "PHARMACY",
        ...(currentRecord.pharmacyId ? { pharmacyId: currentRecord.pharmacyId } : {}),
        areaName: broadArea.id,
        areaLatitude: broadArea.latitude,
        areaLongitude: broadArea.longitude,
        symptomAnswers: currentRecord.symptomAnswers,
        audioStatus: currentRecord.audioChoice ?? "skipped",
        ...(currentRecord.audioHash ? { audioHash: currentRecord.audioHash } : {}),
        screeningResult: currentRecord.screeningOutcome,
        tbCenterId: centre.id,
      });
      updateCare(
        { referralStatus: "PENDING", referral, followUpNeeded: false },
        {
          bn: `রেফারেল ${referral.referralId} তৈরি হয়েছে। বর্তমান অবস্থা PENDING।`,
          en: `Referral ${referral.referralId} was created. Its current status is PENDING.`,
        },
      );
      window.location.assign(referralLinkFor(referral.accessToken));
    } catch {
      updateCare(
        { referralStatus: "READY_TO_CONTINUE", followUpNeeded: false },
        {
          bn: "রেফারেলটি এখন তৈরি করা যায়নি। আপনার সিদ্ধান্ত রাখা আছে। ইন্টারনেট ও Supabase সংযোগ দেখে আবার চেষ্টা করুন; স্ক্রিনিং ফলাফল বদলায়নি।",
          en: "The referral could not be created now, but your choice is saved. Check the internet and Supabase connection, then try again; your screening outcome has not changed.",
        },
      );
    } finally {
      setReferralBusy(false);
    }
  }

  async function startMissedReferralFollowUp(simulated: boolean) {
    if (!currentRecord.referral || followUpBusy) return;
    setFollowUpBusy(true);
    try {
      const followUp = await simulateTwentyFourHours(currentRecord.referral.accessToken);
      updateCare(
        {
          referral: { ...currentRecord.referral, status: followUp.referralStatus },
          referralStatus: "FOLLOW_UP_NEEDED",
          followUpNeeded: true,
          followUp,
        },
        simulated
          ? {
              bn: "ডেমোর ফলো-আপ শুরু হয়েছে। রেফারেলটি FOLLOW_UP হয়েছে। এখন যেতে না পারার কারণ জানান।",
              en: "Demo follow-up has started. The referral is now FOLLOW_UP. Tell us what prevented the visit.",
            }
          : {
              bn: "আপনি যেতে পারেননি—এটি রাখা হয়েছে। এখন যেতে না পারার কারণ জানান।",
              en: "We recorded that you could not attend. Tell us what prevented the visit.",
            },
      );
      setSelectedBarrier(followUp.barrier ?? "");
      setEditingBarrier(false);
      setBarrierFreeText("");
      setAiBarrierMessage(null);
    } catch {
      setFeedback({
        bn: "ফলো-আপ এখন শুরু করা যায়নি। ইন্টারনেট ও Supabase সংযোগ দেখে আবার চেষ্টা করুন। রেফারেলের অবস্থা বদলায়নি।",
        en: "Follow-up could not be started now. Check the internet and Supabase connection and try again. The referral status was not changed.",
      });
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function submitFollowUpBarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentRecord.referral || !selectedBarrier || followUpBusy) return;
    setFollowUpBusy(true);
    try {
      const followUp = await saveFollowUpBarrier(currentRecord.referral.accessToken, selectedBarrier);
      const savedAction = followUp.nextAction ? followUpActionCopy[followUp.nextAction] : null;
      if (!savedAction) throw new Error("FOLLOW_UP_ACTION_MISSING");
      updateCare(
        { followUp, referralStatus: "FOLLOW_UP_NEEDED", followUpNeeded: true },
        {
          bn: `কারণটি রাখা হয়েছে। পরবর্তী কাজ: ${savedAction.title.bn}।`,
          en: `Reason saved. Next action: ${savedAction.title.en}.`,
        },
      );
      setEditingBarrier(false);
      setBarrierFreeText("");
      setAiBarrierMessage(null);
    } catch {
      setFeedback({
        bn: "কারণটি এখন সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
        en: "The reason could not be saved now. Please try again.",
      });
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function checkReferralStatus() {
    if (currentRecord.referral) {
      setReferralBusy(true);
      try {
        const [latestReferral, latestFollowUp] = await Promise.all([
          fetchReferral(currentRecord.referral.accessToken),
          fetchFollowUp(currentRecord.referral.accessToken).catch(() => undefined),
        ]);
        const nextStatus = latestReferral.status === "FOLLOW_UP" ? "FOLLOW_UP_NEEDED" : latestReferral.status;
        updateCare(
          {
            referral: latestReferral,
            referralStatus: nextStatus,
            followUpNeeded: nextStatus === "FOLLOW_UP_NEEDED",
            ...(latestFollowUp?.status ? { followUp: latestFollowUp } : {}),
          },
          nextStatus === "COMPLETED"
            ? {
                bn: "আনুষ্ঠানিক মূল্যায়নে উপস্থিতি নিশ্চিত হয়েছে। এটি যক্ষ্মা রোগ নির্ণয় বা পরীক্ষার ফল নয়।",
                en: "Formal evaluation attendance confirmed. This is not a TB diagnosis or test result.",
              }
            : {
                bn: `বর্তমান রেফারেল অবস্থা: ${referralStatusLabels[nextStatus].bn}। নির্বাচিত সেবাকেন্দ্র: ${latestReferral.centreName}।`,
                en: `Current referral status: ${referralStatusLabels[nextStatus].en}. Selected TB centre: ${latestReferral.centreName}.`,
              },
        );
      } catch {
        setFeedback({
          bn: "রেফারেলের সর্বশেষ অবস্থা এখন পাওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।",
          en: "The latest referral status is unavailable right now. Please try again shortly.",
        });
      } finally {
        setReferralBusy(false);
      }
      return;
    }
    const centreLine = centre
      ? { bn: ` নির্বাচিত সেবাকেন্দ্র: ${centre.name.bn}।`, en: ` Selected TB centre: ${centre.name.en}.` }
      : { bn: " এখনো কোনো সেবাকেন্দ্র বেছে নেওয়া হয়নি।", en: " No TB centre has been selected yet." };

    setFeedback({
      bn: `বর্তমান রেফারেল অবস্থা: ${referralStatus.bn}।${centreLine.bn} এখনো কোনো রেফারেল আইডি তৈরি হয়নি।`,
      en: `Current referral status: ${referralStatus.en}.${centreLine.en} No referral ID has been created yet.`,
    });
  }

  function fixedNextStepExplanation(): Copy {
    if (isUrgent) return emergencyCopy;
    if (currentRecord.screeningOutcome === SAFETY_OUTCOMES.CONTINUE) {
      return {
        bn: "এখন নির্দিষ্ট রেফারেল মানদণ্ড মেলেনি, তাই রেফারেল তৈরি হচ্ছে না। উপসর্গ থেকে গেলে, বেড়ে গেলে বা উদ্বেগ হলে চিকিৎসাসেবা নিন এবং প্রয়োজনে আবার স্ক্রিনিং করুন।",
        en: "No fixed referral criterion is met now, so no referral is being created. Seek medical care if symptoms persist, worsen, or concern you, and screen again if needed.",
      };
    }
    if (currentRecord.followUpNeeded) {
      return {
        bn: "পরবর্তী ধাপ: একটি সুবিধাজনক যক্ষ্মা সেবাকেন্দ্র বেছে নিন, তারপর একটি সম্ভাব্য দিন ঠিক করুন। কেন্দ্র দূরে বা কঠিন মনে হলে তালিকা থেকে অন্য কেন্দ্র বেছে নিন।",
        en: "Next step: choose a TB centre that is practical for you, then pick a day you can go. If the centre is far or difficult, select a different one from the list.",
      };
    }
    if (!centre) {
      return {
        bn: "পরবর্তী ধাপ: ‘যক্ষ্মা সেবাকেন্দ্র দেখুন’ চেপে আপনার এলাকার জন্য একটি কেন্দ্র বেছে নিন। এরপর রেফারেলের পথে এগোনোর সিদ্ধান্ত দিন।",
        en: "Next step: use ‘View TB centre’ to select a centre for your area. Then choose whether to continue to referral.",
      };
    }
    return currentRecord.referralStatus === "READY_TO_CONTINUE"
      ? {
          bn: `পরবর্তী ধাপ: ${centre.name.bn}-এ গিয়ে আনুষ্ঠানিক যক্ষ্মা মূল্যায়ন করান। এটি রোগ নির্ণয় নয়; সেবাকেন্দ্রই উপযুক্ত পরীক্ষা করবে।`,
          en: `Next step: go to ${centre.name.en} for formal TB evaluation. This is not a diagnosis; the centre will carry out the appropriate testing.`,
        }
      : {
          bn: `সেবাকেন্দ্র বেছে নেওয়া হয়েছে: ${centre.name.bn}। এখন ‘রেফারেলের পথে এগিয়ে যান’ চেপে সিদ্ধান্ত দিন। সিদ্ধান্ত আপনারই।`,
          en: `Your centre is ${centre.name.en}. Now use ‘Continue to referral’ to record your choice. The decision stays yours.`,
        };
  }

  async function explainNextStep() {
    const fixedExplanation = fixedNextStepExplanation();
    if (isUrgent || currentRecord.screeningOutcome === SAFETY_OUTCOMES.CONTINUE) {
      setFeedback(fixedExplanation);
      return;
    }

    setAiBusy(true);
    try {
      const result = await explainCareNextStep({
        language,
        safetyOutcome: "FORMAL_TB_EVALUATION_RECOMMENDED",
        referralStatus: currentRecord.referralStatus,
        nextAction: currentRecord.followUp?.nextAction ?? null,
        hasCentre: Boolean(centre),
      });
      setFeedback({
        bn: `AI সহায়কের সহজ ব্যাখ্যা: ${result.explanation.bn} নির্দিষ্ট স্ক্রিনিং ফলাফল অপরিবর্তিত আছে।`,
        en: `AI companion explanation: ${result.explanation.en} The fixed screening outcome remains unchanged.`,
      });
    } catch {
      setFeedback({
        bn: `${fixedExplanation.bn} AI সহায়ক এখন পাওয়া যাচ্ছে না; নির্দিষ্ট নির্দেশনাই দেখানো হয়েছে।`,
        en: `${fixedExplanation.en} The AI companion is unavailable, so the fixed guidance is shown.`,
      });
    } finally {
      setAiBusy(false);
    }
  }

  async function interpretBarrierFreeText() {
    if (aiBusy || barrierFreeText.trim().length < 3) return;
    setAiBusy(true);
    setAiBarrierMessage(null);
    try {
      const result = await classifyFollowUpBarrier(barrierFreeText, language);
      setSelectedBarrier(result.barrier);
      setAiBarrierMessage({
        bn: `AI সহায়ক “${followUpBarrierLabels[result.barrier].bn}” বেছে নেওয়ার পরামর্শ দিয়েছে। ${result.explanation.bn} ঠিক হলে নিচের সংরক্ষণ বোতাম চাপুন।`,
        en: `The AI companion suggested “${followUpBarrierLabels[result.barrier].en}”. ${result.explanation.en} If this is correct, use the save button below.`,
      });
    } catch {
      setAiBarrierMessage({
        bn: "AI সহায়ক এখন উত্তরটি বুঝতে পারেনি। নিচের নির্দিষ্ট কারণগুলোর একটি নিজে বেছে নিন।",
        en: "The AI companion could not interpret this answer now. Choose one of the fixed reasons below.",
      });
    } finally {
      setAiBusy(false);
    }
  }

  function savePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPhone = phoneValue.trim();

    if (!trimmedPhone) {
      updateCare({ phone: undefined }, {
        bn: "মোবাইল নম্বর সরিয়ে ফেলা হয়েছে। ডেমো রোগী আইডি দিয়ে সেবার তথ্য খোলা যাবে।",
        en: "The mobile number was removed. You can still open care with the demo patient ID.",
      });
      setPhoneError(false);
      return;
    }

    if (!isValidPhone(trimmedPhone)) {
      setPhoneError(true);
      return;
    }

    const normalizedPhone = normalizePhone(trimmedPhone);
    setPhoneError(false);
    setPhoneValue(normalizedPhone);
    updateCare({ phone: normalizedPhone }, {
      bn: `নম্বরটি রাখা হয়েছে: ${normalizedPhone}। এই ব্রাউজারে নম্বর দিয়ে সেবার তথ্য আবার খোলা যাবে।`,
      en: `Saved ${normalizedPhone}. You can reopen care with this number in this browser.`,
    });
  }

  function clearCareSession() {
    removeCareRecord(currentRecord.patientId, currentRecord.source);
    window.history.replaceState(null, "", "/care");
    setRecord(null);
    setPhoneValue("");
    setPhoneError(false);
    setShowCentre(false);
    setFeedback(null);
  }

  return (
    <PageShell
      eyebrow={{ bn: "আমার সেবা", en: "My Care" }}
      title={{ bn: "এক নজরে আপনার পরবর্তী পদক্ষেপ", en: "Your next step, at a glance" }}
      description={currentRecord.source === "self"
        ? { bn: "নিজের ডিভাইসে আপনার স্ক্রিনিং, পরামর্শ ও সেবার বর্তমান অবস্থা।", en: "Your current screening, recommendation, and care status on your own device." }
        : { bn: `${pharmacy?.name.bn ?? "ফার্মেসি"}র চলমান সেশনে একই সেবার তথ্য দেখা যাচ্ছে।`, en: `The same care information is available during the current ${pharmacy?.name.en ?? "pharmacy"} session.` }}
      icon="care"
    >
      <DemoNotice />

      <ClayCard className="care-identity-card" as="section">
        <div className="care-identity-main">
          <span className="mini-label"><BilingualText copy={{ bn: "ডেমো রোগী আইডি", en: "Demo patient ID" }} /></span>
          <code lang="en" data-patient-id>{currentRecord.patientId}</code>
        </div>
        <div className="care-identity-side">
          <StatusPill
            tone={currentRecord.source === "self" ? "success" : "neutral"}
            icon={currentRecord.source === "self" ? "home" : "pharmacy"}
            label={currentRecord.source === "self"
              ? { bn: "নিজে ব্যবহার", en: "Self-use" }
              : { bn: `ফার্মেসি সেশন — ${pharmacy?.name.bn ?? "ফার্মেসি"}`, en: `Pharmacy session — ${pharmacy?.name.en ?? "pharmacy"}` }}
          />
        </div>
      </ClayCard>

      {isUrgent && (
        <ClayCard className="care-emergency-card" as="section">
          <div className="card-heading-row">
            <IconTile icon="info" tone="red" />
            <StatusPill tone="risk" icon="info" label={{ bn: "জরুরি নির্দেশনা", en: "Urgent guidance" }} />
          </div>
          <h2><BilingualText copy={{ bn: "কাশির সঙ্গে রক্তের জন্য দ্রুত চিকিৎসা মূল্যায়ন নিন", en: "Seek prompt medical evaluation for blood in your sputum" }} /></h2>
          <p role="alert"><BilingualText copy={emergencyCopy} /></p>
        </ClayCard>
      )}

      {currentRecord.referralStatus === "COMPLETED" && (
        <ClayCard className="care-attendance-card" as="section" data-attendance-confirmed>
          <div className="card-heading-row">
            <IconTile icon="check" tone="teal" />
            <StatusPill tone="success" icon="check" label={{ bn: "উপস্থিতি নিশ্চিত", en: "Attendance confirmed" }} />
          </div>
          <h2><BilingualText copy={{ bn: "আনুষ্ঠানিক মূল্যায়নে উপস্থিতি নিশ্চিত হয়েছে।", en: "Formal evaluation attendance confirmed." }} /></h2>
          <p><BilingualText copy={{
            bn: "এর মানে আপনি সেবাকেন্দ্রে পৌঁছেছেন এবং আনুষ্ঠানিক মূল্যায়ন শুরু হয়েছে। এটি যক্ষ্মা রোগ নির্ণয় বা পরীক্ষার ফল নয়। সেবাকেন্দ্রের কর্মী উপসর্গ ও ইতিহাস দেখে প্রয়োজন অনুযায়ী কফের জিনএক্সপার্ট বা অন্য দ্রুত আণবিক পরীক্ষা, মাইক্রোস্কপি, বুকের এক্স-রে বা অন্য পরীক্ষা বেছে নিতে পারেন।",
            en: "This means you reached the centre and formal evaluation started. It is not a TB diagnosis or test result. Centre staff may review symptoms and history and select sputum GeneXpert/another rapid molecular test, microscopy, chest X-ray, or other tests as appropriate.",
          }} /></p>
          <div className="evaluation-expectations">
            <span className="mini-label"><BilingualText copy={{ bn: "সেবাকেন্দ্রে সাধারণত যা হয়", en: "What usually happens at the centre" }} /></span>
            <ul>
              <li><BilingualText copy={{
                bn: "ফুসফুসের যক্ষ্মা সন্দেহ হলে সাধারণত কফের নমুনা চাওয়া হয়—প্রায়ই একটি তখনই এবং একটি পরদিন সকালের নমুনা।",
                en: "If pulmonary TB is suspected, a sputum (phlegm) sample is usually requested — often one on the spot and one from the next morning.",
              }} /></li>
              <li><BilingualText copy={{
                bn: "কফ দিতে না পারলে কর্মীকে জানান; তাঁরা উপযুক্ত বিকল্প দেখবেন।",
                en: "Tell the staff if you cannot produce sputum; they will consider a suitable alternative.",
              }} /></li>
              <li><BilingualText copy={{
                bn: "দ্রুত আণবিক পরীক্ষার ফল অনেক সময় একই দিনে আসে, তবে সময় কেন্দ্র ও পরীক্ষাভেদে আলাদা হয়। ফল জানতে কেন্দ্রের বলা সময়ে ফিরে যান।",
                en: "Rapid molecular test results can often come the same day, but timing differs by centre and test. Go back when the centre tells you, to get your result.",
              }} /></li>
              <li><BilingualText copy={{
                bn: "জাতীয় যক্ষ্মা কর্মসূচির সেবা সরকারি কেন্দ্রে বিনামূল্যে দেওয়া হয়। তবু কোনো পরীক্ষার (যেমন বুকের এক্স-রে) জন্য কোথাও ফি লাগতে পারে—শুরুতেই কর্মীকে জিজ্ঞাসা করে নিন।",
                en: "National TB programme services are provided free at government centres. Even so, some places may charge a fee for a test such as a chest X-ray — ask the staff at the start.",
              }} /></li>
            </ul>
          </div>
          <strong><BilingualText copy={{ bn: "এখন সেবাকেন্দ্রের পরবর্তী নির্দেশনা অনুসরণ করুন।", en: "Now follow the TB centre's next instructions." }} /></strong>
        </ClayCard>
      )}

      <div className="care-layout">
        <ClayCard className={`next-action-card ${isUrgent ? "next-action-urgent" : ""}`} as="section">
          <div className="card-heading-row">
            <IconTile icon={isUrgent ? "info" : "care"} tone={isUrgent ? "red" : "teal"} />
            <StatusPill tone={isUrgent ? "risk" : "neutral"} icon="shield" label={outcomeLabels[currentRecord.screeningOutcome]} />
          </div>
          <span className="mini-label"><BilingualText copy={{ bn: "পরবর্তী কাজ", en: "Next action" }} /></span>
          <h2 data-next-action><BilingualText copy={nextAction} /></h2>
          <p><BilingualText copy={recommendationCopy[currentRecord.screeningOutcome]} /></p>
          {referralPathwayAvailable && !currentRecord.referral && currentRecord.referralStatus !== "READY_TO_CONTINUE" && (
            <button className="button button-primary" type="button" onClick={() => void continueToReferral()} disabled={referralBusy}>
              <BilingualText copy={referralBusy
                ? { bn: "রেফারেল তৈরি হচ্ছে…", en: "Creating referral…" }
                : { bn: "রেফারেলের পথে এগিয়ে যান", en: "Continue to referral" }} />
              <Icon name="arrow" />
            </button>
          )}
          {currentRecord.referralStatus === "READY_TO_CONTINUE" && !currentRecord.referral && (
            <button className="button button-secondary" type="button" onClick={() => void continueToReferral()} disabled={referralBusy}>
              <BilingualText copy={referralBusy
                ? { bn: "রেফারেল তৈরি হচ্ছে…", en: "Creating referral…" }
                : { bn: "রেফারেল তৈরি করুন", en: "Create referral" }} />
              <Icon name="document" />
            </button>
          )}
          {currentRecord.referral && (
            <ActionLink href={referralLinkFor(currentRecord.referral.accessToken)} variant="secondary" icon="document" label={{ bn: "রেফারেল ও কিউআর খুলুন", en: "Open referral and QR" }} />
          )}
        </ClayCard>

        <ClayCard className="timeline-card" as="section">
          <SectionHeading title={{ bn: "সেবা যাত্রা", en: "Care journey" }} />
          <ol className="care-timeline">
            <li className="complete">
              <span><Icon name="check" /></span>
              <div>
                <strong><BilingualText copy={{ bn: "স্ক্রিনিং", en: "Screening" }} /></strong>
                <small><BilingualText copy={{ bn: "সম্পন্ন", en: "Complete" }} /></small>
              </div>
            </li>
            <li className="complete">
              <span><Icon name="check" /></span>
              <div>
                <strong><BilingualText copy={{ bn: "সেবার পরামর্শ", en: "Care recommendation" }} /></strong>
                <small><BilingualText copy={outcomeLabels[currentRecord.screeningOutcome]} /></small>
              </div>
            </li>
            <li className={currentRecord.referralStatus === "NOT_REQUESTED" ? "" : "current"}>
              <span lang="en">3</span>
              <div>
                <strong><BilingualText copy={{ bn: "রেফারেল", en: "Referral" }} /></strong>
                <small><BilingualText copy={referralStatus} /></small>
              </div>
            </li>
            <li className={currentRecord.referralStatus === "COMPLETED" ? "complete" : ""}>
              <span>{currentRecord.referralStatus === "COMPLETED" ? <Icon name="check" /> : <span lang="en">4</span>}</span>
              <div>
                <strong><BilingualText copy={{ bn: "আনুষ্ঠানিক মূল্যায়ন", en: "Formal evaluation" }} /></strong>
                <small><BilingualText copy={currentRecord.referralStatus === "COMPLETED"
                  ? { bn: "উপস্থিতি নিশ্চিত হয়েছে", en: "Attendance confirmed" }
                  : { bn: "সেবাকেন্দ্রে নিশ্চিত হবে", en: "Confirmed at the centre" }} /></small>
              </div>
            </li>
          </ol>
        </ClayCard>
      </div>

      {followUpMessage && (
        <ClayCard className="care-followup-card" as="section" data-followup-message>
          <div className="card-heading-row">
            <IconTile icon="clock" tone="amber" />
            <StatusPill tone="warning" icon="clock" label={{ bn: "ফলো-আপ বার্তা", en: "Follow-up message" }} />
          </div>
          <h2><BilingualText copy={{ bn: "আপনি এখনো আনুষ্ঠানিক মূল্যায়ন করাতে পারেন", en: "You can still complete formal evaluation" }} /></h2>
          <p><BilingualText copy={followUpMessage} /></p>

          {(editingBarrier || !currentRecord.followUp?.barrier) ? (
            <form className="followup-barrier-form" onSubmit={(event) => void submitFollowUpBarrier(event)} data-followup-question>
              <fieldset disabled={followUpBusy || aiBusy}>
                <legend><BilingualText copy={{ bn: "আপনি কেন যেতে পারেননি?", en: "Why were you unable to attend?" }} /></legend>
                <p className="followup-question-help">
                  <BilingualText copy={{
                    bn: "দোষ দেওয়ার জন্য নয়—আপনার জন্য বাস্তবসম্মত পরবর্তী কাজ দেখাতে একটি কারণ বেছে নিন।",
                    en: "This is not about blame. Choose one reason so we can show a practical next action.",
                  }} />
                </p>
                <div className="ai-barrier-helper" data-ai-barrier-helper>
                  <label htmlFor="followup-free-text">
                    <BilingualText copy={{
                      bn: "নিজের ভাষায় কারণটি লিখতে পারেন (ঐচ্ছিক)",
                      en: "You may describe the reason in your own words (optional)",
                    }} />
                  </label>
                  <textarea
                    id="followup-free-text"
                    name="followupFreeText"
                    lang={language}
                    rows={3}
                    maxLength={AI_FREE_TEXT_MAX_LENGTH}
                    value={barrierFreeText}
                    onChange={(event) => {
                      setBarrierFreeText(event.target.value);
                      setAiBarrierMessage(null);
                    }}
                    placeholder={language === "bn"
                      ? "যেমন: অফিস থেকে ছুটি পাইনি"
                      : "For example: My office would not give me leave"}
                  />
                  <div className="ai-helper-row">
                    <small>
                      <BilingualText copy={{
                        bn: "নাম, ফোন নম্বর বা রেফারেল আইডি লিখবেন না। লেখাটি Gemini-তে পাঠানো হবে; সম্পূর্ণ লেখা সংরক্ষণ করা হবে না।",
                        en: "Do not enter a name, phone number, or referral ID. The text is sent to Gemini; the full text is not stored.",
                      }} />
                    </small>
                    <span lang="en">{barrierFreeText.length}/{AI_FREE_TEXT_MAX_LENGTH}</span>
                  </div>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void interpretBarrierFreeText()}
                    disabled={barrierFreeText.trim().length < 3 || aiBusy || followUpBusy}
                    data-action="interpret-barrier"
                  >
                    <Icon name="care" />
                    <BilingualText copy={aiBusy
                      ? { bn: "AI সহায়ক বুঝছে…", en: "AI companion is interpreting…" }
                      : { bn: "কারণটি বুঝতে AI সহায়তা নিন", en: "Use AI to understand this reason" }} />
                  </button>
                  {aiBarrierMessage && (
                    <div className="ai-helper-message" role="status" aria-live="polite" data-ai-barrier-result>
                      <Icon name="info" />
                      <p><BilingualText copy={aiBarrierMessage} /></p>
                    </div>
                  )}
                </div>
                <div className="followup-barrier-options">
                  {FOLLOW_UP_BARRIERS.map((barrier) => (
                    <label className="followup-barrier-option" key={barrier}>
                      <input
                        type="radio"
                        name="followup-barrier"
                        value={barrier}
                        checked={selectedBarrier === barrier}
                        onChange={() => setSelectedBarrier(barrier)}
                      />
                      <span><BilingualText copy={followUpBarrierLabels[barrier]} /></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="button button-primary" type="submit" disabled={!selectedBarrier || followUpBusy}>
                <BilingualText copy={followUpBusy
                  ? { bn: "কারণ সংরক্ষণ হচ্ছে…", en: "Saving reason…" }
                  : { bn: "কারণ সংরক্ষণ করে পরবর্তী কাজ দেখুন", en: "Save reason and show next action" }} />
                <Icon name="arrow" />
              </button>
            </form>
          ) : followUpAction ? (
            <div className="followup-action-panel" data-followup-action>
              <span className="mini-label"><BilingualText copy={{ bn: "আপনার বলা কারণ", en: "Your reason" }} /></span>
              <strong><BilingualText copy={followUpBarrierLabels[currentRecord.followUp.barrier]} /></strong>
              <h3><BilingualText copy={followUpAction.title} /></h3>
              <p><BilingualText copy={followUpAction.detail} /></p>
              <div className="button-row">
                {(currentRecord.followUp.nextAction === "SHOW_ANOTHER_CENTRE"
                  || currentRecord.followUp.nextAction === "SEEK_TRANSPORT_SUPPORT") && (
                  <button className="button button-secondary" type="button" onClick={() => setShowCentre(true)}>
                    <Icon name="location" />
                    <BilingualText copy={{ bn: "কাছের সেবাকেন্দ্র দেখুন", en: "View nearby TB centres" }} />
                  </button>
                )}
                <button className="button button-quiet" type="button" onClick={() => {
                  setEditingBarrier(true);
                  setBarrierFreeText("");
                  setAiBarrierMessage(null);
                }}>
                  <BilingualText copy={{ bn: "কারণ পরিবর্তন করুন", en: "Change reason" }} />
                </button>
              </div>
            </div>
          ) : null}
        </ClayCard>
      )}

      <section className="section-block" aria-labelledby="current-care-title">
        <SectionHeading
          id="current-care-title"
          title={{ bn: "বর্তমান সেবার তথ্য", en: "Current care information" }}
          description={{ bn: "স্ক্রিনিংয়ের ফলাফল ও এখনকার অবস্থা এক জায়গায়।", en: "Your screening result and current status in one place." }}
        />
        <div className="care-summary-grid">
          <ClayCard className="summary-card" as="article" data-summary="screening">
            <span><BilingualText copy={{ bn: "স্ক্রিনিং অবস্থা", en: "Screening status" }} /></span>
            <strong><BilingualText copy={{ bn: "সম্পন্ন", en: "Complete" }} /></strong>
            <small>
              <BilingualText copy={{ bn: `এলাকা: ${area.bn}`, en: `Area: ${area.en}` }} />
              {" · "}
              <BilingualText copy={audioChoiceLabels[currentRecord.audioChoice ?? "skipped"]} />
            </small>
          </ClayCard>
          <ClayCard className="summary-card" as="article" data-summary="recommendation">
            <span><BilingualText copy={{ bn: "বর্তমান পরামর্শ", en: "Current recommendation" }} /></span>
            <strong><BilingualText copy={outcomeLabels[currentRecord.screeningOutcome]} /></strong>
            <small><BilingualText copy={{ bn: "নির্দিষ্ট নিরাপত্তা নিয়মে নির্ধারিত", en: "Set by the fixed safety rules" }} /></small>
          </ClayCard>
          <ClayCard className="summary-card" as="article" data-summary="referral">
            <span><BilingualText copy={{ bn: "রেফারেল অবস্থা", en: "Referral status" }} /></span>
            <strong><BilingualText copy={referralStatus} /></strong>
            <small>
              {currentRecord.referral ? (
                <Link href={referralLinkFor(currentRecord.referral.accessToken)} lang="en">{currentRecord.referral.referralId}</Link>
              ) : (
                <BilingualText copy={{ bn: "ব্যক্তি সম্মতি দিলে রেফারেল আইডি তৈরি হবে", en: "A referral ID is created only after the person accepts" }} />
              )}
            </small>
          </ClayCard>
          <ClayCard className="summary-card" as="article" data-summary="centre">
            <span><BilingualText copy={{ bn: "নির্বাচিত কাছের সেবাকেন্দ্র", en: "Nearest selected TB centre" }} /></span>
            <strong>
              <BilingualText copy={centre ? centre.name : { bn: "এখনো বেছে নেওয়া হয়নি", en: "Not selected yet" }} />
            </strong>
            <small>
              <BilingualText copy={centre
                ? { bn: `${centre.area.bn} · ${centre.serviceType.bn}`, en: `${centre.area.en} · ${centre.serviceType.en}` }
                : { bn: "নিচের ‘যক্ষ্মা সেবাকেন্দ্র দেখুন’ থেকে বেছে নিন", en: "Choose one using ‘View TB centre’ below" }} />
            </small>
          </ClayCard>
          <ClayCard className="summary-card" as="article" data-summary="next-action">
            <span><BilingualText copy={{ bn: "পরবর্তী কাজ", en: "Next action" }} /></span>
            <strong><BilingualText copy={nextAction} /></strong>
          </ClayCard>
          <ClayCard className="summary-card" as="article" data-summary="followup">
            <span><BilingualText copy={{ bn: "ফলো-আপ", en: "Follow-up" }} /></span>
            <strong><BilingualText copy={currentRecord.followUpNeeded ? { bn: "প্রয়োজন", en: "Needed" } : { bn: "এখন প্রয়োজন নেই", en: "Not needed now" }} /></strong>
          </ClayCard>
        </div>
      </section>

      <section className="section-block care-actions-section" aria-labelledby="care-actions-title">
        <SectionHeading
          id="care-actions-title"
          title={{ bn: "সহজ চেক-আপ সহায়তা", en: "Simple check-up support" }}
          description={{ bn: "শুধু যক্ষ্মা স্ক্রিনিং ও পরবর্তী সেবার জন্য দরকারি কাজগুলো।", en: "Only the actions needed for TB screening and care navigation." }}
        />
        <div className="care-action-grid">
          {referralPathwayAvailable && (
            <button className="care-action" type="button" onClick={() => void continueToReferral()} disabled={referralBusy} data-action="continue-referral">
              <Icon name="document" />
              <BilingualText copy={{ bn: "রেফারেলের পথে এগিয়ে যান", en: "Continue to referral" }} />
            </button>
          )}
          <button
            className={`care-action ${showCentre ? "care-action-active" : ""}`}
            type="button"
            aria-expanded={showCentre}
            aria-controls="care-centre-panel"
            onClick={() => setShowCentre((current) => !current)}
            data-action="view-centre"
          >
            <Icon name="location" />
            <BilingualText copy={{ bn: "যক্ষ্মা সেবাকেন্দ্র দেখুন", en: "View TB centre" }} />
          </button>
          <button className="care-action" type="button" onClick={() => void checkReferralStatus()} disabled={referralBusy} data-action="check-referral">
            <Icon name="search" />
            <BilingualText copy={{ bn: "রেফারেলের অবস্থা দেখুন", en: "Check referral status" }} />
          </button>
          {currentRecord.referralStatus === "PENDING" && currentRecord.referral && (
            <button
              className="care-action care-action-demo"
              type="button"
              onClick={() => void startMissedReferralFollowUp(true)}
              disabled={followUpBusy}
              data-action="simulate-24-hours"
            >
              <Icon name="clock" />
              <BilingualText copy={{ bn: "ডেমো ফলো-আপ শুরু করুন", en: "Start demo follow-up" }} />
              <small><BilingualText copy={{ bn: "শুধু উপস্থাপনার জন্য", en: "Presentation only" }} /></small>
            </button>
          )}
          {currentRecord.referralStatus === "PENDING" && currentRecord.referral && (
            <button className="care-action" type="button" onClick={() => void startMissedReferralFollowUp(false)} disabled={followUpBusy} data-action="missed-visit">
              <Icon name="clock" />
              <BilingualText copy={{ bn: "আমি যেতে পারিনি", en: "I could not attend" }} />
            </button>
          )}
          <button className="care-action" type="button" onClick={() => void explainNextStep()} disabled={aiBusy} data-action="explain-next">
            <Icon name="care" />
            <BilingualText copy={aiBusy
              ? { bn: "সহজ ব্যাখ্যা তৈরি হচ্ছে…", en: "Preparing a simple explanation…" }
              : { bn: "এরপর কী করব জিজ্ঞাসা করুন", en: "Ask what to do next" }} />
          </button>
        </div>
        <div className="care-feedback-region" role="status" aria-live="polite">
          {feedback && (
            <div className="care-feedback" data-care-feedback>
              <Icon name="info" />
              <p><BilingualText copy={feedback} /></p>
            </div>
          )}
        </div>
      </section>

      {showCentre && (
        <ClayCard className="care-centre-panel" as="section" id="care-centre-panel">
          <div className="card-heading-row">
            <div>
              <span className="mini-label"><BilingualText copy={{ bn: "বিস্তৃত এলাকা", en: "Broad area" }} /></span>
              <h2><BilingualText copy={area} /></h2>
            </div>
            <StatusPill tone="neutral" icon="location" label={{ bn: "সঠিক GPS ব্যবহার করা হয়নি", en: "No exact GPS used" }} />
          </div>
          {centre ? (
            <div className="selected-centre-details">
              <h3><BilingualText copy={centre.name} /></h3>
              <dl className="detail-list">
                <div><dt><BilingualText copy={{ bn: "এলাকা", en: "Area" }} /></dt><dd><BilingualText copy={centre.area} /></dd></div>
                <div><dt><BilingualText copy={{ bn: "জেলা", en: "District" }} /></dt><dd><BilingualText copy={centre.district} /></dd></div>
                <div><dt><BilingualText copy={{ bn: "সেবার ধরন", en: "Service type" }} /></dt><dd><BilingualText copy={centre.serviceType} /></dd></div>
              </dl>
              {recommendedCentreId && (
                <StatusPill
                  tone={centre.id === recommendedCentreId ? "success" : "neutral"}
                  icon={centre.id === recommendedCentreId ? "check" : "info"}
                  label={centre.id === recommendedCentreId
                    ? { bn: "এই বিস্তৃত এলাকা থেকে সবচেয়ে কাছের কেন্দ্র", en: "Nearest centre to this broad area" }
                    : { bn: "নিজে বেছে নেওয়া কেন্দ্র (সবচেয়ে কাছের নয়)", en: "Your own choice (not the nearest)" }}
                />
              )}
            </div>
          ) : (
            <p>
              <BilingualText copy={{
                bn: "এই বিস্তৃত এলাকার জন্য এখনো কোনো কেন্দ্র নিজে থেকে নির্বাচন করা হয়নি। নিচের তালিকা থেকে একটি বেছে নিন।",
                en: "No centre was automatically selected for this broad area. Choose one from the list below.",
              }} />
            </p>
          )}

          {broadArea && centre && (
            <TbCentreMap area={broadArea} centre={centre} alternates={mapAlternates} onSelectCentre={selectCentre} />
          )}

          {rankedCentres.length > 0 && (
            <div className="centre-rank-list" aria-label="নিকটতম যক্ষ্মা সেবাকেন্দ্রসমূহ / Nearest TB centres">
              {rankedCentres.slice(0, 6).map((entry, index) => (
                <button
                  key={entry.centre.id}
                  type="button"
                  className={`centre-rank-option ${centre?.id === entry.centre.id ? "centre-rank-option-selected" : ""}`}
                  data-rank={index + 1}
                  onClick={() => selectCentre(entry.centre.id)}
                  disabled={Boolean(currentRecord.referral)}
                >
                  <span className="centre-rank-number" lang="en">{index + 1}</span>
                  <span className="centre-rank-details">
                    <strong><BilingualText copy={entry.centre.name} /></strong>
                    <small>
                      <BilingualText copy={{
                        bn: `${entry.centre.area.bn} · আনুমানিক ~${entry.distanceKm.toFixed(1)} কিমি`,
                        en: `${entry.centre.area.en} · about ~${entry.distanceKm.toFixed(1)} km`,
                      }} />
                    </small>
                  </span>
                  {centre?.id === entry.centre.id && <Icon name="check" />}
                </button>
              ))}
            </div>
          )}

          <div className="centre-selector">
            <label htmlFor="care-centre"><BilingualText copy={{ bn: "অথবা তালিকা থেকে সরাসরি বেছে নিন", en: "Or choose directly from the full list" }} /></label>
            <select
              id="care-centre"
              lang={language}
              value={centre?.id ?? ""}
              onChange={(event) => selectCentre(event.target.value)}
              disabled={Boolean(currentRecord.referral)}
            >
              <option value="">{language === "bn" ? "একটি কেন্দ্র বেছে নিন" : "Choose a centre"}</option>
              {rankedCentres.length > 0
                ? rankedCentres.map((entry) => (
                    <option key={entry.centre.id} value={entry.centre.id}>
                      {entry.centre.name[language]} — {entry.centre.area[language]} (~{entry.distanceKm.toFixed(1)} km)
                    </option>
                  ))
                : tbCentres.map((option) => (
                    <option key={option.id} value={option.id}>{option.name[language]} — {option.area[language]}</option>
                  ))}
            </select>
          </div>
          <p className="centre-selection-note">
            <BilingualText copy={{
                bn: "দূরত্ব বিভাগের আনুমানিক কেন্দ্রবিন্দু থেকে হিসাব করা সরলরৈখিক দূরত্ব; এটি ব্যক্তির সঠিক অবস্থান ব্যবহার করে না। ভ্রমণের আগে কেন্দ্রের পরীক্ষাসেবা ও খোলার সময় নিশ্চিত করুন। সবচেয়ে কাছের কেন্দ্রটি উপযুক্ত না হলে তালিকা বা মানচিত্র থেকে অন্য কেন্দ্র বেছে নিন।",
                en: "Distance is a straight-line estimate from the division's approximate centre point; it never uses the person's exact location. Confirm testing services and opening hours before travel. If the nearest centre does not suit you, choose another centre from the list or map.",
            }} />
          </p>
        </ClayCard>
      )}

      <div className="care-layout section-block">
        <ClayCard className="care-reopen-card" as="section">
          <div className="card-heading-row">
            <IconTile icon="screen" tone="blue" />
            <StatusPill tone="neutral" icon="shield" label={{ bn: "ঐচ্ছিক", en: "Optional" }} />
          </div>
          <h2><BilingualText copy={{ bn: "পরে আবার সেবার তথ্য খুলুন", en: "Reopen your care later" }} /></h2>
          <p>
            <BilingualText copy={currentRecord.source === "self"
              ? { bn: "ডেমো রোগী আইডি রেখে দিন। চাইলে একটি মোবাইল নম্বরও রাখতে পারেন, তখন নম্বর দিয়েই এই ব্রাউজারে সেবার তথ্য খোলা যাবে।", en: "Keep your demo patient ID. You may also save a mobile number, and then reopen care with that number in this browser." }
              : { bn: "এই ফার্মেসি সেশনে সেবার সব তথ্য দেখা যাচ্ছে। মোবাইল নম্বর থাকলে সেশন চলাকালে নম্বর দিয়েও তথ্যটি আবার খোলা যাবে। ডেমো রোগী আইডিটি লিখে রাখুন।", en: "All care information is available during this pharmacy session. With a mobile number you can reopen it during the session; write down the demo patient ID as well." }} />
          </p>
          <form className="care-phone-form" onSubmit={savePhone}>
            <label htmlFor="care-phone"><BilingualText copy={{ bn: "মোবাইল নম্বর (ঐচ্ছিক)", en: "Mobile number (optional)" }} /></label>
            <input
              id="care-phone"
              name="carePhone"
              type="tel"
              lang="en"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              value={phoneValue}
              onChange={(event) => {
                setPhoneValue(event.target.value);
                setPhoneError(false);
              }}
            />
            {phoneError && (
              <p className="care-form-error" role="alert">
                <BilingualText copy={{ bn: "১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন, যেমন 01712345678।", en: "Enter an 11-digit Bangladeshi mobile number, for example 01712345678." }} />
              </p>
            )}
            <button className="button button-secondary" type="submit">
              <BilingualText copy={currentRecord.phone ? { bn: "নম্বর হালনাগাদ করুন", en: "Update number" } : { bn: "নম্বর সংরক্ষণ করুন", en: "Save number" }} />
              <Icon name="check" />
            </button>
          </form>
          <p className="care-privacy-note">
            <BilingualText copy={{
              bn: "নম্বরটি শুধু এই ব্রাউজারে রাখা হয়। এটি সরকারি ড্যাশবোর্ডে বা অন্য কোথাও পাঠানো হয় না।",
              en: "The number stays in this browser only. It is not sent to the public-health dashboard or anywhere else.",
            }} />
          </p>
        </ClayCard>

        <ClayCard className="care-session-card" as="section">
          <div className="card-heading-row">
            <IconTile icon="shield" tone={currentRecord.source === "self" ? "teal" : "amber"} />
          </div>
          <h2><BilingualText copy={currentRecord.source === "self" ? { bn: "এই ব্রাউজারের তথ্য", en: "Information in this browser" } : { bn: "শেয়ার করা ডিভাইসের সেশন", en: "Shared-device session" } } /></h2>
          <p>
            <BilingualText copy={currentRecord.source === "self"
              ? { bn: "এই ডিভাইসে রাখা সেবার কপি চাইলে এখনই মুছে ফেলতে পারেন। সংরক্ষিত সর্বশেষ অবস্থা ডেমো রোগী আইডি দিয়ে আবার খোলা যাবে।", en: "You can remove the care copy kept on this device. The latest persisted status can still be reopened with the demo patient ID." }
              : { bn: "কাজ শেষ হলে ফার্মেসির ডিভাইস থেকে ব্রাউজার কপিটি মুছে দিন, যাতে পরের ব্যক্তি তা দেখতে না পান।", en: "When finished, clear the browser copy from the pharmacy device so the next person cannot see it." }} />
          </p>
          <button className="button button-quiet" type="button" onClick={clearCareSession} data-action="clear-care">
            <BilingualText copy={currentRecord.source === "self"
              ? { bn: "এই ব্রাউজার থেকে সেবার তথ্য মুছুন", en: "Remove care information from this browser" }
              : { bn: "সেশন শেষ করে তথ্য মুছুন", en: "End the session and clear" }} />
          </button>
          <p className="care-privacy-note">
            <BilingualText copy={{
              bn: "সরকারি ড্যাশবোর্ডে নাম, ফোন নম্বর, কাশির রেকর্ডিং বা সঠিক ঠিকানা কখনো দেখানো হয় না।",
              en: "Names, phone numbers, cough recordings, and exact addresses are never shown on the public-health dashboard.",
            }} />
          </p>
        </ClayCard>
      </div>
    </PageShell>
  );
}
