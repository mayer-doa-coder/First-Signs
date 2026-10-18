"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { BilingualText, type Copy, useLanguage } from "@/components/language";
import { Icon } from "@/components/icons";
import { ActionLink, ClayCard, DemoNotice, PageShell, StatusPill } from "@/components/ui";
import { careLinkFor, loadActiveCareRecord, saveCareRecord, type CareRecord } from "@/lib/care-session";
import { fetchReferral, referralLinkFor, type ReferralStatus, type ReferralView } from "@/lib/referrals";
import { facilityServiceForPathway, getTbCentre } from "@/lib/tb-centres";
import { getPathway } from "@/lib/care-pathways";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusCopy: Record<ReferralStatus, Copy> = {
  PENDING: { bn: "অপেক্ষমাণ", en: "Pending" },
  FOLLOW_UP: { bn: "ফলো-আপ প্রয়োজন", en: "Follow-up needed" },
  COMPLETED: { bn: "সম্পন্ন", en: "Completed" },
  CLOSED: { bn: "বন্ধ", en: "Closed" },
};

function statusTone(status: ReferralStatus) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FOLLOW_UP") return "warning" as const;
  return "neutral" as const;
}

export function ReferralTicket({ initialToken, qrBaseUrl }: { initialToken?: string; qrBaseUrl: string }) {
  const { language } = useLanguage();
  const [referral, setReferral] = useState<ReferralView | null>(null);
  const [careRecord, setCareRecord] = useState<CareRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"invalid" | "not-found" | "unavailable" | null>(null);
  const [qrCode, setQrCode] = useState<{ source: string; value: string } | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      const localCare = loadActiveCareRecord();
      const token = initialToken || localCare?.referral?.accessToken;
      const cachedReferral = token && localCare?.referral?.accessToken === token ? localCare.referral : null;

      setCareRecord(localCare);
      if (cachedReferral) setReferral(cachedReferral);

      if (!token || !UUID_PATTERN.test(token)) {
        setLoadError(token ? "invalid" : "not-found");
        setLoading(false);
        return;
      }

      fetchReferral(token)
        .then((latestReferral) => {
          if (!active) return;
          setReferral(latestReferral);
          setLoadError(null);
          if (localCare?.referral?.accessToken === token) {
            const referralStatus = latestReferral.status === "FOLLOW_UP" ? "FOLLOW_UP_NEEDED" : latestReferral.status;
            const updatedCare: CareRecord = {
              ...localCare,
              referral: latestReferral,
              referralStatus,
              updatedAt: new Date().toISOString(),
            };
            saveCareRecord(updatedCare);
            setCareRecord(updatedCare);
          }
        })
        .catch(() => {
          if (active && !cachedReferral) setLoadError("unavailable");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [initialToken]);

  const token = referral?.accessToken;
  useEffect(() => {
    let active = true;
    if (!token) return;
    const value = new URL(referralLinkFor(token), qrBaseUrl).toString();

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#102f2d", light: "#ffffff" },
    }).then((source) => {
      if (active) setQrCode({ source, value });
    }).catch(() => {
      if (active) setQrError(true);
    });
    return () => { active = false; };
  }, [qrBaseUrl, token]);

  const centre = useMemo(() => getTbCentre(referral?.tbCenterId), [referral?.tbCenterId]);
  const centreName = centre?.name[language] ?? referral?.centreName;
  const centreArea = centre?.area[language] ?? referral?.centreArea;
  const centreDistrict = centre?.district[language] ?? referral?.centreDistrict;
  const serviceType = centre && referral
    ? facilityServiceForPathway(centre, referral.pathwayId)[language]
    : referral?.serviceType;
  const pathway = referral ? getPathway(referral.pathwayId) : null;

  if (loading && !referral) {
    return (
      <PageShell eyebrow={{ bn: "রেফারেল", en: "Referral" }} title={{ bn: "রেফারেল খোলা হচ্ছে", en: "Opening referral" }} description={{ bn: "একটু অপেক্ষা করুন।", en: "Please wait." }} icon="document">
        <ClayCard className="referral-loading" aria-live="polite"><BilingualText copy={{ bn: "রেফারেলের বর্তমান অবস্থা যাচাই করা হচ্ছে…", en: "Checking the current referral status…" }} /></ClayCard>
      </PageShell>
    );
  }

  if (!referral) {
    const invalid = loadError === "invalid";
    return (
      <PageShell
        eyebrow={{ bn: "রেফারেল", en: "Referral" }}
        title={invalid ? { bn: "রেফারেল লিংকটি সঠিক নয়", en: "This referral link is invalid" } : { bn: "রেফারেল পাওয়া যায়নি", en: "Referral not found" }}
        description={{ bn: "‘আমার সেবা’ থেকে বর্তমান রেফারেল খুলুন, অথবা নতুন স্ক্রিনিং সম্পন্ন করুন।", en: "Open the current referral from My Care, or complete a new screening." }}
        icon="document"
      >
        <DemoNotice />
        <ClayCard className="referral-empty-card">
          {loadError === "unavailable" && <p role="alert"><BilingualText copy={{ bn: "রেফারেল সেবা এখন পাওয়া যাচ্ছে না। Supabase সংযোগ দেখে আবার চেষ্টা করুন।", en: "The referral service is unavailable. Check the Supabase connection and try again." }} /></p>}
          <div className="button-row">
            <ActionLink href="/care" variant="secondary" icon="care" label={{ bn: "আমার সেবা খুলুন", en: "Open My Care" }} />
            <ActionLink href="/screen?source=self" label={{ bn: "স্ক্রিনিং শুরু করুন", en: "Start screening" }} />
          </div>
        </ClayCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={{ bn: "রেফারেল", en: "Referral" }}
      title={{ bn: "পেশাদার স্বাস্থ্য মূল্যায়নের রেফারেল", en: "Referral for professional health evaluation" }}
      description={{ bn: "এই কিউআর বা রেফারেল আইডি সেবাকেন্দ্রে দেখান। এটি কোনো রোগ নির্ণয় নয়।", en: "Show this QR or referral ID at the care facility. It is not a diagnosis." }}
      icon="document"
    >
      <DemoNotice />
      {loadError === "unavailable" && (
        <div className="referral-cache-notice" role="status">
          <Icon name="info" />
          <BilingualText copy={{ bn: "সর্বশেষ অনলাইন অবস্থা পাওয়া যায়নি; এই ডিভাইসে রাখা রেফারেলটি দেখানো হচ্ছে।", en: "The latest online status is unavailable; the referral saved on this device is shown." }} />
        </div>
      )}

      <div className="referral-layout referral-live-layout">
        <ClayCard className="referral-ticket referral-ticket-live" as="article">
          <div className="ticket-header">
            <div>
              <span className="mini-label"><BilingualText copy={{ bn: "রেফারেল আইডি", en: "Referral ID" }} /></span>
              <h2 lang="en" data-referral-id>{referral.referralId}</h2>
            </div>
            <StatusPill tone={statusTone(referral.status)} icon={referral.status === "COMPLETED" ? "check" : "clock"} label={statusCopy[referral.status]} />
          </div>

          <div className="ticket-body referral-ticket-body">
            <div className="referral-qr-surface" aria-live="polite">
              {qrCode ? (
                <Image
                  className="referral-qr-image"
                  src={qrCode.source}
                  alt={`${referral.referralId} referral QR code`}
                  width={320}
                  height={320}
                  unoptimized
                  data-qr-value={qrCode.value}
                />
              ) : qrError ? (
                <p role="alert"><BilingualText copy={{ bn: "কিউআর তৈরি করা যায়নি। নিচের রেফারেল আইডি ব্যবহার করুন।", en: "The QR could not be generated. Use the referral ID shown below." }} /></p>
              ) : (
                <p><BilingualText copy={{ bn: "কিউআর তৈরি হচ্ছে…", en: "Generating QR…" }} /></p>
              )}
            </div>

            <dl className="detail-list referral-detail-list">
              {pathway && <div><dt><BilingualText copy={{ bn: "সেবার পথ", en: "Care pathway" }} /></dt><dd><BilingualText copy={pathway.label} /></dd></div>}
              <div><dt><BilingualText copy={{ bn: "সেবাকেন্দ্র", en: "Care facility" }} /></dt><dd>{centreName}</dd></div>
              <div><dt><BilingualText copy={{ bn: "অবস্থান", en: "Location" }} /></dt><dd>{centreArea} · {centreDistrict}</dd></div>
              <div><dt><BilingualText copy={{ bn: "সেবার ধরন", en: "Service type" }} /></dt><dd>{serviceType}</dd></div>
              <div><dt><BilingualText copy={{ bn: "বর্তমান অবস্থা", en: "Current status" }} /></dt><dd><BilingualText copy={statusCopy[referral.status]} /> <span lang="en">({referral.status})</span></dd></div>
            </dl>
          </div>

          <div className="ticket-footer">
            <Icon name="shield" />
            <p><BilingualText copy={{ bn: "কিউআরটিতে রোগীর নাম, ফোন, উপসর্গ বা অডিও নেই। রেফারেলটি পেশাদার মূল্যায়নে যাওয়ার জন্য—রোগ নির্ণয়ের ফল নয়।", en: "The QR contains no patient name, phone number, symptoms, or audio. This referral supports reaching professional evaluation; it is not a diagnosis." }} /></p>
          </div>
        </ClayCard>

        <ClayCard className="compact-card referral-help">
          <h3><BilingualText copy={{ bn: "এখন কী করবেন", en: "What to do now" }} /></h3>
          <ol className="number-list">
            <li><span className="number-list-marker">1</span><BilingualText copy={{ bn: "কিউআর বা রেফারেল আইডি সঙ্গে রাখুন", en: "Keep the QR or referral ID" }} /></li>
            <li><span className="number-list-marker">2</span><BilingualText copy={{ bn: `${centreName}-এ যান`, en: `Go to ${centreName}` }} /></li>
            <li><span className="number-list-marker">3</span><BilingualText copy={{ bn: "সেখানে আনুষ্ঠানিক মূল্যায়ন ও উপযুক্ত পরীক্ষা করান", en: "Receive formal evaluation and appropriate testing there" }} /></li>
          </ol>
          {careRecord && <Link className="button button-secondary" href={careLinkFor(careRecord)}><BilingualText copy={{ bn: "আমার সেবায় ফিরুন", en: "Return to My Care" }} /><Icon name="care" /></Link>}
          <p className="referral-safety-note"><BilingualText copy={{ bn: "কাশির সঙ্গে বেশি রক্ত, শ্বাসকষ্ট, খুব দ্রুত হৃদস্পন্দন বা বুক/পিঠের ওপরের অংশে ব্যথা থাকলে ৯৯৯-এ কল করুন বা হাসপাতালের জরুরি বিভাগে যান। এই রেফারেল জরুরি চিকিৎসার বিকল্প নয়।", en: "For more than a small amount of blood, breathing difficulty, a very fast heartbeat, or chest/upper-back pain, call 999 or go to a hospital emergency department. This referral does not replace emergency care." }} /></p>
        </ClayCard>
      </div>
    </PageShell>
  );
}
