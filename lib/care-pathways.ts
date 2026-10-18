import type { Copy } from "@/components/language";

export const PATHWAY_IDS = [
  "RESPIRATORY_TB",
  "FEVER_MOSQUITO",
  "DIARRHOEA_DEHYDRATION",
  "SKIN_NERVE_LEPROSY",
  "CHILD_BREATHING",
] as const;

export type PathwayId = (typeof PATHWAY_IDS)[number];
export const AGE_BANDS = ["UNDER_5", "AGE_5_TO_17", "ADULT"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const CARE_OUTCOMES = {
  CONTINUE: "CONTINUE_WITH_CARE_INFORMATION",
  EVALUATION: "PROFESSIONAL_EVALUATION_RECOMMENDED",
  URGENT: "URGENT_MEDICAL_EVALUATION",
} as const;

export type CareOutcome = (typeof CARE_OUTCOMES)[keyof typeof CARE_OUTCOMES];
export type PathwayAnswers = Record<string, boolean | number>;

export type PathwayQuestion = {
  id: string;
  label: Copy;
  urgent?: boolean;
};

export type PathwayDefinition = {
  id: PathwayId;
  label: Copy;
  shortDescription: Copy;
  questionPrompt: Copy;
  questions: PathwayQuestion[];
  requiresCoughDays?: boolean;
  supportsCoughAudio?: boolean;
  childFocused?: boolean;
  ruleVersion: string;
};

const commonUrgent: PathwayQuestion[] = [
  { id: "severeBreathing", urgent: true, label: { en: "Is there severe difficulty breathing?", bn: "তীব্র শ্বাসকষ্ট হচ্ছে কি?" } },
  { id: "confusedOrUnresponsive", urgent: true, label: { en: "Is the person confused, very drowsy, fainting, or difficult to wake?", bn: "ব্যক্তি কি বিভ্রান্ত, খুব ঘুমঘুম, অজ্ঞান, বা জাগানো কঠিন?" } },
];

export const pathwayDefinitions: readonly PathwayDefinition[] = [
  {
    id: "RESPIRATORY_TB",
    label: { en: "Persistent cough or breathing concern", bn: "দীর্ঘস্থায়ী কাশি বা শ্বাসের উদ্বেগ" },
    shortDescription: { en: "TB-aware screening and respiratory care navigation", bn: "যক্ষ্মা-সচেতন স্ক্রিনিং ও শ্বাসতন্ত্রের সেবা নির্দেশনা" },
    questionPrompt: { en: "Answer a few respiratory and TB exposure questions.", bn: "শ্বাসতন্ত্র ও যক্ষ্মা সংস্পর্শ সম্পর্কে কয়েকটি প্রশ্নের উত্তর দিন।" },
    requiresCoughDays: true,
    supportsCoughAudio: true,
    ruleVersion: "BD-NTP-WHO-RESPIRATORY-V2",
    questions: [
      { id: "fever", label: { en: "Do you have a fever?", bn: "আপনার কি জ্বর আছে?" } },
      { id: "nightSweats", label: { en: "Do you have unusual night sweats?", bn: "রাতে কি অস্বাভাবিকভাবে ঘাম হয়?" } },
      { id: "weightLoss", label: { en: "Have you lost weight without trying?", bn: "চেষ্টা না করেও কি ওজন কমেছে?" } },
      { id: "bloodInSputum", urgent: true, label: { en: "Is there blood in your sputum when you cough?", bn: "কাশির সঙ্গে কি রক্ত আসে?" } },
      { id: "tbExposure", label: { en: "Have you been in close contact with someone who has TB?", bn: "যক্ষ্মা আছে এমন কারও কাছাকাছি কি আপনি ছিলেন?" } },
    ],
  },
  {
    id: "FEVER_MOSQUITO",
    label: { en: "Fever or mosquito-borne illness concern", bn: "জ্বর বা মশাবাহিত অসুস্থতার উদ্বেগ" },
    shortDescription: { en: "Danger-sign check and access to appropriate testing", bn: "বিপদচিহ্ন যাচাই ও উপযুক্ত পরীক্ষার সেবা খোঁজা" },
    questionPrompt: { en: "This pathway will not choose dengue or malaria. It helps you find evaluation and testing.", bn: "এই পথটি ডেঙ্গু না ম্যালেরিয়া তা নির্ধারণ করবে না। এটি মূল্যায়ন ও পরীক্ষা পেতে সাহায্য করবে।" },
    ruleVersion: "WHO-BD-FEVER-NONDIAGNOSTIC-V1",
    questions: [
      { id: "currentFever", label: { en: "Does the person currently have fever or a recent history of fever?", bn: "ব্যক্তির এখন জ্বর আছে বা সম্প্রতি জ্বর ছিল কি?" } },
      { id: "persistentVomiting", urgent: true, label: { en: "Is there repeated or persistent vomiting?", bn: "বারবার বা একটানা বমি হচ্ছে কি?" } },
      { id: "severeAbdominalPain", urgent: true, label: { en: "Is there severe or persistent abdominal pain?", bn: "তীব্র বা একটানা পেটব্যথা আছে কি?" } },
      { id: "bleeding", urgent: true, label: { en: "Is there unusual bleeding, black stool, or blood in vomit?", bn: "অস্বাভাবিক রক্তপাত, কালো পায়খানা, বা বমিতে রক্ত আছে কি?" } },
      { id: "veryLittleUrine", urgent: true, label: { en: "Is there very little urine, cold clammy skin, or marked weakness?", bn: "প্রস্রাব খুব কম, ত্বক ঠান্ডা-ঘামযুক্ত, বা খুব দুর্বল লাগছে কি?" } },
      ...commonUrgent,
    ],
  },
  {
    id: "DIARRHOEA_DEHYDRATION",
    label: { en: "Diarrhoea or dehydration concern", bn: "ডায়রিয়া বা পানিশূন্যতার উদ্বেগ" },
    shortDescription: { en: "Urgency guidance, rehydration information, and care navigation", bn: "জরুরি নির্দেশনা, খাবার স্যালাইনের তথ্য ও সেবা খোঁজা" },
    questionPrompt: { en: "Check for dehydration and signs that need professional care.", bn: "পানিশূন্যতা ও পেশাদার সেবা প্রয়োজন এমন লক্ষণ যাচাই করুন।" },
    ruleVersion: "WHO-DIARRHOEA-DEHYDRATION-V1",
    questions: [
      { id: "frequentLooseStool", label: { en: "Has the person had three or more loose or watery stools in 24 hours?", bn: "২৪ ঘণ্টায় তিনবার বা তার বেশি পাতলা বা পানির মতো পায়খানা হয়েছে কি?" } },
      { id: "bloodInStool", urgent: true, label: { en: "Is there blood in the stool?", bn: "পায়খানায় রক্ত আছে কি?" } },
      { id: "unableToDrink", urgent: true, label: { en: "Is the person unable to drink or keep fluids down?", bn: "ব্যক্তি কি পান করতে বা তরল ধরে রাখতে পারছেন না?" } },
      { id: "veryLittleUrine", urgent: true, label: { en: "Is there very little or no urine?", bn: "প্রস্রাব খুব কম বা একেবারেই হচ্ছে না কি?" } },
      { id: "sunkenEyesOrVeryThirsty", label: { en: "Are the eyes sunken, or is the person unusually thirsty or weak?", bn: "চোখ বসে গেছে, বা অস্বাভাবিক তৃষ্ণা বা দুর্বলতা আছে কি?" } },
      ...commonUrgent,
    ],
  },
  {
    id: "SKIN_NERVE_LEPROSY",
    label: { en: "Skin, sensation, or nerve concern", bn: "ত্বক, অনুভূতি বা স্নায়ুর উদ্বেগ" },
    shortDescription: { en: "Early evaluation for persistent numb patches or nerve symptoms", bn: "দীর্ঘস্থায়ী অবশ দাগ বা স্নায়ুর লক্ষণের দ্রুত মূল্যায়ন" },
    questionPrompt: { en: "This does not diagnose leprosy. A trained health worker must examine skin and nerve symptoms.", bn: "এটি কুষ্ঠ রোগ নির্ণয় করে না। প্রশিক্ষিত স্বাস্থ্যকর্মীকে ত্বক ও স্নায়ুর লক্ষণ পরীক্ষা করতে হবে।" },
    ruleVersion: "WHO-LEPROSY-REFERRAL-V1",
    questions: [
      { id: "numbPatch", label: { en: "Is there a pale, reddish, or different-looking skin patch with reduced feeling?", bn: "ফ্যাকাশে, লালচে বা ভিন্ন দেখতে এমন কোনো ত্বকের দাগে অনুভূতি কমেছে কি?" } },
      { id: "persistentTingling", label: { en: "Is there persistent numbness or tingling in a hand or foot?", bn: "হাত বা পায়ে দীর্ঘস্থায়ী অবশভাব বা ঝিনঝিনি আছে কি?" } },
      { id: "newWeakness", label: { en: "Is there new weakness of the hand, foot, or face?", bn: "হাত, পা বা মুখে নতুন দুর্বলতা আছে কি?" } },
      { id: "eyeProblem", urgent: true, label: { en: "Is there a painful red eye, sudden vision change, or inability to close an eye?", bn: "চোখ লাল ও ব্যথাযুক্ত, হঠাৎ দৃষ্টির পরিবর্তন, বা চোখ বন্ধ করতে অসুবিধা হচ্ছে কি?" } },
      { id: "infectedWound", urgent: true, label: { en: "Is there a deep, spreading, or badly infected wound on a numb hand or foot?", bn: "অবশ হাত বা পায়ে গভীর, ছড়িয়ে পড়া বা গুরুতর সংক্রমিত ক্ষত আছে কি?" } },
    ],
  },
  {
    id: "CHILD_BREATHING",
    label: { en: "Child cough or difficult breathing", bn: "শিশুর কাশি বা শ্বাসকষ্ট" },
    shortDescription: { en: "Child danger-sign check and prompt care navigation", bn: "শিশুর বিপদচিহ্ন যাচাই ও দ্রুত সেবা নির্দেশনা" },
    questionPrompt: { en: "This pathway routes a child for evaluation; it does not diagnose pneumonia.", bn: "এই পথটি শিশুকে মূল্যায়নের জন্য নির্দেশনা দেয়; এটি নিউমোনিয়া নির্ণয় করে না।" },
    childFocused: true,
    ruleVersion: "WHO-CHILD-BREATHING-V1",
    questions: [
      { id: "coughOrDifficultBreathing", label: { en: "Does the child have cough or difficult breathing?", bn: "শিশুর কি কাশি বা শ্বাস নিতে কষ্ট হচ্ছে?" } },
      { id: "fastBreathing", label: { en: "Does breathing seem unusually fast for the child?", bn: "শিশুর শ্বাস কি অস্বাভাবিক দ্রুত মনে হচ্ছে?" } },
      { id: "chestIndrawing", urgent: true, label: { en: "Does the lower chest pull inward when the child breathes?", bn: "শিশু শ্বাস নেওয়ার সময় বুকের নিচের অংশ ভেতরে ঢুকে যায় কি?" } },
      { id: "unableToFeed", urgent: true, label: { en: "Is the child unable to drink or breastfeed, or vomiting everything?", bn: "শিশু কি পান করতে বা বুকের দুধ খেতে পারছে না, বা সবকিছু বমি করছে?" } },
      { id: "blueLips", urgent: true, label: { en: "Are the lips or face blue or grey?", bn: "ঠোঁট বা মুখ নীল বা ধূসর হয়ে গেছে কি?" } },
      { id: "stridor", urgent: true, label: { en: "Is there a harsh noise when breathing while the child is calm?", bn: "শিশু শান্ত থাকা অবস্থায় শ্বাসে কর্কশ শব্দ হচ্ছে কি?" } },
      ...commonUrgent,
    ],
  },
] as const;

export function getPathway(pathwayId: PathwayId) {
  return pathwayDefinitions.find((pathway) => pathway.id === pathwayId)!;
}

export function isPathwayId(value: unknown): value is PathwayId {
  return typeof value === "string" && PATHWAY_IDS.includes(value as PathwayId);
}

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === "string" && AGE_BANDS.includes(value as AgeBand);
}

function hasTrue(answers: PathwayAnswers, keys: string[]) {
  return keys.some((key) => answers[key] === true);
}

export function evaluateCarePathway(
  pathwayId: PathwayId,
  ageBand: AgeBand,
  answers: PathwayAnswers,
): CareOutcome {
  const pathway = getPathway(pathwayId);
  if (pathway.questions.some((question) => question.urgent && answers[question.id] === true)) {
    return CARE_OUTCOMES.URGENT;
  }

  if (pathwayId === "RESPIRATORY_TB") {
    const coughDays = answers.coughDays;
    if (!Number.isSafeInteger(coughDays) || Number(coughDays) < 0) {
      throw new RangeError("coughDays must be a non-negative whole number");
    }
    return Number(coughDays) >= 14 || hasTrue(answers, ["fever", "nightSweats", "weightLoss", "tbExposure"])
      ? CARE_OUTCOMES.EVALUATION
      : CARE_OUTCOMES.CONTINUE;
  }

  if (pathwayId === "FEVER_MOSQUITO") {
    return answers.currentFever === true ? CARE_OUTCOMES.EVALUATION : CARE_OUTCOMES.CONTINUE;
  }

  if (pathwayId === "DIARRHOEA_DEHYDRATION") {
    return hasTrue(answers, ["frequentLooseStool", "sunkenEyesOrVeryThirsty"])
      ? CARE_OUTCOMES.EVALUATION
      : CARE_OUTCOMES.CONTINUE;
  }

  if (pathwayId === "SKIN_NERVE_LEPROSY") {
    return hasTrue(answers, ["numbPatch", "persistentTingling", "newWeakness"])
      ? CARE_OUTCOMES.EVALUATION
      : CARE_OUTCOMES.CONTINUE;
  }

  // Adults can still use this route for urgent/general evaluation, but the
  // product never classifies them using a child-pneumonia pathway.
  if (ageBand === "ADULT") {
    return hasTrue(answers, ["coughOrDifficultBreathing", "fastBreathing"])
      ? CARE_OUTCOMES.EVALUATION
      : CARE_OUTCOMES.CONTINUE;
  }
  return hasTrue(answers, ["coughOrDifficultBreathing", "fastBreathing"])
    ? CARE_OUTCOMES.EVALUATION
    : CARE_OUTCOMES.CONTINUE;
}

export function pathwayAnswersAreValid(pathwayId: PathwayId, answers: unknown): answers is PathwayAnswers {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  const record = answers as Record<string, unknown>;
  const pathway = getPathway(pathwayId);
  if (pathway.requiresCoughDays
    && (!Number.isSafeInteger(record.coughDays) || Number(record.coughDays) < 0 || Number(record.coughDays) > 3650)) return false;
  return pathway.questions.every((question) => typeof record[question.id] === "boolean");
}

export function outcomeNeedsReferral(outcome: CareOutcome) {
  return outcome === CARE_OUTCOMES.EVALUATION || outcome === CARE_OUTCOMES.URGENT;
}
