"use client";

import { useCallback, useEffect, useState } from "react";
import { BilingualText, useLanguage } from "@/components/language";
import { Icon, type IconName } from "@/components/icons";
import { GovernmentActivityMap, hotspotLabel } from "@/components/government-activity-map";
import { ClayCard, MetricCard, SectionHeading, StatusPill } from "@/components/ui";
import { getBroadArea, type BroadAreaId } from "@/lib/broad-areas";
import { fetchGovernmentDashboard, recordPublicHealthAction, type GovernmentDashboardData, type PublicHealthActionType } from "@/lib/government-dashboard";
import { getPathway, pathwayDefinitions, type PathwayId } from "@/lib/care-pathways";

function formatCount(value: number, language: "bn" | "en") {
  return new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-BD", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRate(value: number, language: "bn" | "en") {
  return `${new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-BD", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function FunnelStage({
  icon,
  label,
  value,
  valueLanguage,
  width,
}: {
  icon: IconName;
  label: { bn: string; en: string };
  value: string;
  valueLanguage: "bn" | "en";
  width: number;
}) {
  return (
    <div className="funnel-stage">
      <div className="funnel-stage-heading">
        <span className="funnel-stage-icon" aria-hidden="true"><Icon name={icon} /></span>
        <span><BilingualText copy={label} /></span>
      </div>
      <strong lang={valueLanguage}>{value}</strong>
      <div className="funnel-track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function GovernmentDashboard() {
  const { language } = useLanguage();
  const [dashboard, setDashboard] = useState<GovernmentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<BroadAreaId | null>(null);
  const [pathwayFilter, setPathwayFilter] = useState<PathwayId | "ALL">("ALL");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<"saved" | "error" | null>(null);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await fetchGovernmentDashboard();
      setDashboard(result);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(firstLoad);
  }, [loadDashboard]);

  const referredWidth = dashboard && dashboard.totalScreenings > 0
    ? (dashboard.formalReferrals / dashboard.totalScreenings) * 100
    : 0;
  const completedWidth = dashboard && dashboard.totalScreenings > 0
    ? (dashboard.completedReferrals / dashboard.totalScreenings) * 100
    : 0;
  const funnelScreened = formatCount(dashboard?.totalScreenings ?? 0, language);
  const funnelReferred = formatCount(dashboard?.formalReferrals ?? 0, language);
  const funnelCompleted = formatCount(dashboard?.completedReferrals ?? 0, language);
  const funnelLabel = language === "bn"
    ? `স্ক্রিনিং ${funnelScreened}, রেফারেল ${funnelReferred}, সম্পন্ন ${funnelCompleted}`
    : `Screened ${funnelScreened}, referred ${funnelReferred}, completed ${funnelCompleted}`;
  const selectedArea = dashboard?.areas.find((area) => area.areaId === selectedAreaId)
    ?? dashboard?.areas.find((area) => area.hotspotLevel === "RED")
    ?? dashboard?.areas[0]
    ?? null;
  const selectedBroadArea = getBroadArea(selectedArea?.areaId);
  const visiblePathwaySignals = dashboard?.pathwayActivity.filter((item) => pathwayFilter === "ALL" || item.pathwayId === pathwayFilter) ?? [];

  async function saveAction(pathwayId: PathwayId, areaId: BroadAreaId, actionType: PublicHealthActionType) {
    setActionBusy(true); setActionStatus(null);
    try { await recordPublicHealthAction({ pathwayId, areaId, actionType }); setActionStatus("saved"); await loadDashboard(true); }
    catch { setActionStatus("error"); }
    finally { setActionBusy(false); }
  }

  return (
    <div className="government-dashboard-live" data-government-dashboard>
      <ClayCard className="government-dashboard-toolbar" as="section">
        <div>
          <strong><BilingualText copy={{ bn: "লাইভ সমষ্টিগত হিসাব", en: "Live aggregate totals" }} /></strong>
          <p><BilingualText copy={{ bn: "নতুন স্ক্রিনিং বা রেফারেল দেখতে হিসাব হালনাগাদ করুন।", en: "Refresh the totals to see new screenings or referrals." }} /></p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void loadDashboard(true)} disabled={loading || refreshing}>
          <Icon name="trend" />
          <BilingualText copy={refreshing ? { bn: "হালনাগাদ হচ্ছে…", en: "Refreshing…" } : { bn: "এখন হালনাগাদ করুন", en: "Refresh now" }} />
        </button>
      </ClayCard>

      {loading && !dashboard ? (
        <ClayCard className="dashboard-state-card" role="status">
          <Icon name="clock" />
          <BilingualText copy={{ bn: "নামবিহীন হিসাব আনা হচ্ছে…", en: "Loading anonymous totals…" }} />
        </ClayCard>
      ) : error && !dashboard ? (
        <ClayCard className="dashboard-state-card dashboard-error-card" role="alert">
          <Icon name="info" />
          <div>
            <strong><BilingualText copy={{ bn: "জনস্বাস্থ্য হিসাব এখন আনা যায়নি", en: "Public-health totals could not be loaded" }} /></strong>
            <p><BilingualText copy={{ bn: "Supabase সংযোগ ও Part 13 migration পরীক্ষা করে আবার চেষ্টা করুন।", en: "Check the Supabase connection and Part 13 migration, then try again." }} /></p>
          </div>
        </ClayCard>
      ) : dashboard ? (
        <>
          {error && (
            <p className="dashboard-refresh-warning" role="status">
              <Icon name="info" />
              <BilingualText copy={{ bn: "সর্বশেষ হালনাগাদ ব্যর্থ হয়েছে। আগের হিসাব দেখানো হচ্ছে।", en: "The latest refresh failed. Previous totals are still shown." }} />
            </p>
          )}

          {dashboard.demoSeededScreenings > 0 && (
            <p className="dashboard-demo-seed-note" role="note">
              <Icon name="info" />
              <BilingualText copy={{
                bn: `এই দৃশ্যে ${formatCount(dashboard.demoSeededScreenings, "bn")}টি কৃত্রিম স্ক্রিনিং রেকর্ড সমষ্টিগত হিসাবে যুক্ত আছে। এগুলো বাস্তব রোগীর তথ্য নয়।`,
                en: `${formatCount(dashboard.demoSeededScreenings, "en")} synthetic screening records are included in this view. They are not real patient data.`,
              }} />
            </p>
          )}

          <ClayCard className="syndrome-signal-card" as="section">
            <SectionHeading title={{ bn: "বহু-উদ্বেগ তদন্ত সংকেত", en: "Multi-pathway investigation signals" }} description={{ bn: "সম্মতি ও ন্যূনতম যাচাইয়ের পর পাঠানো নামবিহীন বিভাগভিত্তিক সংকেত। এগুলো নিশ্চিত প্রাদুর্ভাব নয়।", en: "Anonymous division-level signals sent after consent and minimum triage. These are not confirmed outbreaks." }} />
            <div className="pathway-filter" role="group" aria-label="Pathway filter">
              <button type="button" className={`button ${pathwayFilter === "ALL" ? "button-primary" : "button-quiet"}`} onClick={() => setPathwayFilter("ALL")}><BilingualText copy={{ bn: "সব পথ", en: "All pathways" }} /></button>
              {pathwayDefinitions.map((pathway) => <button type="button" key={pathway.id} className={`button ${pathwayFilter === pathway.id ? "button-primary" : "button-quiet"}`} onClick={() => setPathwayFilter(pathway.id)}><BilingualText copy={pathway.label} /></button>)}
            </div>
            <p className="demo-rule-note"><Icon name="info" /><BilingualText copy={{ bn: "বর্তমান পর্যালোচনা নিয়ম: ৭ দিনে ৩–৪টি সংকেত নজরে রাখুন, ৫ বা বেশি হলে লাল তদন্ত সংকেত। এটি বাস্তব জনস্বাস্থ্য সীমা নয়।", en: "Current review rule: 3–4 signals in 7 days is watch; 5 or more is a red investigation signal. This is not a real-world public-health threshold." }} /></p>
            {visiblePathwaySignals.length ? <div className="syndrome-signal-list">{visiblePathwaySignals.map((signal) => {
              const area = getBroadArea(signal.areaId);
              const pathway = getPathway(signal.pathwayId);
              return <article className={`syndrome-signal-item hotspot-${signal.signalLevel.toLowerCase()}`} key={`${signal.pathwayId}-${signal.areaId}`}>
                <div><span className="mini-label"><BilingualText copy={pathway.label} /> · <BilingualText copy={{ bn: "কৃত্রিম পরীক্ষামূলক তথ্য", en: "Synthetic test data" }} /></span><h3>{area ? <BilingualText copy={area.label} /> : signal.areaId}</h3></div>
                <StatusPill tone={signal.signalLevel === "RED" ? "risk" : "warning"} icon="trend" label={{ bn: signal.signalLevel === "RED" ? "তদন্ত সংকেত" : "নজরে রাখুন", en: signal.signalLevel === "RED" ? "Investigation signal" : "Watch" }} />
                <p><strong>{formatCount(signal.signalCount, language)}</strong> <BilingualText copy={{ bn: "নামবিহীন প্রতিবেদন", en: "anonymous reports" }} /> · <strong>{formatCount(signal.urgentCount, language)}</strong> <BilingualText copy={{ bn: "জরুরি", en: "urgent" }} /></p>
                <div className="button-row">
                  <button className="button button-secondary" type="button" disabled={actionBusy} onClick={() => void saveAction(signal.pathwayId, signal.areaId, signal.pathwayId === "DIARRHOEA_DEHYDRATION" ? "CHECK_WATER_SAFETY" : "REVIEW_SIGNAL")}><BilingualText copy={signal.pathwayId === "DIARRHOEA_DEHYDRATION" ? { bn: "পানির নিরাপত্তা যাচাই নথিভুক্ত করুন", en: "Record water-safety check" } : { bn: "পর্যালোচনা নথিভুক্ত করুন", en: "Record review" }} /></button>
                  <button className="button button-quiet" type="button" disabled={actionBusy} onClick={() => void saveAction(signal.pathwayId, signal.areaId, "ARRANGE_OUTREACH")}><BilingualText copy={{ bn: "আউটরিচ নথিভুক্ত করুন", en: "Record outreach" }} /></button>
                </div>
              </article>;
            })}</div> : <p className="privacy-suppressed-state"><BilingualText copy={{ bn: "এই ফিল্টারে দেখানোর মতো ন্যূনতম ৩টি নামবিহীন সংকেত নেই।", en: "This filter has fewer than 3 anonymous signals, so no area is displayed." }} /></p>}
            {actionStatus && <p role={actionStatus === "error" ? "alert" : "status"}><BilingualText copy={actionStatus === "saved" ? { bn: "জনস্বাস্থ্য পদক্ষেপ নথিভুক্ত হয়েছে।", en: "Public-health action recorded." } : { bn: "পদক্ষেপটি নথিভুক্ত করা যায়নি।", en: "The action could not be recorded." }} /></p>}
            {dashboard.recentActions.length > 0 && <div className="recent-action-list"><h3><BilingualText copy={{ bn: "সাম্প্রতিক নথিভুক্ত পদক্ষেপ", en: "Recent recorded actions" }} /></h3>{dashboard.recentActions.slice(0, 5).map((action) => <p key={action.actionId}><BilingualText copy={getPathway(action.pathwayId).label} /> · {getBroadArea(action.areaId)?.label[language] ?? action.areaId} · <span lang="en">{action.actionType}</span></p>)}</div>}
          </ClayCard>

          <div className="metrics-grid metrics-grid-six">
            <MetricCard label={{ bn: "মোট স্ক্রিনিং", en: "Total screenings" }} value={formatCount(dashboard.totalScreenings, language)} valueLanguage={language} icon="screen" />
            <MetricCard label={{ bn: "নিজে ব্যবহার", en: "Self-use screenings" }} value={formatCount(dashboard.selfUseScreenings, language)} valueLanguage={language} icon="home" tone="blue" />
            <MetricCard label={{ bn: "ফার্মেসি সহায়তা", en: "Pharmacy-assisted screenings" }} value={formatCount(dashboard.pharmacyAssistedScreenings, language)} valueLanguage={language} icon="pharmacy" />
            <MetricCard label={{ bn: "আনুষ্ঠানিক রেফারেল", en: "Formal referrals" }} value={formatCount(dashboard.formalReferrals, language)} valueLanguage={language} icon="document" tone="blue" />
            <MetricCard label={{ bn: "সম্পন্ন রেফারেল", en: "Completed referrals" }} value={formatCount(dashboard.completedReferrals, language)} valueLanguage={language} icon="check" />
            <MetricCard label={{ bn: "সম্পন্নের হার", en: "Completion rate" }} value={formatRate(dashboard.completionRate, language)} valueLanguage={language} icon="trend" tone="blue" note={{ bn: "সম্পন্ন ÷ রেফারেল", en: "Completed ÷ referred" }} />
          </div>

          <ClayCard className="government-fraud-card" as="section" aria-labelledby="government-fraud-title">
            <SectionHeading
              id="government-fraud-title"
              title={{ bn: "নামবিহীন পর্যালোচনা সংকেত", en: "Anonymous review signals" }}
              description={{ bn: "এগুলো সমষ্টিগত কর্মপ্রবাহের সতর্কতা। এখানে রোগী, অডিও হ্যাশ বা নির্দিষ্ট ফার্মেসির পরিচয় নেই।", en: "These are aggregate workflow warnings. No patient, audio hash, or individual pharmacy identity appears here." }}
            />
            <div className="fraud-review-grid">
              <div><span><BilingualText copy={{ bn: "একই রোগীর পুরস্কার বন্ধ", en: "Duplicate patient rewards blocked" }} /></span><strong lang={language}>{formatCount(dashboard.fraudAlerts.duplicateRewardWarnings, language)}</strong></div>
              <div><span><BilingualText copy={{ bn: "সম্ভাব্য পুনর্ব্যবহৃত অডিও", en: "Possible reused audio" }} /></span><strong lang={language}>{formatCount(dashboard.fraudAlerts.reusedAudioWarnings, language)}</strong></div>
              <div><span><BilingualText copy={{ bn: "ভলিউম পর্যালোচনা প্রয়োজন এমন ফার্মেসি", en: "Pharmacies requiring volume review" }} /></span><strong lang={language}>{formatCount(dashboard.fraudAlerts.pharmaciesRequiringReview, language)}</strong></div>
              <div><span><BilingualText copy={{ bn: "পর্যালোচনায় রাখা পুরস্কার", en: "Rewards held for review" }} /></span><strong lang={language}>{formatCount(dashboard.fraudAlerts.heldRewardCount, language)}</strong></div>
            </div>
            <p className="demo-rule-note"><Icon name="info" /><BilingualText copy={{ bn: "পর্যালোচনার নিয়ম: একটি ফার্মেসি চলমান ২৪ ঘণ্টায় ১০টি রেফারেল তৈরি করলে কার্যক্রম পর্যালোচনা প্রয়োজন। এটি প্রতারণার প্রমাণ নয়।", en: "Review rule: a pharmacy requires activity review at 10 referrals in a rolling 24 hours. This is not proof of fraud." }} /></p>
          </ClayCard>

          <ClayCard className="referral-funnel-card" aria-labelledby="referral-funnel-title">
            <SectionHeading
              id="referral-funnel-title"
              title={{ bn: "রেফারেল ধাপ", en: "Referral funnel" }}
              description={{ bn: "স্ক্রিনিং থেকে আনুষ্ঠানিক রেফারেল এবং নিশ্চিত উপস্থিতি পর্যন্ত সমষ্টিগত অগ্রগতি।", en: "Aggregate progress from screening to formal referral and confirmed attendance." }}
            />
            <div className="referral-funnel" role="img" aria-label={funnelLabel}>
              <FunnelStage icon="screen" label={{ bn: "স্ক্রিনিং", en: "Screened" }} value={formatCount(dashboard.totalScreenings, language)} valueLanguage={language} width={dashboard.totalScreenings > 0 ? 100 : 0} />
              <Icon className="funnel-arrow" name="arrow" />
              <FunnelStage icon="document" label={{ bn: "রেফারেল", en: "Referred" }} value={formatCount(dashboard.formalReferrals, language)} valueLanguage={language} width={referredWidth} />
              <Icon className="funnel-arrow" name="arrow" />
              <FunnelStage icon="check" label={{ bn: "সম্পন্ন", en: "Completed" }} value={formatCount(dashboard.completedReferrals, language)} valueLanguage={language} width={completedWidth} />
            </div>
          </ClayCard>

          <ClayCard className="government-map-card" aria-labelledby="government-map-title">
            <SectionHeading
              id="government-map-title"
              title={{ bn: "বিস্তৃত এলাকাভিত্তিক কার্যক্রম", en: "Broad-area activity map" }}
              description={{ bn: "সাম্প্রতিক ৭ দিনে স্বতন্ত্র ব্যবহারকারীর নামবিহীন, সমষ্টিগত কার্যক্রম। কোনো ব্যক্তির অবস্থান দেখানো হয় না।", en: "Anonymous, aggregate activity from independent users in the latest 7 days. No individual location is shown." }}
            />

            <div className="demo-rule-note" role="note">
              <Icon name="info" />
              <div>
                <strong><BilingualText copy={{ bn: "পর্যালোচনার নিয়ম", en: "Review rule" }} /></strong>
                <p><BilingualText copy={{
                  bn: "স্বতন্ত্র রেফার করা ব্যবহারকারী ৩ জনের কম হলে স্বাভাবিক, ৩–৪ জন হলে নজরে রাখুন, এবং ৫ বা বেশি হলে লাল সতর্কতা। এটি চিকিৎসাবিষয়ক বা সরকার-অনুমোদিত সীমা নয়।",
                  en: "Fewer than 3 independent referred users is normal, 3–4 is watch, and 5 or more is a red warning. This is not a medical or government-approved threshold.",
                }} /></p>
              </div>
            </div>

            {dashboard.areas.length > 0 ? (
              <div className="government-map-layout">
                <GovernmentActivityMap
                  areas={dashboard.areas}
                  selectedAreaId={selectedArea?.areaId ?? null}
                  onSelectArea={setSelectedAreaId}
                />

                {selectedArea && selectedBroadArea && (
                  <aside className={`selected-area-panel hotspot-${selectedArea.hotspotLevel.toLowerCase()}`} aria-live="polite">
                    <div className="selected-area-heading">
                      <div>
                        <span className="mini-label"><BilingualText copy={{ bn: "নির্বাচিত বিস্তৃত এলাকা", en: "Selected broad area" }} /></span>
                        <h3><BilingualText copy={selectedBroadArea.label} /></h3>
                      </div>
                      <StatusPill
                        label={hotspotLabel(selectedArea.hotspotLevel)}
                        tone={selectedArea.hotspotLevel === "RED" ? "risk" : selectedArea.hotspotLevel === "WATCH" ? "warning" : "success"}
                        icon={selectedArea.hotspotLevel === "RED" ? "info" : "trend"}
                      />
                    </div>

                    <dl className="area-activity-metrics">
                      <div><dt><BilingualText copy={{ bn: "স্বতন্ত্র স্ক্রিনিং ব্যবহারকারী", en: "Unique users screened" }} /></dt><dd lang={language}>{formatCount(selectedArea.uniqueUsersScreened, language)}</dd></div>
                      <div><dt><BilingualText copy={{ bn: "মূল্যায়নের সুপারিশ পাওয়া স্বতন্ত্র ব্যবহারকারী", en: "Unique users recommended" }} /></dt><dd lang={language}>{formatCount(selectedArea.uniqueUsersRecommended, language)}</dd></div>
                      <div><dt><BilingualText copy={{ bn: "রেফারেল", en: "Referrals" }} /></dt><dd lang={language}>{formatCount(selectedArea.referralCount, language)}</dd></div>
                      <div><dt><BilingualText copy={{ bn: "সম্পন্ন", en: "Completed" }} /></dt><dd lang={language}>{formatCount(selectedArea.completionCount, language)}</dd></div>
                    </dl>

                    {selectedArea.hotspotLevel === "RED" && (
                      <div className="red-area-actions">
                        <div className="red-investigation-signal" role="alert">
                          <Icon name="info" />
                          <strong><BilingualText copy={{ bn: "সম্ভাব্য টিবি-সংক্রান্ত স্ক্রিনিং কার্যক্রম বেশি — তদন্ত করুন", en: "High potential-TB screening activity — investigate" }} /></strong>
                        </div>
                        <h4><BilingualText copy={{ bn: "সম্ভাব্য সরকারি পদক্ষেপ", en: "Possible government actions" }} /></h4>
                        <ul>
                          <li><BilingualText copy={{ bn: "এলাকাটি পর্যালোচনা করুন", en: "Review area" }} /></li>
                          <li><BilingualText copy={{ bn: "সচেতনতামূলক কার্যক্রমের পরিকল্পনা করুন", en: "Plan awareness activity" }} /></li>
                          <li><BilingualText copy={{ bn: "মোবাইল স্ক্রিনিং/পরীক্ষা বিবেচনা করুন", en: "Consider mobile screening/testing" }} /></li>
                          <li><BilingualText copy={{ bn: "অতিরিক্ত টিবি সেবার সক্ষমতা প্রয়োজন কি না পর্যালোচনা করুন", en: "Review need for additional TB service capacity" }} /></li>
                        </ul>
                        <p><BilingualText copy={{ bn: "এটি শুধু তদন্তের সংকেত। জনস্বাস্থ্য কর্মীরা পর্যালোচনা করে সিদ্ধান্ত নেবেন; ড্যাশবোর্ড নিজে কোনো সেবাকেন্দ্র তৈরি করে না।", en: "This is an investigation signal only. Public-health staff review and decide; the dashboard does not automatically create a service centre." }} /></p>
                      </div>
                    )}
                  </aside>
                )}
              </div>
            ) : (
              <div className="privacy-suppressed-state" role="status">
                <Icon name="shield" />
                <div>
                  <strong><BilingualText copy={{ bn: "দেখানোর মতো পর্যাপ্ত সমষ্টিগত তথ্য নেই", en: "Not enough aggregate data to display" }} /></strong>
                  <p><BilingualText copy={{ bn: "গোপনীয়তার জন্য ৩ জনের কম স্বতন্ত্র স্ক্রিনিং ব্যবহারকারী থাকা এলাকা মানচিত্রে লুকানো হয়।", en: "For privacy, areas with fewer than 3 independent screened users are hidden from the map." }} /></p>
                </div>
              </div>
            )}

            <p className="government-map-privacy-note">
              <Icon name="shield" />
              <BilingualText copy={{ bn: "গোপনীয়তা সীমা: ৩ জনের কম স্বতন্ত্র স্ক্রিনিং ব্যবহারকারী থাকা এলাকা দেখানো হয় না। নাম, ফোন, কাশির অডিও বা সঠিক ঠিকানা কখনো মানচিত্রের তথ্য নয়।", en: "Privacy floor: areas with fewer than 3 independent screened users are not shown. Names, phone numbers, cough audio, and exact addresses are never map data." }} />
            </p>
          </ClayCard>
        </>
      ) : null}
    </div>
  );
}
