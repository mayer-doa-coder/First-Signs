"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BilingualText, useLanguage } from "@/components/language";
import { Icon } from "@/components/icons";
import { ActionLink, ClayCard, MetricCard, SectionHeading, StatusPill } from "@/components/ui";
import { fetchPharmacyDashboard, type PharmacyDashboardData } from "@/lib/pharmacy-dashboard";
import { demoPharmacies, getPharmacyScreeningPath } from "@/lib/pharmacies";

const REFRESH_INTERVAL_MS = 4_000;

function count(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function PharmacyDashboard({ initialPharmacyId }: { initialPharmacyId: string }) {
  const router = useRouter();
  const { language } = useLanguage();
  const [pharmacyId, setPharmacyId] = useState(initialPharmacyId);
  const [dashboard, setDashboard] = useState<PharmacyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);

  const loadDashboard = useCallback(async (quiet = false) => {
    const requestNumber = ++requestSequence.current;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetchPharmacyDashboard(pharmacyId);
      if (requestNumber !== requestSequence.current) return;
      setDashboard(result);
      setError(false);
    } catch {
      if (requestNumber !== requestSequence.current) return;
      setError(true);
    } finally {
      if (requestNumber === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [pharmacyId]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void loadDashboard(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDashboard(true);
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  function choosePharmacy(nextPharmacyId: string) {
    requestSequence.current += 1;
    setPharmacyId(nextPharmacyId);
    setDashboard(null);
    setError(false);
    router.replace(`/pharmacy?pharmacy=${encodeURIComponent(nextPharmacyId)}`, { scroll: false });
  }

  const localPharmacy = demoPharmacies.find((item) => item.id === pharmacyId);

  return (
    <div className="pharmacy-dashboard-live" data-pharmacy-dashboard={pharmacyId}>
      <ClayCard className="pharmacy-dashboard-toolbar" as="section">
        <div>
          <label htmlFor="pharmacy-dashboard-select"><BilingualText copy={{ bn: "ডেমো ফার্মেসি", en: "Demo pharmacy" }} /></label>
          <select id="pharmacy-dashboard-select" value={pharmacyId} onChange={(event) => choosePharmacy(event.target.value)}>
            {demoPharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id} lang={language}>
                {pharmacy.name[language]} — {pharmacy.area[language]}
              </option>
            ))}
          </select>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void loadDashboard(true)} disabled={loading || refreshing}>
          <Icon name="trend" />
          <BilingualText copy={refreshing ? { bn: "হালনাগাদ হচ্ছে…", en: "Refreshing…" } : { bn: "এখন হালনাগাদ করুন", en: "Refresh now" }} />
        </button>
        <p className="dashboard-live-note" role="status" aria-live="polite">
          <span className="live-dot" aria-hidden="true" />
          <BilingualText copy={{ bn: "প্রতি ৪ সেকেন্ডে নতুন তথ্য দেখা হচ্ছে", en: "Checking for updates every 4 seconds" }} />
        </p>
      </ClayCard>

      {loading && !dashboard ? (
        <ClayCard className="dashboard-state-card" role="status"><Icon name="clock" /><BilingualText copy={{ bn: "ফার্মেসির হিসাব আনা হচ্ছে…", en: "Loading pharmacy activity…" }} /></ClayCard>
      ) : error && !dashboard ? (
        <ClayCard className="dashboard-state-card dashboard-error-card" role="alert">
          <Icon name="info" />
          <div><strong><BilingualText copy={{ bn: "ফার্মেসির হিসাব এখন আনা যায়নি", en: "Pharmacy activity could not be loaded" }} /></strong><p><BilingualText copy={{ bn: "Supabase সংযোগ ও Part 11 migration পরীক্ষা করে আবার চেষ্টা করুন।", en: "Check the Supabase connection and Part 11 migration, then try again." }} /></p></div>
        </ClayCard>
      ) : dashboard ? (
        <>
          <div className="selected-pharmacy-heading">
            <div><span className="mini-label"><BilingualText copy={{ bn: "বর্তমান ফার্মেসি", en: "Current pharmacy" }} /></span><h2><BilingualText copy={localPharmacy?.name ?? { bn: dashboard.pharmacyName, en: dashboard.pharmacyName }} /></h2><p><BilingualText copy={localPharmacy?.area ?? { bn: dashboard.pharmacyArea, en: dashboard.pharmacyArea }} /></p></div>
          </div>

          <div className="metrics-grid">
            <MetricCard label={{ bn: "সহায়তাপ্রাপ্ত স্ক্রিনিং", en: "Assisted screenings" }} value={count(dashboard.assistedScreenings)} icon="screen" note={{ bn: "শুধু এই ফার্মেসির উৎস", en: "This pharmacy source only" }} />
            <MetricCard label={{ bn: "রেফারেল তৈরি", en: "Referrals created" }} value={count(dashboard.referralsCreated)} icon="document" tone="blue" />
            <MetricCard label={{ bn: "রেফারেল সম্পন্ন", en: "Referrals completed" }} value={count(dashboard.referralsCompleted)} icon="check" />
            <MetricCard label={{ bn: "সম্পন্নের হার", en: "Completion rate" }} value={`${dashboard.completionRate.toFixed(1)}%`} icon="trend" tone="blue" />
          </div>

          <div className="dashboard-grid section-block">
            <ClayCard className="activity-card">
              <SectionHeading title={{ bn: "কর্মপ্রবাহভিত্তিক ক্রেডিট", en: "Workflow-based credits" }} description={{ bn: "ক্রেডিট কোনো ইতিবাচক যক্ষ্মা ফলের সঙ্গে যুক্ত নয়।", en: "Credits are never linked to a positive TB result." }} />
              <div className="reward-event-list">
                <div><Icon name="screen" /><span><BilingualText copy={{ bn: "বৈধ ফার্মেসি-সহায়তাপ্রাপ্ত স্ক্রিনিং", en: "Valid pharmacy-assisted screening" }} /></span><strong lang="en">{count(dashboard.validScreeningCredits)}</strong></div>
                <div><Icon name="document" /><span><BilingualText copy={{ bn: "উপযুক্ত ফার্মেসি রেফারেল", en: "Appropriate pharmacy referral" }} /></span><strong lang="en">{count(dashboard.appropriateReferralCredits)}</strong></div>
                <div><Icon name="check" /><span><BilingualText copy={{ bn: "স্বাধীনভাবে যাচাইকৃত উপস্থিতি", en: "Independently verified attendance" }} /></span><strong lang="en">{count(dashboard.verifiedCompletionCredits)}</strong></div>
                <div><Icon name="shield" /><span><BilingualText copy={{ bn: "ঐচ্ছিক মান বোনাস", en: "Optional quality bonus" }} /></span><strong lang="en">{count(dashboard.qualityBonusCredits)}</strong></div>
              </div>
              {dashboard.heldCredits > 0 && <p className="held-credit-note" role="status"><BilingualText copy={{ bn: `${count(dashboard.heldCredits)}টি ক্রেডিট পর্যালোচনার জন্য আটকে আছে।`, en: `${count(dashboard.heldCredits)} credit(s) are held for review.` }} /></p>}
            </ClayCard>

            <ClayCard className="reward-card">
              <StatusPill tone="warning" icon="info" label={{ bn: "উদাহরণমূলক প্রোটোটাইপ প্রণোদনা", en: "Illustrative prototype incentive" }} />
              <span className="mini-label"><BilingualText copy={{ bn: "সিমুলেটেড আয়", en: "Simulated earnings" }} /></span>
              <strong className="earnings" lang="en">{dashboard.earningsConfigured && dashboard.simulatedEarnings !== null ? `৳ ${dashboard.simulatedEarnings.toFixed(2)}` : "৳ —"}</strong>
              <p><BilingualText copy={dashboard.earningsConfigured ? { bn: "এটি বাস্তব অর্থ নয়; শুধু কনফিগার করা উদাহরণমূলক ক্রেডিটের যোগফল।", en: "This is not real money; it is only the total of configured illustrative credits." } : { bn: "প্রণোদনার টাকার হার PRD-তে নির্ধারিত নেই, তাই কোনো কাল্পনিক আয় দেখানো হয়নি।", en: "The PRD does not define incentive amounts, so no invented earnings are shown." }} /></p>
              <div className="integrity-row"><span><BilingualText copy={{ bn: "সততা স্কোর", en: "Integrity score" }} /></span><strong lang="en">{dashboard.integrityScore === null ? "—" : `${dashboard.integrityScore.toFixed(1)} / 100`}</strong></div>
              {dashboard.integrityScore === null && <small><BilingualText copy={{ bn: "স্কোরের নিয়ম এখনো নির্ধারিত হয়নি।", en: "The scoring rule is not yet defined." }} /></small>}
            </ClayCard>
          </div>

          <ClayCard className={`fraud-review-card ${dashboard.activityRequiresReview ? "fraud-review-card-active" : ""}`} as="section" aria-labelledby="pharmacy-review-title">
            <div className="card-heading-row">
              <div>
                <span className="mini-label"><BilingualText copy={{ bn: "মৌলিক অপব্যবহার সুরক্ষা", en: "Basic misuse protection" }} /></span>
                <h2 id="pharmacy-review-title"><BilingualText copy={{ bn: "পর্যালোচনার সংকেত", en: "Review signals" }} /></h2>
              </div>
              <StatusPill
                tone={dashboard.activityRequiresReview ? "warning" : "success"}
                icon={dashboard.activityRequiresReview ? "info" : "check"}
                label={dashboard.activityRequiresReview
                  ? { bn: "কার্যক্রম পর্যালোচনা প্রয়োজন", en: "Activity requires review" }
                  : { bn: "কোনো সক্রিয় ভলিউম সতর্কতা নেই", en: "No active volume warning" }}
              />
            </div>
            <div className="fraud-review-grid">
              <div><span><BilingualText copy={{ bn: "সাম্প্রতিক একই রোগীর পুরস্কার বন্ধ", en: "Recent duplicate patient rewards blocked" }} /></span><strong lang="en">{count(dashboard.duplicateRewardWarnings)}</strong></div>
              <div><span><BilingualText copy={{ bn: "সম্ভাব্য পুনর্ব্যবহৃত অডিও", en: "Possible reused audio" }} /></span><strong lang="en">{count(dashboard.reusedAudioWarnings)}</strong></div>
              <div><span><BilingualText copy={{ bn: "পর্যালোচনার জন্য রাখা ক্রেডিট", en: "Credits held for review" }} /></span><strong lang="en">{count(dashboard.heldCredits)}</strong></div>
            </div>
            <p><BilingualText copy={{ bn: "একই রোগীর একই ধরনের পুরস্কার ৩০ দিনের মধ্যে আবার দেওয়া হয় না। স্বাস্থ্যসেবা বা রেফারেল বন্ধ হয় না। একই অডিওর সতর্কতা শুধু পর্যালোচনার সংকেত—প্রতারণার প্রমাণ নয়।", en: "The same reward type is not issued again for one patient within 30 days. Health service and referral access continue. An identical-audio warning is a review signal only, not proof of fraud." }} /></p>
            {dashboard.duplicateRewardWarnings > 0 && <p className="fraud-rule-message" role="status"><BilingualText copy={{ bn: "পুরস্কারের যোগ্য নয় — সাম্প্রতিক স্ক্রিনিং ইতিমধ্যে আছে।", en: "Reward not eligible — recent screening already exists." }} /></p>}
            <small><BilingualText copy={{ bn: "ডেমো ভলিউম নিয়ম: চলমান ২৪ ঘণ্টায় ১০টি রেফারেল হলে নতুন পুরস্কার পর্যালোচনার জন্য রাখা হয়। আগের পুরস্কার বদলানো হয় না।", en: "Demo volume rule: at 10 referrals in a rolling 24 hours, new rewards are held for review. Earlier rewards are not changed." }} /></small>
          </ClayCard>

          <div className="button-row pharmacy-dashboard-actions">
            <ActionLink href={getPharmacyScreeningPath(pharmacyId)} icon="screen" label={{ bn: "সহায়তাপ্রাপ্ত স্ক্রিনিং শুরু করুন", en: "Start assisted screening" }} />
          </div>
        </>
      ) : null}
    </div>
  );
}
