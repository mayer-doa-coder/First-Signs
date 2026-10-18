"use client";

import { useState, type FormEvent } from "react";
import { CoughAudioStep, type CoughAudioChoice } from "@/components/cough-audio-step";
import { BilingualText, type Copy } from "@/components/language";
import { Icon } from "@/components/icons";
import { ActionLink, ClayCard, StatusPill } from "@/components/ui";
import { broadAreas, screeningAreas, type BroadAreaId } from "@/lib/broad-areas";
import {
  AGE_BANDS, CARE_OUTCOMES, evaluateCarePathway, getPathway, outcomeNeedsReferral,
  pathwayDefinitions, type AgeBand, type CareOutcome, type PathwayAnswers, type PathwayId,
} from "@/lib/care-pathways";
import { createCareSignalId, submitCareSignal } from "@/lib/care-signals";
import { careLinkFor, createCarePatientId, removeCareRecord, saveCareRecord, type CareRecord } from "@/lib/care-session";
import { createScreeningId, referralLinkFor, requestReferral, type ReferralView } from "@/lib/referrals";
import { saveCompletedScreening } from "@/lib/screenings";
import { facilityServiceForPathway, getRecommendedFacility } from "@/lib/tb-centres";

type Stage = "concern" | "consent" | "questions" | "audio" | "referral" | "complete";
type YesNo = "" | "yes" | "no";

const ageLabels: Record<AgeBand, Copy> = {
  UNDER_5: { en: "Under 5 years", bn: "৫ বছরের কম" },
  AGE_5_TO_17: { en: "5 to 17 years", bn: "৫ থেকে ১৭ বছর" },
  ADULT: { en: "18 years or older", bn: "১৮ বছর বা বেশি" },
};

const outcomeContent: Record<CareOutcome, { tone: "neutral" | "warning" | "risk"; label: Copy; message: Copy }> = {
  CONTINUE_WITH_CARE_INFORMATION: {
    tone: "neutral", label: { en: "Care information", bn: "সেবার তথ্য" },
    message: { en: "No fixed referral or urgent criterion was found. This does not rule out illness. Seek care if symptoms continue, worsen, or concern you.", bn: "নির্দিষ্ট রেফারেল বা জরুরি মানদণ্ড পাওয়া যায়নি। এতে অসুস্থতা নেই প্রমাণ হয় না। লক্ষণ চলতে থাকলে, বাড়লে বা উদ্বেগ হলে সেবা নিন।" },
  },
  PROFESSIONAL_EVALUATION_RECOMMENDED: {
    tone: "warning", label: { en: "Professional evaluation recommended", bn: "পেশাদার মূল্যায়নের পরামর্শ" },
    message: { en: "The fixed safety rules recommend evaluation by a trained health worker. This is care navigation, not a diagnosis.", bn: "নির্দিষ্ট নিরাপত্তা নিয়ম অনুযায়ী প্রশিক্ষিত স্বাস্থ্যকর্মীর মূল্যায়নের পরামর্শ দেওয়া হচ্ছে। এটি সেবা নির্দেশনা, রোগ নির্ণয় নয়।" },
  },
  URGENT_MEDICAL_EVALUATION: {
    tone: "risk", label: { en: "Urgent medical evaluation", bn: "জরুরি চিকিৎসা মূল্যায়ন" },
    message: { en: "A danger sign was reported. Go to the nearest hospital emergency department now or call Bangladesh National Emergency Service 999. A referral does not replace emergency care.", bn: "একটি বিপদচিহ্ন জানানো হয়েছে। এখনই নিকটস্থ হাসপাতালের জরুরি বিভাগে যান বা বাংলাদেশ জাতীয় জরুরি সেবা ৯৯৯-এ কল করুন। রেফারেল জরুরি চিকিৎসার বিকল্প নয়।" },
  },
};

function Choice({ name, value, checked, onChange, label }: { name: string; value: string; checked: boolean; onChange: () => void; label: Copy }) {
  return <label className={`choice-card ${checked ? "choice-card-selected" : ""}`}><input type="radio" name={name} value={value} checked={checked} onChange={onChange} /><span><BilingualText copy={label} /></span></label>;
}

async function retryOnce(action: () => Promise<unknown>) {
  try { await action(); } catch { await new Promise((resolve) => window.setTimeout(resolve, 350)); await action(); }
}

export function ScreeningFlow({ isSelfUse, pharmacyId, pharmacyName }: { isSelfUse: boolean; pharmacyId?: string; pharmacyName?: Copy }) {
  const [stage, setStage] = useState<Stage>("concern");
  const [pathwayId, setPathwayId] = useState<PathwayId | null>(null);
  const [ageBand, setAgeBand] = useState<AgeBand | "">("");
  const [area, setArea] = useState<BroadAreaId | "">("");
  const [coughDays, setCoughDays] = useState("");
  const [answers, setAnswers] = useState<Record<string, YesNo>>({});
  const [audioChoice, setAudioChoice] = useState<CoughAudioChoice>("skipped");
  const [audioHash, setAudioHash] = useState<string>();
  const [outcome, setOutcome] = useState<CareOutcome | null>(null);
  const [createdReferral, setCreatedReferral] = useState<ReferralView | null>(null);
  const [patientId, setPatientId] = useState<string>();
  const [screeningId, setScreeningId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [signalError, setSignalError] = useState(false);

  const pathway = pathwayId ? getPathway(pathwayId) : null;
  const selectedArea = area ? broadAreas.find((candidate) => candidate.id === area) : undefined;
  const recommended = selectedArea && pathwayId ? getRecommendedFacility(selectedArea, pathwayId) : undefined;
  const questionsComplete = Boolean(pathway && ageBand && area
    && (!pathway.requiresCoughDays || (/^\d+$/.test(coughDays) && Number(coughDays) <= 3650))
    && pathway.questions.every((question) => answers[question.id] === "yes" || answers[question.id] === "no"));

  const answerPayload: PathwayAnswers = (() => {
    const result: PathwayAnswers = {};
    if (pathway?.requiresCoughDays) result.coughDays = Number(coughDays || 0);
    pathway?.questions.forEach((question) => { result[question.id] = answers[question.id] === "yes"; });
    return result;
  })();

  function choosePathway(id: PathwayId) {
    setPathwayId(id); setAnswers({}); setCoughDays(""); setOutcome(null); setStage("consent");
  }

  async function finishQuestions(event: FormEvent) {
    event.preventDefault();
    if (!pathway || !pathwayId || !ageBand || !selectedArea || !questionsComplete) return;
    const nextOutcome = evaluateCarePathway(pathwayId, ageBand, answerPayload);
    setOutcome(nextOutcome);
    const signalId = createCareSignalId();
    retryOnce(() => submitCareSignal({ signalId, pathwayId, ageBand, careOutcome: nextOutcome, sourceType: isSelfUse ? "SELF" : "PHARMACY", areaName: selectedArea.id }))
      .catch(() => setSignalError(true));
    setStage(pathway.supportsCoughAudio ? "audio" : "referral");
  }

  async function finishFlow(createReferral: boolean) {
    if (!pathway || !pathwayId || !ageBand || !selectedArea || !outcome || !recommended || busy) return;
    setBusy(true); setSaveError(false);
    const nextPatientId = patientId ?? createCarePatientId();
    const nextScreeningId = screeningId ?? createScreeningId();
    setPatientId(nextPatientId); setScreeningId(nextScreeningId);
    const common = {
      screeningId: nextScreeningId, patientId: nextPatientId,
      sourceType: isSelfUse ? "SELF" as const : "PHARMACY" as const,
      ...(pharmacyId ? { pharmacyId } : {}), pathwayId, ruleVersion: pathway.ruleVersion, ageBand,
      areaName: selectedArea.id, areaLatitude: selectedArea.latitude, areaLongitude: selectedArea.longitude,
      symptomAnswers: answerPayload, audioStatus: audioChoice, ...(audioHash ? { audioHash } : {}), screeningResult: outcome,
    };
    let referral: ReferralView | null = null;
    try {
      await retryOnce(() => saveCompletedScreening(common));
      if (createReferral && outcomeNeedsReferral(outcome)) {
        referral = await requestReferral({ ...common, facilityId: recommended.centre.id });
        setCreatedReferral(referral);
      }
    } catch { setSaveError(true); }

    const now = new Date().toISOString();
    const careRecord: CareRecord = {
      version: 1, patientId: nextPatientId, source: isSelfUse ? "self" : "pharmacy", ...(pharmacyId ? { pharmacyId } : {}),
      pathwayId, ruleVersion: pathway.ruleVersion, ageBand, area: selectedArea.id, screeningOutcome: outcome,
      symptomAnswers: answerPayload, screeningId: nextScreeningId, audioChoice, ...(audioHash ? { audioHash } : {}),
      referralStatus: referral ? "PENDING" : outcomeNeedsReferral(outcome) && createReferral ? "READY_TO_CONTINUE" : "NOT_REQUESTED",
      selectedCentreId: recommended.centre.id, ...(referral ? { referral } : {}), followUpNeeded: false, createdAt: now, updatedAt: now,
    };
    saveCareRecord(careRecord); setStage("complete"); setBusy(false);
  }

  function clearSession() {
    if (patientId) removeCareRecord(patientId, isSelfUse ? "self" : "pharmacy");
    setStage("concern"); setPathwayId(null); setAgeBand(""); setArea(""); setAnswers({}); setCoughDays("");
    setOutcome(null); setCreatedReferral(null); setPatientId(undefined); setScreeningId(undefined); setSaveError(false); setSignalError(false);
  }

  return <ClayCard className="screening-card" as="section">
    <div className="screening-progress" aria-label="Screening progress"><span className="mini-label"><BilingualText copy={{ en: "Care navigation", bn: "সেবা নির্দেশনা" }} /></span><strong><BilingualText copy={pathway?.label ?? { en: "Choose a health concern", bn: "স্বাস্থ্য উদ্বেগ বেছে নিন" }} /></strong></div>

    {stage === "concern" && <div data-screening-stage="concern">
      <h2><BilingualText copy={{ en: "What health concern brings you here today?", bn: "আজ কোন স্বাস্থ্য উদ্বেগ নিয়ে এসেছেন?" }} /></h2>
      <p><BilingualText copy={{ en: "Choose one concern. First Signs provides urgency guidance and helps you reach care; it does not diagnose an illness.", bn: "একটি উদ্বেগ বেছে নিন। ফার্স্ট সাইনস জরুরি নির্দেশনা দেয় ও সেবা পেতে সাহায্য করে; এটি রোগ নির্ণয় করে না।" }} /></p>
      <div className="pathway-grid">{pathwayDefinitions.map((item) => <button className="pathway-card" type="button" key={item.id} onClick={() => choosePathway(item.id)}><strong><BilingualText copy={item.label} /></strong><span><BilingualText copy={item.shortDescription} /></span><Icon name="arrow" /></button>)}</div>
    </div>}

    {stage === "consent" && pathway && <div data-screening-stage="consent">
      <StatusPill tone="neutral" icon="shield" label={{ en: "Consent", bn: "সম্মতি" }} />
      <h2><BilingualText copy={{ en: "Before the short check", bn: "সংক্ষিপ্ত যাচাইয়ের আগে" }} /></h2><p><BilingualText copy={pathway.questionPrompt} /></p>
      <div className="consent-preview"><Icon name="shield" /><p><BilingualText copy={{ en: "With your consent, we will save the answers and broad division needed for care navigation. Government views receive anonymous grouped signals only—never your identity, answers, token, or audio.", bn: "আপনার সম্মতিতে সেবা নির্দেশনার জন্য উত্তর ও শুধু বিভাগ সংরক্ষণ করা হবে। সরকারি ভিউতে শুধু নামবিহীন সমষ্টিগত সংকেত যাবে—পরিচয়, উত্তর, টোকেন বা অডিও নয়।" }} /></p></div>
      <div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setStage("concern")}><BilingualText copy={{ en: "Choose another concern", bn: "অন্য উদ্বেগ বেছে নিন" }} /></button><button className="button button-primary" type="button" onClick={() => setStage("questions")}><BilingualText copy={{ en: "I consent — continue", bn: "আমি সম্মতি দিচ্ছি — এগিয়ে যান" }} /><Icon name="arrow" /></button></div>
    </div>}

    {stage === "questions" && pathway && <form className="screening-form" data-screening-stage="questions" onSubmit={(event) => void finishQuestions(event)}>
      <h2><BilingualText copy={pathway.label} /></h2>
      <fieldset className="question-block"><legend><BilingualText copy={{ en: "Age group", bn: "বয়সের শ্রেণি" }} /></legend><div className="answer-options age-options">{AGE_BANDS.map((band) => <Choice key={band} name="age-band" value={band} checked={ageBand === band} onChange={() => setAgeBand(band)} label={ageLabels[band]} />)}</div>{pathway.childFocused && ageBand === "ADULT" && <p className="question-help"><BilingualText copy={{ en: "For an adult, this route gives general urgent-care navigation and does not classify pneumonia.", bn: "প্রাপ্তবয়স্কের জন্য এই পথটি সাধারণ জরুরি সেবা নির্দেশনা দেয় এবং নিউমোনিয়া শ্রেণিবিন্যাস করে না।" }} /></p>}</fieldset>
      {pathway.requiresCoughDays && <div className="question-block"><label htmlFor="cough-days"><BilingualText copy={{ en: "How many days has the cough lasted? Enter 0 if there is no cough.", bn: "কাশি কত দিন ধরে? কাশি না থাকলে ০ লিখুন।" }} /></label><input id="cough-days" type="number" min="0" max="3650" step="1" inputMode="numeric" value={coughDays} onChange={(event) => setCoughDays(event.target.value)} required /></div>}
      {pathway.questions.map((question) => <fieldset className="question-block" key={question.id}><legend><BilingualText copy={question.label} /></legend><div className="answer-options"><Choice name={question.id} value="yes" checked={answers[question.id] === "yes"} onChange={() => setAnswers((current) => ({ ...current, [question.id]: "yes" }))} label={{ en: "Yes", bn: "হ্যাঁ" }} /><Choice name={question.id} value="no" checked={answers[question.id] === "no"} onChange={() => setAnswers((current) => ({ ...current, [question.id]: "no" }))} label={{ en: "No", bn: "না" }} /></div></fieldset>)}
      <fieldset className="question-block area-question-block"><legend><BilingualText copy={{ en: "Which division are you in now?", bn: "আপনি এখন কোন বিভাগে আছেন?" }} /></legend><p className="question-help"><BilingualText copy={{ en: "Only a broad division is used—never an exact address or GPS point.", bn: "শুধু বিভাগ ব্যবহার করা হবে—সঠিক ঠিকানা বা GPS অবস্থান নয়।" }} /></p><div className="area-options">{screeningAreas.map((item) => <Choice key={item.id} name="area" value={item.id} checked={area === item.id} onChange={() => setArea(item.id)} label={item.label} />)}</div></fieldset>
      <div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setStage("consent")}><BilingualText copy={{ en: "Go back", bn: "পেছনে যান" }} /></button><button className="button button-primary" type="submit" disabled={!questionsComplete}><BilingualText copy={{ en: "See guidance", bn: "নির্দেশনা দেখুন" }} /><Icon name="arrow" /></button></div>
    </form>}

    {stage === "audio" && pathwayId === "RESPIRATORY_TB" && <CoughAudioStep triageInputs={{ coughDays: Number(coughDays), fever: answers.fever === "yes", nightSweats: answers.nightSweats === "yes", weightLoss: answers.weightLoss === "yes", bloodInSputum: answers.bloodInSputum === "yes" }} onBack={() => setStage("questions")} onContinue={(choice, nextHash) => { setAudioChoice(choice); setAudioHash(nextHash); setStage("referral"); }} onSkip={() => { setAudioChoice("skipped"); setAudioHash(undefined); setStage("referral"); }} />}

    {stage === "referral" && outcome && pathway && recommended && <div data-screening-stage="referral">
      <div className={`safety-result safety-result-${outcomeContent[outcome].tone}`} role={outcome === CARE_OUTCOMES.URGENT ? "alert" : "status"}><StatusPill tone={outcomeContent[outcome].tone} icon="shield" label={outcomeContent[outcome].label} /><p><BilingualText copy={outcomeContent[outcome].message} /></p></div>
      {pathwayId === "FEVER_MOSQUITO" && <p className="non-diagnostic-note"><BilingualText copy={{ en: "Fever symptoms overlap. First Signs does not infer dengue rather than malaria; testing and professional evaluation are needed.", bn: "জ্বরের লক্ষণ একে অপরের সঙ্গে মিলে যায়। ফার্স্ট সাইনস ডেঙ্গু না ম্যালেরিয়া তা অনুমান করে না; পরীক্ষা ও পেশাদার মূল্যায়ন প্রয়োজন।" }} /></p>}
      {signalError && <p className="screening-inline-error" role="status"><BilingualText copy={{ en: "The anonymous area signal could not be sent yet. You can still continue with care navigation.", bn: "নামবিহীন এলাকার সংকেত এখন পাঠানো যায়নি। তবুও সেবা নির্দেশনা চালিয়ে যেতে পারেন।" }} /></p>}
      <div className="facility-recommendation"><span className="mini-label"><BilingualText copy={{ en: "Nearest listed care option", bn: "নিকটতম তালিকাভুক্ত সেবা বিকল্প" }} /></span><h3><BilingualText copy={recommended.centre.name} /></h3><p><BilingualText copy={recommended.centre.area} /> · <BilingualText copy={recommended.centre.district} /></p><p><BilingualText copy={facilityServiceForPathway(recommended.centre, pathwayId!)} /></p><small><BilingualText copy={{ en: "Call or confirm service availability before travel when possible.", bn: "সম্ভব হলে যাওয়ার আগে ফোন করে সেবার প্রাপ্যতা নিশ্চিত করুন।" }} /></small></div>
      <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => void finishFlow(false)} disabled={busy}><BilingualText copy={{ en: "Save guidance only", bn: "শুধু নির্দেশনা সংরক্ষণ করুন" }} /></button>{outcomeNeedsReferral(outcome) ? <button className="button button-primary" type="button" onClick={() => void finishFlow(true)} disabled={busy}><BilingualText copy={busy ? { en: "Creating referral…", bn: "রেফারেল তৈরি হচ্ছে…" } : { en: "Create referral", bn: "রেফারেল তৈরি করুন" }} /><Icon name="arrow" /></button> : <button className="button button-primary" type="button" onClick={() => void finishFlow(false)} disabled={busy}><BilingualText copy={busy ? { en: "Saving…", bn: "সংরক্ষণ হচ্ছে…" } : { en: "Save to My Care", bn: "আমার সেবায় সংরক্ষণ করুন" }} /><Icon name="check" /></button>}</div>
    </div>}

    {stage === "complete" && outcome && pathway && patientId && <div className="screening-complete" data-screening-stage="complete" aria-live="polite">
      <StatusPill tone={saveError ? "warning" : "success"} icon={saveError ? "info" : "check"} label={saveError ? { en: "Saved on this device", bn: "এই ডিভাইসে সংরক্ষিত" } : { en: "Care journey saved", bn: "সেবার যাত্রা সংরক্ষিত" }} />
      <h2><BilingualText copy={pathway.label} /></h2><p><BilingualText copy={outcomeContent[outcome].message} /></p>
      {saveError && <p className="screening-inline-error" role="alert"><BilingualText copy={{ en: "The online record could not be updated after one retry. Your guidance remains in My Care on this device.", bn: "একবার পুনরায় চেষ্টা করেও অনলাইন রেকর্ড হালনাগাদ হয়নি। এই ডিভাইসের আমার সেবায় নির্দেশনা রাখা আছে।" }} /></p>}
      {createdReferral && <p><BilingualText copy={{ en: `Referral ${createdReferral.referralId} is pending.`, bn: `রেফারেল ${createdReferral.referralId} অপেক্ষমাণ আছে।` }} /></p>}
      <div className="button-row screening-complete-actions">{createdReferral && <ActionLink href={referralLinkFor(createdReferral.accessToken)} icon="document" label={{ en: "View referral and QR", bn: "রেফারেল ও কিউআর দেখুন" }} />}<ActionLink href={careLinkFor({ patientId, source: isSelfUse ? "self" : "pharmacy", ...(pharmacyId ? { pharmacyId } : {}) })} icon="care" label={{ en: "Open My Care", bn: "আমার সেবা খুলুন" }} /><button className="button button-secondary" type="button" onClick={clearSession}><BilingualText copy={{ en: "Clear and start again", bn: "মুছে আবার শুরু করুন" }} /></button></div>
      {!isSelfUse && pharmacyName && <small><BilingualText copy={{ en: `Assisted by ${pharmacyName.en}. Simulated credits apply only to this pharmacy-assisted journey.`, bn: `${pharmacyName.bn}-এর সহায়তায়। সিমুলেটেড ক্রেডিট শুধু এই ফার্মেসি-সহায়িত যাত্রায় প্রযোজ্য।` }} /></small>}
    </div>}
  </ClayCard>;
}
