"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { Icon } from "@/components/icons";
import { ClayCard, StatusPill } from "@/components/ui";
import {
  COMMUNITY_FEEDBACK_CATEGORIES,
  type CommunityFeedbackCategory,
  type CommunitySummary,
} from "@/lib/community";

const CATEGORY_COPY: Record<CommunityFeedbackCategory, Copy> = {
  WORK: { bn: "কাজের সময়", en: "Work schedule" },
  DISTANCE: { bn: "কেন্দ্রের দূরত্ব", en: "Distance" },
  FEAR: { bn: "ভয়", en: "Fear" },
  STIGMA: { bn: "সামাজিক কলঙ্ক", en: "Stigma" },
  LACK_OF_INFORMATION: { bn: "তথ্যের অভাব", en: "Lack of information" },
  TRANSPORT: { bn: "যাতায়াত সমস্যা", en: "Transport" },
};

const SUBMISSION_ID_KEY = "jvh-community-submission-id";

function createSubmissionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function CommunityEngagement() {
  const { language } = useLanguage();
  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [selected, setSelected] = useState<CommunityFeedbackCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const submissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/community", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("COMMUNITY_SUMMARY_UNAVAILABLE");
        return await response.json() as { summary: CommunitySummary };
      })
      .then(({ summary: nextSummary }) => {
        if (active) setSummary(nextSummary);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-US"),
    [language],
  );

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || submitting || submitted) return;
    setSubmitting(true);
    setError(false);
    try {
      let submissionId = submissionIdRef.current;
      if (!submissionId) {
        try {
          submissionId = sessionStorage.getItem(SUBMISSION_ID_KEY);
        } catch {
          // A browser can deny storage access; anonymous feedback still works in memory.
        }
      }
      if (!submissionId) {
        submissionId = createSubmissionId();
        try {
          sessionStorage.setItem(SUBMISSION_ID_KEY, submissionId);
        } catch {
          // Retry idempotency lasts for this mounted page when storage is unavailable.
        }
      }
      submissionIdRef.current = submissionId;
      const response = await fetch("/api/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, category: selected }),
      });
      if (!response.ok) throw new Error("COMMUNITY_SUBMISSION_UNAVAILABLE");
      const result = await response.json() as { summary: CommunitySummary };
      setSummary(result.summary);
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="community-layout section-block" data-community-engagement>
      <ClayCard className="feedback-card">
        <StatusPill tone="neutral" icon="users" label={{ bn: "নামবিহীন কমিউনিটি মতামত", en: "Anonymous community feedback" }} />
        <h2><BilingualText copy={{ bn: "স্বাস্থ্যসেবা নিতে মানুষের সবচেয়ে বড় বাধা সাধারণত কী?", en: "What usually prevents people from reaching health care?" }} /></h2>
        <p><BilingualText copy={{ bn: "নিজের বা অন্য কারও রোগের অবস্থা জানাবেন না। শুধু একটি সাধারণ বাধা বেছে নিন।", en: "Do not share your or anyone else's disease status. Choose only one general barrier." }} /></p>
        <form onSubmit={submitFeedback}>
          <fieldset className="community-choice-fieldset" disabled={submitting || submitted}>
            <legend className="sr-only"><BilingualText copy={{ bn: "একটি বাধা বেছে নিন", en: "Choose one barrier" }} /></legend>
            <div className="choice-grid">
              {COMMUNITY_FEEDBACK_CATEGORIES.map((category) => (
                <label className={`community-choice ${selected === category ? "is-selected" : ""}`} key={category}>
                  <input
                    type="radio"
                    name="communityBarrier"
                    value={category}
                    checked={selected === category}
                    onChange={() => setSelected(category)}
                  />
                  <BilingualText copy={CATEGORY_COPY[category]} />
                </label>
              ))}
            </div>
          </fieldset>
          <button className="button button-primary community-submit" type="submit" disabled={!selected || submitting || submitted}>
            <BilingualText copy={submitting
              ? { bn: "পাঠানো হচ্ছে...", en: "Submitting..." }
              : submitted
                ? { bn: "মতামত গ্রহণ করা হয়েছে", en: "Feedback received" }
                : { bn: "মতামত পাঠিয়ে সমর্থন জানান", en: "Submit feedback and show support" }} />
            <Icon name={submitted ? "check" : "arrow"} />
          </button>
        </form>
        {submitted && (
          <p className="community-success" role="status">
            <Icon name="check" />
            <BilingualText copy={{ bn: "ধন্যবাদ। আপনার নামবিহীন উত্তরটি মোট ফলাফলে যোগ হয়েছে।", en: "Thank you. Your anonymous response has been added to the totals." }} />
          </p>
        )}
        {error && (
          <p className="community-error" role="alert">
            <Icon name="info" />
            <BilingualText copy={{ bn: "এখন মতামতের তথ্য পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।", en: "Community feedback is unavailable right now. Please try again later." }} />
          </p>
        )}
        <p className="helper-text"><BilingualText copy={{ bn: "শুধু নির্বাচিত বাধা ও জমা দেওয়ার সময় রাখা হয়—নাম, ফোন, মুক্ত লেখা বা রোগের অবস্থা নয়।", en: "Only the selected barrier and submission time are kept—never a name, phone number, free text, or disease status." }} /></p>
      </ClayCard>

      <div className="community-results-column">
        <ClayCard className="support-card">
          <Icon name="community" />
          <span className="mini-label"><BilingualText copy={{ bn: "জনস্বার্থ ও মতামত", en: "Public interest and feedback" }} /></span>
          <strong lang={language}>{loading || !summary ? "—" : numberFormatter.format(summary.totalResponses)}</strong>
          <p><BilingualText copy={{ bn: "টি নামবিহীন কমিউনিটি উত্তর পাওয়া গেছে। এটি যাচাইকৃত আলাদা মানুষের সংখ্যা নয়।", en: "anonymous community responses received. This is not a verified count of unique people." }} /></p>
        </ClayCard>

        <ClayCard className="community-breakdown" aria-labelledby="community-results-title">
          <h2 id="community-results-title"><BilingualText copy={{ bn: "নামবিহীন মতামতের ফলাফল", en: "Anonymous feedback results" }} /></h2>
          {loading && (
            <p className="community-empty" role="status"><BilingualText copy={{ bn: "ফলাফল লোড হচ্ছে...", en: "Loading results..." }} /></p>
          )}
          {!loading && summary?.totalResponses === 0 && (
            <p className="community-empty"><BilingualText copy={{ bn: "এখনো কোনো মতামত জমা পড়েনি। প্রথম নামবিহীন উত্তরটি দিন।", en: "No feedback has been submitted yet. Add the first anonymous response." }} /></p>
          )}
          {summary && summary.totalResponses > 0 && (
            <div className="community-result-list">
              {COMMUNITY_FEEDBACK_CATEGORIES.map((category) => {
                const percentage = Math.round((summary.counts[category] / summary.totalResponses) * 100);
                return (
                  <div className="community-result" key={category}>
                    <div>
                      <BilingualText copy={CATEGORY_COPY[category]} />
                      <strong lang={language}>{numberFormatter.format(percentage)}%</strong>
                    </div>
                    <div
                      className="community-result-bar"
                      role="progressbar"
                      aria-label={`${CATEGORY_COPY[category].bn} / ${CATEGORY_COPY[category].en}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percentage}
                    >
                      <span style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="helper-text"><BilingualText copy={{ bn: "এই সমষ্টিগত ফলাফল ফলো-আপ সহায়তা কেন বাধা অনুযায়ী বদলানো দরকার তা বুঝতে সাহায্য করে।", en: "These aggregate results help explain why follow-up support should adapt to different barriers." }} /></p>
        </ClayCard>
      </div>
    </div>
  );
}
