"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import jsQR from "jsqr";
import { BilingualText, type Copy, useLanguage } from "@/components/language";
import { Icon } from "@/components/icons";
import { ClayCard, DemoNotice, PageShell, StatusPill } from "@/components/ui";
import {
  confirmFormalEvaluation,
  fetchReferralForVerification,
  parseReferralLookup,
  type ReferralLookup,
  type ReferralStatus,
  type VerificationReferralView,
} from "@/lib/referrals";
import { getTbCentre } from "@/lib/tb-centres";

type CameraState = "idle" | "starting" | "live" | "blocked" | "unavailable";
type LookupError = "invalid" | "not-found" | "access-denied" | "access-not-configured" | "unavailable" | null;

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

export function ReferralVerification() {
  const { language } = useLanguage();
  const [manualValue, setManualValue] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [lookup, setLookup] = useState<ReferralLookup | null>(null);
  const [referral, setReferral] = useState<VerificationReferralView | null>(null);
  const [lookupError, setLookupError] = useState<LookupError>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [scannerMessage, setScannerMessage] = useState<Copy | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confirmedRef = useRef<HTMLDivElement>(null);
  const focusConfirmationRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const scanAttemptRef = useRef(0);

  function stopCamera() {
    scanAttemptRef.current += 1;
    if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("idle");
  }

  useEffect(() => () => {
    scanAttemptRef.current += 1;
    if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function findReferral(nextLookup: ReferralLookup) {
    stopCamera();
    setBusy(true);
    setLookupError(null);
    setConfirmError(false);
    setScannerMessage(null);
    setReferral(null);
    try {
      const found = await fetchReferralForVerification(nextLookup, staffPin);
      setLookup(nextLookup);
      setReferral(found);
      setManualValue(found.referralId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setLookupError(code === "REFERRAL_NOT_FOUND"
        ? "not-found"
        : code === "TB_CENTRE_ACCESS_DENIED"
          ? "access-denied"
          : code === "TB_CENTRE_ACCESS_NOT_CONFIGURED"
            ? "access-not-configured"
            : "unavailable");
      setLookup(null);
    } finally {
      setBusy(false);
    }
  }

  function submitManualLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseReferralLookup(manualValue);
    if (!parsed) {
      setLookupError("invalid");
      setReferral(null);
      return;
    }
    void findReferral(parsed);
  }

  async function handleQrValue(value: string, invalidCopy: Copy) {
    const parsed = parseReferralLookup(value);
    if (!parsed) {
      setScannerMessage(invalidCopy);
      return false;
    }
    await findReferral(parsed);
    return true;
  }

  async function startCamera() {
    setScannerMessage(null);
    setLookupError(null);
    if (!staffPin.trim()) {
      setLookupError("access-denied");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("unavailable");
      return;
    }

    stopCamera();
    const attempt = scanAttemptRef.current + 1;
    scanAttemptRef.current = attempt;
    setCameraState("starting");
    let timedOut = false;
    const request = navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        timedOut = true;
        reject(new Error("CAMERA_TIMEOUT"));
      }, 10000);
    });
    request.then((lateStream) => {
      if (timedOut || scanAttemptRef.current !== attempt) {
        lateStream.getTracks().forEach((track) => track.stop());
      }
    }).catch(() => undefined);

    try {
      const stream = await Promise.race([request, timeout]);
      if (scanAttemptRef.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_UNAVAILABLE");
      video.srcObject = stream;
      await video.play();
      setCameraState("live");

      let lastScan = 0;
      const scan = (timestamp: number) => {
        if (scanAttemptRef.current !== attempt || !streamRef.current) return;
        const canvas = canvasRef.current;
        const activeVideo = videoRef.current;
        if (canvas && activeVideo && activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && activeVideo.videoWidth > 0 && timestamp - lastScan >= 180) {
          lastScan = timestamp;
          const width = Math.min(activeVideo.videoWidth, 960);
          const height = Math.round(activeVideo.videoHeight * (width / activeVideo.videoWidth));
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context?.drawImage(activeVideo, 0, 0, width, height);
          const image = context?.getImageData(0, 0, width, height);
          const decoded = image ? jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" }) : null;
          if (decoded?.data) {
            void handleQrValue(decoded.data, {
              bn: "এটি ফার্স্ট সাইনস-এর রেফারেল কিউআর নয়। সঠিক কিউআরটি ক্যামেরার সামনে ধরুন।",
              en: "This is not a First Signs referral QR. Hold the correct QR in front of the camera.",
            });
            if (parseReferralLookup(decoded.data)) return;
          }
        }
        scanFrameRef.current = window.requestAnimationFrame(scan);
      };
      scanFrameRef.current = window.requestAnimationFrame(scan);
    } catch {
      if (scanAttemptRef.current === attempt) {
        stopCamera();
        setCameraState("blocked");
      }
    }
  }

  async function readQrImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setScannerMessage(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("NO_CANVAS");
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = context?.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = image ? jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" }) : null;
      if (!decoded?.data) throw new Error("QR_NOT_FOUND");
      await handleQrValue(decoded.data, {
        bn: "ছবিতে একটি কিউআর পাওয়া গেছে, কিন্তু এটি সঠিক রেফারেল কিউআর নয়।",
        en: "A QR was found in the image, but it is not a valid referral QR.",
      });
    } catch {
      setScannerMessage({
        bn: "ছবিতে রেফারেল কিউআর পড়া যায়নি। পরিষ্কার ছবি নিন অথবা রেফারেল আইডি লিখুন।",
        en: "The referral QR could not be read from that image. Take a clear photo or enter the referral ID.",
      });
    }
  }

  async function confirmAttendance() {
    if (!lookup || !referral || busy || referral.codeUsed || referral.status === "CLOSED") return;
    setBusy(true);
    setConfirmError(false);
    try {
      setReferral(await confirmFormalEvaluation(lookup, referral.tbCenterId, staffPin));
      focusConfirmationRef.current = true;
    } catch {
      setConfirmError(true);
    } finally {
      setBusy(false);
    }
  }

  // The confirm button unmounts once the code is used, which would otherwise
  // drop keyboard focus to the document body; move it to the confirmation.
  useEffect(() => {
    if (!focusConfirmationRef.current) return;
    focusConfirmationRef.current = false;
    confirmedRef.current?.focus();
  }, [referral]);

  const centre = getTbCentre(referral?.tbCenterId);
  const centreName = centre?.name[language] ?? referral?.centreName;
  const centreArea = centre?.area[language] ?? referral?.centreArea;
  const centreDistrict = centre?.district[language] ?? referral?.centreDistrict;
  const serviceType = centre?.serviceType[language] ?? referral?.serviceType;
  const canConfirm = referral && !referral.codeUsed && (referral.status === "PENDING" || referral.status === "FOLLOW_UP");

  return (
    <PageShell
      eyebrow={{ bn: "সেবাকেন্দ্র কর্মক্ষেত্র", en: "TB centre workspace" }}
      title={{ bn: "রেফারেল উপস্থিতি যাচাই", en: "Verify referral attendance" }}
      description={{ bn: "সেবাকেন্দ্র কর্মীরা রেফারেল খুঁজে আনুষ্ঠানিক মূল্যায়ন শুরু হওয়ার তথ্য নিশ্চিত করবেন।", en: "TB-centre staff can find a referral and confirm that formal evaluation has started." }}
      icon="building"
    >
      <DemoNotice />
      <div className="verify-layout">
        <ClayCard className="form-card verify-search-card" as="section">
          <div className="card-heading-row">
            <div>
              <span className="mini-label"><BilingualText copy={{ bn: "কর্মী প্রবেশ", en: "Staff access" }} /></span>
              <h2><BilingualText copy={{ bn: "রেফারেল খুঁজুন", en: "Find a referral" }} /></h2>
            </div>
            <StatusPill tone="neutral" icon="shield" label={{ bn: "সীমিত প্রবেশ", en: "Restricted access" }} />
          </div>
          <form className="field-stack" onSubmit={submitManualLookup}>
            <label htmlFor="tb-centre-staff-pin"><BilingualText copy={{ bn: "সেবাকেন্দ্র কর্মীর পিন", en: "TB centre staff PIN" }} /></label>
            <div className="input-with-icon">
              <Icon name="shield" />
              <input
                id="tb-centre-staff-pin"
                name="tb-centre-staff-pin"
                type="password"
                lang="en"
                inputMode="numeric"
                autoComplete="off"
                value={staffPin}
                onChange={(event) => {
                  setStaffPin(event.target.value);
                  setLookupError(null);
                  setReferral(null);
                  setLookup(null);
                }}
                disabled={busy}
                required
              />
            </div>
            <p className="helper-text"><BilingualText copy={{ bn: "এই সার্ভার-নিয়ন্ত্রিত পিন শুধু যক্ষ্মা সেবাকেন্দ্র কর্মীর জন্য। ফার্মেসি এটি ব্যবহার করবে না।", en: "This server-controlled PIN is for TB-centre staff only. Pharmacies must not use it." }} /></p>
            <label htmlFor="referral-id"><BilingualText copy={{ bn: "রেফারেল আইডি", en: "Referral ID" }} /></label>
            <div className="input-with-icon">
              <Icon name="search" />
              <input
                id="referral-id"
                name="referral-id"
                type="text"
                lang="en"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="JVH-KHU-00001"
                value={manualValue}
                onChange={(event) => {
                  setManualValue(event.target.value);
                  setLookupError(null);
                }}
                disabled={busy}
                required
              />
            </div>
            {lookupError && (
              <p className="verify-error" role="alert">
                <BilingualText copy={lookupError === "invalid"
                  ? { bn: "সঠিক রেফারেল আইডি লিখুন, যেমন JVH-KHU-00001।", en: "Enter a valid referral ID, such as JVH-KHU-00001." }
                  : lookupError === "not-found"
                    ? { bn: "এই রেফারেলটি পাওয়া যায়নি। আইডি বা কিউআর আবার দেখুন।", en: "This referral was not found. Check the ID or QR and try again." }
                    : lookupError === "access-denied"
                      ? { bn: "সেবাকেন্দ্র কর্মীর পিন সঠিক নয় অথবা দেওয়া হয়নি।", en: "The TB-centre staff PIN is missing or incorrect." }
                      : lookupError === "access-not-configured"
                        ? { bn: "সেবাকেন্দ্র প্রবেশ এখনো কনফিগার করা হয়নি। সার্ভারে TB_CENTRE_STAFF_PIN যোগ করুন।", en: "TB-centre access is not configured. Add TB_CENTRE_STAFF_PIN on the server." }
                        : { bn: "রেফারেল সেবা এখন পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।", en: "The referral service is unavailable right now. Please try again shortly." }} />
              </p>
            )}
            <button className="button button-primary button-full" type="submit" disabled={busy || !staffPin.trim()}>
              <BilingualText copy={busy ? { bn: "যাচাই করা হচ্ছে…", en: "Checking…" } : { bn: "রেফারেল যাচাই করুন", en: "Check referral" }} />
              <Icon name="arrow" />
            </button>
          </form>
        </ClayCard>

        <ClayCard className="verify-scanner-card" as="section">
          <div className="card-heading-row">
            <div>
              <span className="mini-label"><BilingualText copy={{ bn: "কিউআর বিকল্প", en: "QR option" }} /></span>
              <h2><BilingualText copy={{ bn: "রেফারেল কিউআর স্ক্যান করুন", en: "Scan referral QR" }} /></h2>
            </div>
            <Icon name="screen" />
          </div>
          <div className={`verify-camera ${cameraState === "live" ? "verify-camera-live" : ""}`}>
            <video ref={videoRef} muted playsInline aria-label="রেফারেল কিউআর ক্যামেরা / Referral QR camera" />
            {cameraState !== "live" && (
              <div className="verify-camera-placeholder"><Icon name="screen" /><BilingualText copy={{ bn: "পেছনের ক্যামেরায় কিউআরটি ধরুন", en: "Hold the QR in front of the rear camera" }} /></div>
            )}
          </div>
          <canvas ref={canvasRef} className="verify-scan-canvas" aria-hidden="true" />
          <div className="verify-scan-actions">
            {cameraState === "live" || cameraState === "starting" ? (
              <button className="button button-secondary" type="button" onClick={stopCamera}>
                <Icon name="stop" /><BilingualText copy={{ bn: "ক্যামেরা বন্ধ করুন", en: "Stop camera" }} />
              </button>
            ) : (
              <button className="button button-secondary" type="button" onClick={() => void startCamera()} disabled={busy || !staffPin.trim()}>
                <Icon name="screen" /><BilingualText copy={{ bn: "ক্যামেরা দিয়ে স্ক্যান", en: "Scan with camera" }} />
              </button>
            )}
            <label className="button button-quiet verify-file-button">
              <Icon name="upload" />
              <BilingualText copy={{ bn: "কিউআর ছবি বেছে নিন", en: "Choose QR image" }} />
              <input type="file" accept="image/*" capture="environment" onChange={(event) => void readQrImage(event)} disabled={busy || !staffPin.trim()} />
            </label>
          </div>
          {cameraState === "starting" && <p className="helper-text" role="status"><BilingualText copy={{ bn: "ক্যামেরার অনুমতি চাওয়া হচ্ছে…", en: "Requesting camera permission…" }} /></p>}
          {cameraState === "unavailable" && <p className="verify-warning" role="alert"><BilingualText copy={{ bn: "এই লিংকে ক্যামেরা চালানো যাচ্ছে না। HTTPS লিংক ব্যবহার করুন, কিউআর ছবি বেছে নিন, অথবা আইডি লিখুন।", en: "The camera cannot run on this link. Use an HTTPS link, choose a QR image, or enter the ID." }} /></p>}
          {cameraState === "blocked" && <p className="verify-warning" role="alert"><BilingualText copy={{ bn: "ক্যামেরা চালু হয়নি। ব্রাউজারে অনুমতি দিন, অথবা কিউআর ছবি/রেফারেল আইডি ব্যবহার করুন।", en: "The camera did not start. Allow camera access, or use a QR image/referral ID." }} /></p>}
          {scannerMessage && <p className="verify-warning" role="alert"><BilingualText copy={scannerMessage} /></p>}
        </ClayCard>
      </div>

      {referral && (
        <ClayCard className={`verification-result ${referral.codeUsed ? "verification-result-used" : ""}`} as="section" data-verification-result>
          <div className="card-heading-row">
            <div>
              <span className="mini-label"><BilingualText copy={{ bn: "রেফারেল পাওয়া গেছে", en: "Referral found" }} /></span>
              <h2 lang="en">{referral.referralId}</h2>
            </div>
            <StatusPill tone={statusTone(referral.status)} icon={referral.codeUsed ? "check" : "clock"} label={statusCopy[referral.status]} />
          </div>
          <div className="verification-details">
            <dl className="detail-list">
              <div><dt><BilingualText copy={{ bn: "একবার ব্যবহার হয়েছে কি না", en: "Already used" }} /></dt><dd><BilingualText copy={referral.codeUsed ? { bn: "হ্যাঁ", en: "Yes" } : { bn: "না", en: "No" }} /></dd></div>
              <div><dt><BilingualText copy={{ bn: "নির্ধারিত যক্ষ্মা সেবাকেন্দ্র", en: "Intended TB centre" }} /></dt><dd>{centreName}</dd></div>
              <div><dt><BilingualText copy={{ bn: "অবস্থান", en: "Location" }} /></dt><dd>{centreArea} · {centreDistrict}</dd></div>
              <div><dt><BilingualText copy={{ bn: "তালিকাভুক্ত সেবা", en: "Listed service" }} /></dt><dd>{serviceType}</dd></div>
            </dl>
            <div className="verification-action-panel">
              {canConfirm ? (
                <>
                  <p><BilingualText copy={{ bn: "শুধু ব্যক্তি এই নির্ধারিত কেন্দ্রে উপস্থিত হয়ে আনুষ্ঠানিক মূল্যায়ন শুরু করলে নিশ্চিত করুন।", en: "Confirm only after the person arrives at this intended centre and formal evaluation starts." }} /></p>
                  <button className="button button-primary" type="button" onClick={() => void confirmAttendance()} disabled={busy} data-confirm-evaluation>
                    <Icon name="check" />
                    <BilingualText copy={busy ? { bn: "নিশ্চিত করা হচ্ছে…", en: "Confirming…" } : { bn: "আনুষ্ঠানিক মূল্যায়ন শুরু নিশ্চিত করুন", en: "Confirm Formal Evaluation Started" }} />
                  </button>
                </>
              ) : referral.codeUsed ? (
                <div className="verification-confirmed" role="status" ref={confirmedRef} tabIndex={-1}>
                  <Icon name="check" />
                  <div><strong><BilingualText copy={{ bn: "আনুষ্ঠানিক মূল্যায়নে উপস্থিতি নিশ্চিত হয়েছে।", en: "Formal evaluation attendance confirmed." }} /></strong><p><BilingualText copy={{ bn: "রেফারেল কোডটি ব্যবহৃত হয়েছে; আবার ব্যবহার করা যাবে না।", en: "The referral code has been used and cannot be used again." }} /></p></div>
                </div>
              ) : (
                <p className="verify-warning"><BilingualText copy={{ bn: "বন্ধ রেফারেল সম্পন্ন করা যাবে না।", en: "A closed referral cannot be completed." }} /></p>
              )}
              {confirmError && <p className="verify-error" role="alert"><BilingualText copy={{ bn: "নিশ্চিত করা যায়নি। অবস্থা আবার যাচাই করে চেষ্টা করুন।", en: "Confirmation failed. Check the referral status and try again." }} /></p>}
            </div>
          </div>
          <div className="formal-evaluation-note">
            <Icon name="info" />
            <p><BilingualText copy={{
              bn: "এখানে সম্পন্ন মানে উপস্থিতি ও আনুষ্ঠানিক মূল্যায়ন শুরু নিশ্চিত হয়েছে—যক্ষ্মা রোগ নির্ণয় বা পরীক্ষার ফল নয়। প্রশিক্ষিত কর্মী উপসর্গ ও ইতিহাস দেখবেন এবং কেন্দ্রের সেবা ও ব্যক্তির প্রয়োজন অনুযায়ী কফের জিনএক্সপার্ট বা অন্য দ্রুত আণবিক পরীক্ষা, মাইক্রোস্কপি, বুকের এক্স-রে বা অন্য পরীক্ষা বেছে নিতে পারেন।",
              en: "Completed here confirms attendance and the start of formal evaluation—not a TB diagnosis or test result. Trained staff will review symptoms and history and may select sputum GeneXpert/another rapid molecular test, microscopy, chest X-ray, or other tests according to the centre's services and the person's needs.",
            }} /></p>
          </div>
        </ClayCard>
      )}
    </PageShell>
  );
}
