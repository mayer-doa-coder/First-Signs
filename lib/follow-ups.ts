import type { Copy } from "../components/language";
import { REFERRAL_STATUSES, REFERRAL_TOKEN_PATTERN, type ReferralStatus } from "./referrals";
import {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_BARRIERS,
  type FollowUpAction,
  type FollowUpBarrier,
} from "./follow-up-categories";

export {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_BARRIERS,
  type FollowUpAction,
  type FollowUpBarrier,
} from "./follow-up-categories";
export type FollowUpStatus = "AWAITING_BARRIER" | "ACTION_READY";

export type FollowUpView = {
  referralId: string;
  referralStatus: ReferralStatus;
  status: FollowUpStatus | null;
  barrier: FollowUpBarrier | null;
  nextAction: FollowUpAction | null;
  createdAt: string | null;
};

export const followUpBarrierLabels: Record<FollowUpBarrier, Copy> = {
  WORK_SCHEDULE: { bn: "কাজের সময়ের সঙ্গে মিলছে না", en: "Work schedule" },
  CENTRE_TOO_FAR: { bn: "সেবাকেন্দ্র অনেক দূরে", en: "Centre too far" },
  FEAR: { bn: "ভয় লাগছে", en: "Fear" },
  STIGMA: { bn: "লোকলজ্জা বা বৈষম্যের চিন্তা", en: "Stigma or discrimination" },
  TRANSPORT_PROBLEM: { bn: "যাতায়াতের সমস্যা", en: "Transport problem" },
  DID_NOT_UNDERSTAND: { bn: "কেন যেতে হবে বুঝিনি", en: "Did not understand" },
  OTHER: { bn: "অন্য কারণ", en: "Other" },
};

export const followUpActionCopy: Record<FollowUpAction, { title: Copy; detail: Copy }> = {
  PLAN_SUITABLE_TIME: {
    title: { bn: "যেতে পারবেন এমন দিন ও সময় ঠিক করুন", en: "Plan a day and time you can attend" },
    detail: {
      bn: "রেফারেল কিউআরটি সঙ্গে রাখুন। কাজের সময়ের কারণে যাওয়া কঠিন হলে সমন্বয়ের সহায়তার জন্য সেবাকেন্দ্র বা একজন সহায়তাকারীর সঙ্গে কথা বলুন।",
      en: "Keep the referral QR with you. If work makes attendance difficult, ask the centre or a support person for help coordinating a practical visit.",
    },
  },
  SHOW_ANOTHER_CENTRE: {
    title: { bn: "কাছের অন্য যাচাইকৃত সেবাকেন্দ্র দেখুন", en: "Review another nearby verified centre" },
    detail: {
      bn: "নিচের তালিকায় কাছের বিকল্পগুলো দেখুন। আপনার বর্তমান রেফারেলে আগের কেন্দ্রটির নামই আছে; অন্য কেন্দ্রে যাওয়ার আগে সহায়তা নিয়ে রেফারেলের কেন্দ্রটি বদলাতে হবে।",
      en: "Review nearby alternatives below. Your current referral still names the original centre; get help changing the intended centre before using the referral elsewhere.",
    },
  },
  EXPLAIN_EVALUATION: {
    title: { bn: "মূল্যায়নে কী হবে তা সহজভাবে জানুন", en: "Understand what the evaluation involves" },
    detail: {
      bn: "রেফারেলের অর্থ আপনার যক্ষ্মা হয়েছে—এমন নয়। প্রশিক্ষিত কর্মী উপসর্গ ও ইতিহাস দেখবেন এবং প্রয়োজন অনুযায়ী পরীক্ষা বেছে নেবেন। কেবল আনুষ্ঠানিক মূল্যায়নই কারণটি বুঝতে সাহায্য করতে পারে।",
      en: "A referral does not mean that you have TB. Trained staff will review your symptoms and history and choose tests when appropriate. Only formal evaluation can help identify the cause.",
    },
  },
  PRIVACY_AND_SUPPORT: {
    title: { bn: "গোপনীয়তা রেখে সহায়তা নিন", en: "Seek support while protecting your privacy" },
    detail: {
      bn: "লোকলজ্জা বা বৈষম্যের চিন্তা বাস্তব এবং আপনার দোষ নয়। রেফারেল কিউআরটি ব্যক্তিগত রাখুন, শুধু সেবাকেন্দ্রের কর্মীকে দেখান, এবং চাইলে বিশ্বাসযোগ্য কাউকে সঙ্গে নিন বা মানবিক সহায়তা চান।",
      en: "Concern about stigma or discrimination is real and is not your fault. Keep the referral QR private, show it only to centre staff, and consider a trusted companion or human support.",
    },
  },
  SEEK_TRANSPORT_SUPPORT: {
    title: { bn: "যাতায়াতের সহায়তা বা কাছের বিকল্প দেখুন", en: "Explore travel support or a nearer option" },
    detail: {
      bn: "কাছের যাচাইকৃত কেন্দ্রগুলো দেখুন এবং যাতায়াতের জন্য বিশ্বাসযোগ্য ব্যক্তি বা সহায়তাকারীর সাহায্য নিন। এই প্রোটোটাইপ নিজে পরিবহন বা ভাড়া দেয় না।",
      en: "Review nearby verified centres and ask a trusted person or support worker for travel help. This prototype does not provide transport or fares.",
    },
  },
  EXPLAIN_WHY_EVALUATION_MATTERS: {
    title: { bn: "কেন আনুষ্ঠানিক মূল্যায়ন দরকার তা জানুন", en: "Understand why formal evaluation matters" },
    detail: {
      bn: "একই উপসর্গের বিভিন্ন কারণ থাকতে পারে। স্ক্রিনিং রোগ নির্ণয় করে না; সেবাকেন্দ্রের মূল্যায়ন ও উপযুক্ত পরীক্ষা কারণটি বুঝতে এবং সঠিক পরবর্তী সেবা ঠিক করতে সাহায্য করে।",
      en: "The same symptoms can have different causes. Screening does not diagnose TB; evaluation and appropriate testing at the centre help determine the cause and the right next care.",
    },
  },
  HUMAN_SUPPORT: {
    title: { bn: "মানবিক সহায়তার জন্য চিহ্নিত করা হয়েছে", en: "Marked for human support" },
    detail: {
      bn: "আপনার অন্য কারণটি নথিভুক্ত হয়েছে। এটি একটি প্রোটোটাইপ—এখন কোনো বাস্তব সহায়তা দলকে স্বয়ংক্রিয়ভাবে জানানো হয়নি। জরুরি হলে সরাসরি চিকিৎসাসেবা নিন।",
      en: "Your other reason has been recorded. This is a prototype, so no real support team has been notified automatically. Seek medical care directly if the need is urgent.",
    },
  },
};

export function isFollowUpBarrier(value: unknown): value is FollowUpBarrier {
  return typeof value === "string" && FOLLOW_UP_BARRIERS.includes(value as FollowUpBarrier);
}

export function isFollowUpAction(value: unknown): value is FollowUpAction {
  return typeof value === "string" && FOLLOW_UP_ACTIONS.includes(value as FollowUpAction);
}

export function isReferralStatus(value: unknown): value is ReferralStatus {
  return typeof value === "string" && REFERRAL_STATUSES.includes(value as ReferralStatus);
}

async function followUpRequest(
  accessToken: string,
  init?: RequestInit,
): Promise<FollowUpView> {
  if (!REFERRAL_TOKEN_PATTERN.test(accessToken)) throw new Error("INVALID_REFERRAL_TOKEN");
  const query = new URLSearchParams({ token: accessToken });
  const response = await fetch(`/api/referrals/follow-up?${query.toString()}`, {
    cache: "no-store",
    ...init,
  });
  const body = await response.json().catch(() => null) as { followUp?: FollowUpView; error?: string } | null;
  if (!response.ok || !body?.followUp) throw new Error(body?.error ?? "FOLLOW_UP_REQUEST_FAILED");
  return body.followUp;
}

export function fetchFollowUp(accessToken: string) {
  return followUpRequest(accessToken);
}

export function simulateTwentyFourHours(accessToken: string) {
  return followUpRequest(accessToken, { method: "POST" });
}

export function saveFollowUpBarrier(accessToken: string, barrier: FollowUpBarrier) {
  return followUpRequest(accessToken, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ barrier }),
  });
}
