"use client";

import { useState, type FormEvent } from "react";
import { CoughAudioStep, type CoughAudioChoice } from "@/components/cough-audio-step";
import { Icon } from "@/components/icons";
import { BilingualText, type Copy } from "@/components/language";
import { ActionLink, ClayCard, StatusPill } from "@/components/ui";
import { careLinkFor, createCarePatientId, removeCareRecord, saveCareRecord, type CareRecord } from "@/lib/care-session";
import { broadAreas, screeningAreas, type BroadAreaId } from "@/lib/broad-areas";
import {
  evaluateSafetyRules,
  SAFETY_OUTCOMES,
  type SafetyOutcome,
} from "@/lib/safety-rules";
import { getRecommendedCentre } from "@/lib/tb-centres";
import { createScreeningId, referralLinkFor, requestReferral, type ReferralView } from "@/lib/referrals";
import { saveCompletedScreening } from "@/lib/screenings";

type Stage = "consent" | "questions" | "audio" | "referral" | "complete";
type YesNo = "" | "yes" | "no";
type ReferralChoice = "" | "continue" | "not-now";
type BroadArea = "" | BroadAreaId;

type Answers = {
  coughDays: string;
  fever: YesNo;
  nightSweats: YesNo;
  weightLoss: YesNo;
  bloodInSputum: YesNo;
  tbExposure: YesNo;
};

const emptyAnswers: Answers = {
  coughDays: "",
  fever: "",
  nightSweats: "",
  weightLoss: "",
  bloodInSputum: "",
  tbExposure: "",
};

const yesNoQuestions: Array<{ key: Exclude<keyof Answers, "coughDays">; label: Copy }> = [
  { key: "fever", label: { bn: "আপনার কি জ্বর আছে?", en: "Do you have a fever?" } },
  { key: "nightSweats", label: { bn: "রাতে কি অস্বাভাবিকভাবে ঘাম হয়?", en: "Do you have unusual night sweats?" } },
  { key: "weightLoss", label: { bn: "চেষ্টা না করেও কি ওজন কমেছে?", en: "Have you lost weight without trying?" } },
  { key: "bloodInSputum", label: { bn: "কাশির সঙ্গে কি রক্ত আসে?", en: "Is there blood in your sputum when you cough?" } },
  { key: "tbExposure", label: { bn: "যক্ষ্মা আছে এমন কারও কাছাকাছি কি আপনি ছিলেন?", en: "Have you been in close contact with someone who has TB?" } },
];

const safetyResultContent: Record<
  SafetyOutcome,
  { tone: "neutral" | "warning" | "risk"; label: Copy; title: Copy; message: Copy; emergency?: Copy }
> = {
  CONTINUE_SCREENING: {
    tone: "neutral",
    label: { bn: "স্ক্রিনিং চালিয়ে যান", en: "Continue screening" },
    title: { bn: "বর্তমান উত্তরে জরুরি বা আনুষ্ঠানিক মূল্যায়নের নির্দিষ্ট মানদণ্ড মেলেনি", en: "Your current answers did not meet a fixed urgent or formal-evaluation criterion" },
    message: { bn: "এতে যক্ষ্মা বা অন্য অসুস্থতা নেই—এমন প্রমাণ হয় না। বাকি স্ক্রিনিং চালিয়ে যান। উপসর্গ থেকে গেলে, বেড়ে গেলে বা উদ্বেগ হলে চিকিৎসাসেবা নিন।", en: "This does not rule out TB or another illness. Continue the remaining screening. Seek medical care if symptoms persist, worsen, or concern you." },
  },
  FORMAL_TB_EVALUATION_RECOMMENDED: {
    tone: "warning",
    label: { bn: "আনুষ্ঠানিক মূল্যায়ন প্রয়োজন", en: "Formal evaluation recommended" },
    title: { bn: "আপনার স্ক্রিনিং বলছে যে আনুষ্ঠানিক যক্ষ্মা মূল্যায়নের পরামর্শ দেওয়া হচ্ছে।", en: "Your screening suggests that formal TB evaluation is recommended." },
    message: { bn: "এই পরামর্শ নির্দিষ্ট লক্ষণভিত্তিক নিরাপত্তা নিয়ম থেকে এসেছে। কাশির সংকেত শুধু স্ক্রিনিংয়ে সহায়ক হতে পারে; এটি যক্ষ্মা রোগ নির্ণয় করতে পারে না বা নিরাপত্তা নিয়ম বদলাতে পারে না। এই ফলাফলের অর্থ এই নয় যে আপনার যক্ষ্মা হয়েছে। যাচাইকৃত যক্ষ্মা সেবাকেন্দ্রে মূল্যায়ন ও উপযুক্ত পরীক্ষা করান।", en: "This recommendation comes from the fixed symptom safety rules. The cough signal can support the screening; it cannot diagnose TB or change the safety rules. This result does not mean that you have TB. Please receive evaluation and appropriate testing at a verified TB centre." },
  },
  URGENT_MEDICAL_EVALUATION: {
    tone: "risk",
    label: { bn: "জরুরি চিকিৎসা মূল্যায়ন", en: "Urgent medical evaluation" },
    title: { bn: "কাশির সঙ্গে রক্তের জন্য দ্রুত চিকিৎসা মূল্যায়ন নিন", en: "Seek prompt medical evaluation for blood in your sputum" },
    message: { bn: "অল্প রক্ত হলেও দ্রুত একজন চিকিৎসকের মূল্যায়ন প্রয়োজন। এটি যক্ষ্মা রোগ নির্ণয় নয় এবং অন্য গুরুতর কারণও থাকতে পারে।", en: "Even a small amount of blood needs prompt medical assessment. This is not a TB diagnosis, and there may be another serious cause." },
    emergency: { bn: "কয়েকটি ছোট দাগের চেয়ে বেশি রক্ত এলে, শ্বাস নিতে কষ্ট হলে, হৃদস্পন্দন খুব দ্রুত হলে, অথবা বুক বা পিঠের ওপরের অংশে ব্যথা হলে এখনই ৯৯৯ নম্বরে কল করুন বা নিকটস্থ হাসপাতালের জরুরি বিভাগে যান। যক্ষ্মা সেবাকেন্দ্রের রেফারেল জরুরি চিকিৎসার বিকল্প নয়।", en: "If there is more than a few spots or streaks of blood, difficulty breathing, a very fast heartbeat, or chest or upper-back pain, call Bangladesh National Emergency Service 999 or go to the nearest hospital emergency department now. A TB-centre referral does not replace emergency care." },
  },
};

function SafetyResult({ outcome }: { outcome: SafetyOutcome }) {
  const content = safetyResultContent[outcome];

  return (
    <section
      className={`safety-result safety-result-${content.tone}`}
      data-safety-outcome={outcome}
      role={outcome === SAFETY_OUTCOMES.URGENT_EVALUATION ? "alert" : "status"}
      aria-live={outcome === SAFETY_OUTCOMES.URGENT_EVALUATION ? "assertive" : "polite"}
    >
      <StatusPill tone={content.tone} icon={outcome === SAFETY_OUTCOMES.URGENT_EVALUATION ? "info" : "shield"} label={content.label} />
      <h3><BilingualText copy={content.title} /></h3>
      <p><BilingualText copy={content.message} /></p>
      {content.emergency && <p className="emergency-instruction"><BilingualText copy={content.emergency} /></p>}
    </section>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: Copy;
}) {
  return (
    <label className={`form-choice ${checked ? "form-choice-selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <BilingualText copy={label} />
    </label>
  );
}

export function ScreeningFlow({
  isSelfUse,
  pharmacyId,
  pharmacyName,
}: {
  isSelfUse: boolean;
  pharmacyId?: string;
  pharmacyName?: Copy;
}) {
  const [stage, setStage] = useState<Stage>("consent");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [area, setArea] = useState<BroadArea>("");
  const [audioChoice, setAudioChoice] = useState<CoughAudioChoice | null>(null);
  const [audioHash, setAudioHash] = useState<string | undefined>();
  const [referralChoice, setReferralChoice] = useState<ReferralChoice>("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [createdReferral, setCreatedReferral] = useState<ReferralView | null>(null);
  const [referralPending, setReferralPending] = useState(false);
  const [referralError, setReferralError] = useState(false);
  const [screeningSaveError, setScreeningSaveError] = useState(false);

  const coughDays = Number(answers.coughDays);
  const coughDaysValid = /^\d+$/.test(answers.coughDays) && Number.isSafeInteger(coughDays);
  const questionsComplete =
    coughDaysValid &&
    yesNoQuestions.every(({ key }) => answers[key] !== "") &&
    area !== "";
  const selectedArea = broadAreas.find((broadArea) => broadArea.id === area);
  const safetyOutcome = questionsComplete
    ? evaluateSafetyRules({
        coughDays,
        fever: answers.fever === "yes",
        nightSweats: answers.nightSweats === "yes",
        weightLoss: answers.weightLoss === "yes",
        bloodInSputum: answers.bloodInSputum === "yes",
        tbExposure: answers.tbExposure === "yes",
      })
    : null;

  const stageNumber = stage === "consent" ? 1 : stage === "questions" ? 2 : stage === "audio" ? 3 : stage === "referral" ? 4 : 5;

  function submitQuestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (safetyOutcome) setStage("audio");
  }

  async function submitReferralChoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!referralChoice || !safetyOutcome || referralPending) return;

    const nextPatientId = patientId ?? createCarePatientId();
    const nextScreeningId = createScreeningId();
    const timestamp = new Date().toISOString();
    const recommendedCentre = selectedArea ? getRecommendedCentre(selectedArea) : undefined;
    const symptomAnswers = {
      coughDays,
      fever: answers.fever === "yes",
      nightSweats: answers.nightSweats === "yes",
      weightLoss: answers.weightLoss === "yes",
      bloodInSputum: answers.bloodInSputum === "yes",
      tbExposure: answers.tbExposure === "yes",
    };
    const nextCareRecord: CareRecord = {
      version: 1,
      patientId: nextPatientId,
      source: isSelfUse ? "self" : "pharmacy",
      ...(pharmacyId ? { pharmacyId } : {}),
      area,
      screeningOutcome: safetyOutcome,
      symptomAnswers,
      screeningId: nextScreeningId,
      audioChoice: audioChoice ?? "skipped",
      ...(audioHash ? { audioHash } : {}),
      referralStatus:
        referralChoice === "continue" && safetyOutcome !== SAFETY_OUTCOMES.CONTINUE
          ? "READY_TO_CONTINUE"
          : "NOT_REQUESTED",
      ...(recommendedCentre ? { selectedCentreId: recommendedCentre.centre.id } : {}),
      followUpNeeded: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    saveCareRecord(nextCareRecord);
    setPatientId(nextPatientId);
    setReferralPending(true);
    setReferralError(false);
    setScreeningSaveError(false);

    const shouldCreateReferral = referralChoice === "continue"
      && safetyOutcome !== SAFETY_OUTCOMES.CONTINUE
      && selectedArea
      && recommendedCentre;

    let screeningSaved = false;
    try {
      await saveCompletedScreening({
        screeningId: nextScreeningId,
        patientId: nextPatientId,
        sourceType: isSelfUse ? "SELF" : "PHARMACY",
        ...(pharmacyId ? { pharmacyId } : {}),
        areaName: selectedArea!.id,
        areaLatitude: selectedArea!.latitude,
        areaLongitude: selectedArea!.longitude,
        symptomAnswers,
        audioStatus: audioChoice ?? "skipped",
        ...(audioHash ? { audioHash } : {}),
        screeningResult: safetyOutcome,
      });
      screeningSaved = true;
    } catch {
      // Referral creation repeats this idempotent write in the same transaction,
      // so a transient standalone-save failure need not block a chosen referral.
    }

    if (shouldCreateReferral) {
      try {
        const referral = await requestReferral({
          screeningId: nextScreeningId,
          patientId: nextPatientId,
          sourceType: isSelfUse ? "SELF" : "PHARMACY",
          ...(pharmacyId ? { pharmacyId } : {}),
          areaName: selectedArea.id,
          areaLatitude: selectedArea.latitude,
          areaLongitude: selectedArea.longitude,
          symptomAnswers,
          audioStatus: audioChoice ?? "skipped",
          ...(audioHash ? { audioHash } : {}),
          screeningResult: safetyOutcome,
          tbCenterId: recommendedCentre.centre.id,
        });
        const savedRecord: CareRecord = {
          ...nextCareRecord,
          referralStatus: "PENDING",
          referral,
          updatedAt: new Date().toISOString(),
        };
        saveCareRecord(savedRecord);
        setCreatedReferral(referral);
        screeningSaved = true;
      } catch {
        setReferralError(true);
      }
    }

    if (!screeningSaved) setScreeningSaveError(true);
    setReferralPending(false);
    setStage("complete");
  }

  function continueAfterConsent() {
    if (consent) setStage("questions");
  }

  function clearSession() {
    if (patientId) removeCareRecord(patientId, isSelfUse ? "self" : "pharmacy");
    setStage("consent");
    setConsent(false);
    setAnswers(emptyAnswers);
    setArea("");
    setAudioChoice(null);
    setAudioHash(undefined);
    setReferralChoice("");
    setPatientId(null);
    setCreatedReferral(null);
    setReferralError(false);
    setScreeningSaveError(false);
    setReferralPending(false);
  }

  const careHref = patientId
    ? careLinkFor({ patientId, source: isSelfUse ? "self" : "pharmacy", pharmacyId })
    : "/care";

  return (
    <ClayCard className="flow-card screening-flow">
      <div className="card-heading-row">
        <div>
          <span className="mini-label">
            <BilingualText copy={{ bn: `ধাপ ${stageNumber} / ৫`, en: `Step ${stageNumber} of 5` }} />
          </span>
          <h2>
            <BilingualText
              copy={
                stage === "consent"
                  ? { bn: "শুরু করার আগে", en: "Before you begin" }
                  : stage === "questions"
                    ? { bn: "স্ক্রিনিংয়ের প্রশ্ন", en: "Screening questions" }
                    : stage === "audio"
                      ? { bn: "কাশির অডিও", en: "Cough audio" }
                      : stage === "referral"
                        ? { bn: "নিরাপত্তা ফলাফল ও আপনার সিদ্ধান্ত", en: "Safety result and your choice" }
                        : { bn: "এই ধাপটি সম্পন্ন হয়েছে", en: "This step is complete" }
              }
            />
          </h2>
        </div>
        <StatusPill
          tone={stage === "complete" ? "success" : "neutral"}
          icon={stage === "complete" ? "check" : "clock"}
          label={stage === "complete" ? { bn: "সম্পন্ন", en: "Complete" } : { bn: "প্রায় ৩ মিনিট", en: "About 3 minutes" }}
        />
      </div>

      <div className="progress-track" aria-label="স্ক্রিনিং অগ্রগতি / Screening progress">
        <span style={{ width: `${stageNumber * 20}%` }} />
      </div>

      {!isSelfUse && stage !== "complete" && (
        <div className="shared-device-note" role="note">
          <Icon name="pharmacy" />
          <p>
            <BilingualText
              copy={{
                bn: `${pharmacyName?.bn ?? "ফার্মেসি"}র ডিভাইস ব্যবহার করলেও সম্মতি, উত্তর ও রেফারেলের সিদ্ধান্ত আপনার। নিজের স্মার্টফোন বা ফোন নম্বর দরকার নেই।`,
                en: `Even when using ${pharmacyName?.en ?? "the pharmacy"}'s device, consent, answers, and the referral choice remain yours. You do not need your own smartphone or phone number.`,
              }}
            />
          </p>
        </div>
      )}

      {stage === "consent" && (
        <div data-screening-stage="consent">
          <div className="consent-preview">
            <Icon name="shield" />
            <div>
              <h3><BilingualText copy={{ bn: "আপনার সিদ্ধান্ত আপনার নিয়ন্ত্রণে", en: "You remain in control" }} /></h3>
              <ul className="consent-points" id="consent-summary">
                <li><BilingualText copy={{ bn: "এটি স্ক্রিনিং ও সেবা-দিকনির্দেশনা।", en: "This is screening and care navigation." }} /></li>
                <li><BilingualText copy={{ bn: "এটি যক্ষ্মা রোগ নির্ণয় নয়।", en: "This is not TB diagnosis." }} /></li>
                <li><BilingualText copy={{ bn: "আপনি যেকোনো সময় থামতে পারবেন।", en: "You can stop at any time." }} /></li>
              </ul>
            </div>
          </div>
          <label className="check-row">
            <input
              className="consent-checkbox"
              type="checkbox"
              aria-describedby="consent-summary"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span><BilingualText copy={{ bn: "আমি বুঝেছি এবং এগিয়ে যেতে সম্মত", en: "I understand and agree to continue" }} /></span>
          </label>
          <button className="button button-primary button-full" type="button" disabled={!consent} onClick={continueAfterConsent}>
            <BilingualText copy={{ bn: "আমি সম্মত এবং এগিয়ে যেতে চাই", en: "I Agree and Continue" }} />
            <Icon name="arrow" />
          </button>
        </div>
      )}

      {stage === "questions" && (
        <form className="screening-form" data-screening-stage="questions" onSubmit={submitQuestions}>
          <p className="form-intro">
            <BilingualText
              copy={
                isSelfUse
                  ? { bn: "প্রশ্নগুলোর উত্তর নিজে দিন।", en: "Answer the questions yourself." }
                  : { bn: "ব্যক্তিটি নিজে উত্তর দেবেন। প্রয়োজন হলে ফার্মেসি কর্মী শুধু ডিভাইস ব্যবহারে সাহায্য করতে পারেন।", en: "The person should answer. If needed, a pharmacy worker may help only with using the device." }
              }
            />
          </p>
          <div className="question-block">
            <label htmlFor="cough-days"><BilingualText copy={{ bn: "আপনার কাশি কত দিন ধরে? কাশি না থাকলে ০ লিখুন।", en: "How many days have you had a cough? Enter 0 if you do not have one." }} /></label>
            <input
              id="cough-days"
              name="coughDays"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={answers.coughDays}
              onChange={(event) => setAnswers((current) => ({ ...current, coughDays: event.target.value }))}
              required
            />
          </div>
          {yesNoQuestions.map((question) => (
            <fieldset className="question-block" key={question.key}>
              <legend><BilingualText copy={question.label} /></legend>
              <div className="answer-options">
                <Choice
                  name={question.key}
                  value="yes"
                  checked={answers[question.key] === "yes"}
                  onChange={() => setAnswers((current) => ({ ...current, [question.key]: "yes" }))}
                  label={{ bn: "হ্যাঁ", en: "Yes" }}
                />
                <Choice
                  name={question.key}
                  value="no"
                  checked={answers[question.key] === "no"}
                  onChange={() => setAnswers((current) => ({ ...current, [question.key]: "no" }))}
                  label={{ bn: "না", en: "No" }}
                />
              </div>
            </fieldset>
          ))}
          <fieldset className="question-block area-question-block">
            <legend><BilingualText copy={{ bn: "আপনি এখন কোন বিভাগে আছেন?", en: "Which division are you currently in?" }} /></legend>
            <p className="question-help">
              <BilingualText copy={{ bn: "শুধু বিভাগ বেছে নিন। সারা বাংলাদেশে কাছের যক্ষ্মা মূল্যায়ন কেন্দ্র খোঁজা ও নামবিহীন এলাকার হিসাবের জন্য এটি ব্যবহার হবে। নির্দিষ্ট ঠিকানা বা GPS প্রয়োজন নেই।", en: "Select only your division. It is used to search across Bangladesh for a nearby TB-evaluation facility and for anonymous area calculations. Your exact address or GPS is not required." }} />
            </p>
            <div className="area-options">
              {screeningAreas.map((broadArea) => (
                <Choice
                  key={broadArea.id}
                  name="area"
                  value={broadArea.id}
                  checked={area === broadArea.id}
                  onChange={() => setArea(broadArea.id)}
                  label={broadArea.label}
                />
              ))}
            </div>
          </fieldset>
          <div className="form-actions">
            <button className="button button-quiet" type="button" onClick={() => setStage("consent")}>
              <BilingualText copy={{ bn: "পেছনে যান", en: "Go back" }} />
            </button>
            <button className="button button-primary" type="submit" disabled={!questionsComplete}>
              <BilingualText copy={{ bn: "উত্তর শেষ করুন", en: "Finish answers" }} />
              <Icon name="arrow" />
            </button>
          </div>
        </form>
      )}

      {stage === "audio" && (
        <CoughAudioStep
          triageInputs={{
            coughDays,
            fever: answers.fever === "yes",
            nightSweats: answers.nightSweats === "yes",
            weightLoss: answers.weightLoss === "yes",
            bloodInSputum: answers.bloodInSputum === "yes",
          }}
          onBack={() => setStage("questions")}
          onContinue={(choice, nextAudioHash) => {
            setAudioChoice(choice);
            setAudioHash(nextAudioHash);
            setStage("referral");
          }}
          onSkip={() => {
            setAudioChoice("skipped");
            setAudioHash(undefined);
            setStage("referral");
          }}
        />
      )}

      {stage === "referral" && (
        <form className="screening-form" data-screening-stage="referral" onSubmit={submitReferralChoice}>
          {safetyOutcome && <SafetyResult outcome={safetyOutcome} />}
          <div className="consent-preview">
            <Icon name="shield" />
            <div>
              <h3><BilingualText copy={{ bn: "স্বয়ংক্রিয়ভাবে কোনো রেফারেল তৈরি হবে না", en: "No referral will be created automatically" }} /></h3>
              <p>
                <BilingualText
                  copy={
                    safetyOutcome === SAFETY_OUTCOMES.URGENT_EVALUATION
                      ? { bn: "আগে জরুরি নির্দেশনা অনুসরণ করুন। এখানের সিদ্ধান্তটি শুধু পরবর্তী যক্ষ্মা সেবাকেন্দ্রের রেফারেল নিয়ন্ত্রণ করে; এটি জরুরি চিকিৎসার বিকল্প নয়।", en: "Follow the urgent instructions first. This choice controls only a later TB-centre referral; it does not replace emergency care." }
                      : safetyOutcome === SAFETY_OUTCOMES.FORMAL_EVALUATION
                        ? { bn: "নির্দিষ্ট নিয়মে আনুষ্ঠানিক মূল্যায়নের পরামর্শ এসেছে। রেফারেলের পথে যেতে চান কি না আপনি ঠিক করবেন।", en: "The fixed rules recommend formal evaluation. You decide whether to continue to the referral pathway." }
                        : { bn: "এখন নির্দিষ্ট রেফারেল মানদণ্ড মেলেনি। বাকি স্ক্রিনিংয়ে পরে পরামর্শ এলে রেফারেলের পথে যেতে চান কি না জানাতে পারেন।", en: "No fixed referral criterion is present now. You can state whether you would want a referral if the remaining screening later recommends one." }
                  }
                />
              </p>
            </div>
          </div>
          <fieldset className="question-block referral-choice-block">
            <legend><BilingualText copy={{ bn: "আপনার পছন্দ", en: "Your choice" }} /></legend>
            <div className="referral-options">
              <Choice
                name="referral-choice"
                value="continue"
                checked={referralChoice === "continue"}
                onChange={() => setReferralChoice("continue")}
                label={{ bn: "পরামর্শ এলে রেফারেলের পথে যেতে চাই", en: "Continue to referral if recommended" }}
              />
              <Choice
                name="referral-choice"
                value="not-now"
                checked={referralChoice === "not-now"}
                onChange={() => setReferralChoice("not-now")}
                label={{ bn: "এখন রেফারেল তৈরি করবেন না", en: "Do not create a referral now" }}
              />
            </div>
          </fieldset>
          <div className="form-actions">
            <button className="button button-quiet" type="button" onClick={() => setStage("audio")}>
              <BilingualText copy={{ bn: "অডিও ধাপে ফিরুন", en: "Return to audio step" }} />
            </button>
            <button className="button button-primary" type="submit" disabled={!referralChoice || referralPending}>
              <BilingualText copy={referralPending
                ? { bn: "রেফারেল তৈরি হচ্ছে…", en: "Creating referral…" }
                : { bn: "আমার সিদ্ধান্ত নিশ্চিত করুন", en: "Confirm my choice" }} />
              <Icon name="check" />
            </button>
          </div>
        </form>
      )}

      {stage === "complete" && (
        <div className="screening-complete" data-screening-stage="complete" aria-live="polite">
          <StatusPill tone="success" icon="check" label={{ bn: "আপনার পছন্দ নথিভুক্ত হয়েছে", en: "Your choice has been recorded" }} />
          {safetyOutcome && <SafetyResult outcome={safetyOutcome} />}
          <h3>
            <BilingualText
              copy={
                referralChoice === "continue"
                  ? { bn: "প্রয়োজন হলে আপনি রেফারেলের পথে যেতে চান", en: "You want to continue to referral if needed" }
                  : { bn: "এখন কোনো রেফারেল তৈরি হবে না", en: "No referral will be created now" }
              }
            />
          </h3>
          {selectedArea && (
            <p className="selected-area-summary">
              <BilingualText copy={{ bn: `নির্বাচিত বিস্তৃত এলাকা: ${selectedArea.label.bn}`, en: `Selected broad area: ${selectedArea.label.en}` }} />
            </p>
          )}
          <p className="audio-choice-summary">
            <BilingualText
              copy={
                audioChoice === "recorded"
                  ? { bn: "কাশির অডিও: এই ডিভাইসে রেকর্ড করা হয়েছে", en: "Cough audio: recorded on this device" }
                  : audioChoice === "uploaded"
                    ? { bn: "কাশির অডিও: ডিভাইস থেকে আপলোড করা হয়েছে", en: "Cough audio: uploaded from the device" }
                    : { bn: "কাশির অডিও: এইবার দেওয়া হয়নি", en: "Cough audio: skipped for now" }
              }
            />
          </p>
          {createdReferral ? (
            <p className="referral-created-message" role="status">
              <BilingualText copy={{
                bn: `রেফারেল ${createdReferral.referralId} তৈরি হয়েছে এবং অবস্থা PENDING রাখা হয়েছে।`,
                en: `Referral ${createdReferral.referralId} was created with PENDING status.`,
              }} />
            </p>
          ) : referralError ? (
            <p className="screening-inline-error" role="alert">
              <BilingualText copy={{
                bn: "রেফারেলটি এখন তৈরি করা যায়নি। আপনার স্ক্রিনিং ও সিদ্ধান্ত ‘আমার সেবা’ পাতায় রাখা আছে—সেখান থেকে আবার চেষ্টা করুন।",
                en: "The referral could not be created now. Your screening and choice are saved in My Care, where you can try again.",
              }} />
            </p>
          ) : (
            <p><BilingualText copy={{
              bn: referralChoice === "continue" && safetyOutcome === SAFETY_OUTCOMES.CONTINUE
                ? "নির্দিষ্ট রেফারেল মানদণ্ড না মেলায় কোনো রেফারেল তৈরি হয়নি।"
                : "আপনার সিদ্ধান্ত অনুযায়ী কোনো রেফারেল তৈরি হয়নি।",
              en: referralChoice === "continue" && safetyOutcome === SAFETY_OUTCOMES.CONTINUE
                ? "No referral was created because no fixed referral criterion was met."
                : "No referral was created, in line with your choice.",
            }} /></p>
          )}
          {screeningSaveError && (
            <p className="screening-inline-error" role="alert">
              <BilingualText copy={{
                bn: "স্ক্রিনিংটি এই ডিভাইসে রাখা আছে, তবে অনলাইন ফার্মেসি হিসাব এখন হালনাগাদ করা যায়নি। সংযোগ ঠিক হলে নতুন করে চেষ্টা করুন।",
                en: "The screening remains on this device, but the online pharmacy totals could not be updated. Try again when the connection is restored.",
              }} />
            </p>
          )}
          <p className="shared-device-privacy"><BilingualText copy={{ bn: "এটি শেয়ার করা ফার্মেসি ডিভাইস হলে নিচের বোতাম দিয়ে এই পাতার উত্তর মুছে দিন।", en: "If this is a shared pharmacy device, use the button below to clear the answers from this page." }} /></p>
          {patientId && (
            <div className="patient-id-card">
              <span><BilingualText copy={{ bn: "সেশন আইডি", en: "Session ID" }} /></span>
              <code lang="en">{patientId}</code>
              <small><BilingualText copy={isSelfUse ? { bn: "এই ব্রাউজারে আমার সেবা আবার খুলতে আইডিটি রাখুন।", en: "Keep this ID to reopen My Care in this browser." } : { bn: "এই ফার্মেসি সেশন চলাকালে সেবার তথ্য খুলতে আইডিটি ব্যবহার করুন।", en: "Use this ID to open the care information during this pharmacy session." }} /></small>
            </div>
          )}
          <div className="button-row screening-complete-actions">
            {createdReferral && <ActionLink href={referralLinkFor(createdReferral.accessToken)} icon="document" label={{ bn: "রেফারেল ও কিউআর দেখুন", en: "View referral and QR" }} />}
            {patientId && <ActionLink href={careHref} icon="care" label={isSelfUse ? { bn: "আমার সেবা", en: "My Care" } : { bn: "সেবার তথ্য দেখুন", en: "View care information" }} />}
            {patientId && isSelfUse && <ActionLink href={`/account?saveCare=${encodeURIComponent(patientId)}`} icon="users" label={{ bn: "অ্যাকাউন্টে সেবা সংরক্ষণ", en: "Save care to account" }} />}
            <button className="button button-secondary" type="button" onClick={clearSession}>
              <BilingualText copy={{ bn: "উত্তর মুছে নতুন করে শুরু করুন", en: "Clear answers and start again" }} />
            </button>
          </div>
        </div>
      )}
    </ClayCard>
  );
}
