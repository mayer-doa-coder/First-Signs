"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { BilingualText, type Copy } from "@/components/language";
import { StatusPill } from "@/components/ui";
import { hashUploadedAudio } from "@/lib/audio-hash";

export type CoughAudioChoice = "recorded" | "uploaded" | "skipped";

type CaptureStatus = "idle" | "requesting" | "recording" | "checking" | "ready" | "error";
type MeterStatus = "idle" | "live" | "unavailable";
type DirectCaptureAvailability = "checking" | "available" | "needs-https" | "unsupported";
type HearSignal = "COUGH_LIKE_SIGNAL_PRESENT" | "NO_COUGH_LIKE_SIGNAL_DETECTED" | "INCONCLUSIVE";
type TriageInputs = { coughDays: number; fever: boolean; nightSweats: boolean; weightLoss: boolean; bloodInSputum: boolean };
type TriageBand = "ELEVATED_ACOUSTIC_CONCERN" | "LOWER_ACOUSTIC_CONCERN" | "INCONCLUSIVE";
type AcousticAnalysis =
  | {
      available: true;
      model: "GOOGLE_HEAR";
      modelVersion: string;
      classifierVersion: string;
      embeddingCreated: true;
      coughDetected: boolean;
      signal: HearSignal;
      triage?: { band: TriageBand; modelVersion: string; inputMode: "AUDIO_PLUS_SCREENING_ANSWERS" };
    }
  | { available: false; reason: string };

function subscribeToBrowserCapabilities() {
  return () => {};
}

function readDirectCaptureAvailability(): DirectCaptureAvailability {
  if (!window.isSecureContext) return "needs-https";

  return typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined"
    ? "available"
    : "unsupported";
}

const tooQuietError: Copy = {
  bn: "অডিওটি খুব আস্তে বা নীরব। শান্ত জায়গায় মাইক্রোফোনের দিকে মুখ করে একটু কাছে থেকে আবার চেষ্টা করুন।",
  en: "The audio is silent or too quiet. Move closer, face the microphone, and try again in a quieter place.",
};

const decodeError: Copy = {
  bn: "এই অডিওটি যাচাই বা চালানো যায়নি। অন্য একটি অডিও ফাইল দিন অথবা আবার রেকর্ড করুন।",
  en: "This audio could not be checked or played. Choose another audio file or record again.",
};

// Keep the required quality-checking state visible long enough to be read on
// both fast phones and desktop browsers; sub-second flashes were easy to miss.
const MINIMUM_CHECKING_DISPLAY_MS = 1_200;
const MICROPHONE_REQUEST_TIMEOUT_MS = 10_000;

function microphoneError(error: unknown): Copy {
  const name = error instanceof DOMException ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      bn: "মাইক্রোফোনের অনুমতি বন্ধ আছে। ব্রাউজারের ঠিকানা বারের তালা বা মাইক্রোফোন চিহ্ন থেকে এই সাইটের Microphone অনুমতি Allow করে আবার চেষ্টা করুন।",
      en: "Microphone access is blocked. Use the lock or microphone icon in the address bar, set this site's Microphone permission to Allow, and try again.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      bn: "এই ডিভাইসে কোনো মাইক্রোফোন পাওয়া যায়নি। মাইক্রোফোন যুক্ত করুন অথবা একটি অডিও ফাইল আপলোড করুন।",
      en: "No microphone was found on this device. Connect a microphone or upload an audio file instead.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return {
      bn: "মাইক্রোফোনটি অন্য অ্যাপ ব্যবহার করছে অথবা চালু করা যাচ্ছে না। অন্য অ্যাপের রেকর্ডিং বন্ধ করে আবার চেষ্টা করুন।",
      en: "The microphone is busy in another app or could not be started. Stop other recording apps and try again.",
    };
  }
  if (name === "TimeoutError") {
    return {
      bn: "মাইক্রোফোনের অনুমতির উত্তর পাওয়া যায়নি। ব্রাউজারের অনুমতি বার্তায় Allow চাপুন, তারপর আবার চেষ্টা করুন।",
      en: "The microphone permission request was not answered. Choose Allow in the browser permission prompt, then try again.",
    };
  }

  return {
    bn: "মাইক্রোফোন চালু করা যায়নি। পাতা আবার খুলে চেষ্টা করুন, অথবা একটি অডিও ফাইল আপলোড করুন।",
    en: "The microphone could not be started. Reload the page and try again, or upload an audio file instead.",
  };
}

function microphoneConstraints(): MediaTrackConstraints {
  const supported = navigator.mediaDevices.getSupportedConstraints?.() ?? {};

  return {
    ...(supported.channelCount ? { channelCount: { ideal: 1 } } : {}),
    ...(supported.sampleRate ? { sampleRate: { ideal: 48_000 } } : {}),
    ...(supported.autoGainControl ? { autoGainControl: { ideal: true } } : {}),
    ...(supported.echoCancellation ? { echoCancellation: { ideal: false } } : {}),
    ...(supported.noiseSuppression ? { noiseSuppression: { ideal: false } } : {}),
  };
}

function requestMicrophone() {
  const request = navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() });

  return new Promise<MediaStream>((resolve, reject) => {
    let expired = false;
    const timeout = window.setTimeout(() => {
      expired = true;
      reject(new DOMException("Microphone permission timed out", "TimeoutError"));
    }, MICROPHONE_REQUEST_TIMEOUT_MS);

    request.then(
      (stream) => {
        window.clearTimeout(timeout);
        if (expired) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        resolve(stream);
      },
      (error) => {
        window.clearTimeout(timeout);
        if (!expired) reject(error);
      },
    );
  });
}

function preferredRecordingType() {
  if (typeof MediaRecorder === "undefined") return undefined;

  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]
    .find((type) => MediaRecorder.isTypeSupported(type));
}

function formatAudioTime(seconds: number) {
  const wholeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

async function hasAudibleSignal(blob: Blob) {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();

  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    let sumSquares = 0;
    let peak = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      const stride = Math.max(1, Math.floor(samples.length / 200_000));

      for (let index = 0; index < samples.length; index += stride) {
        const magnitude = Math.abs(samples[index]);
        peak = Math.max(peak, magnitude);
        sumSquares += magnitude * magnitude;
        sampleCount += 1;
      }
    }

    const rms = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
    return {
      audible: buffer.duration > 0 && peak >= 0.01 && rms >= 0.001,
      durationSeconds: buffer.duration,
    };
  } finally {
    await context.close();
  }
}

export function CoughAudioStep({
  onBack,
  onContinue,
  onSkip,
  triageInputs,
}: {
  onBack: () => void;
  onContinue: (choice: Exclude<CoughAudioChoice, "skipped">, audioHash?: string) => void;
  onSkip: () => void;
  triageInputs: TriageInputs;
}) {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [source, setSource] = useState<Exclude<CoughAudioChoice, "skipped"> | null>(null);
  const [audioHash, setAudioHash] = useState<string | undefined>();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [meterStatus, setMeterStatus] = useState<MeterStatus>("idle");
  const [error, setError] = useState<Copy | null>(null);
  const [requestSecondsLeft, setRequestSecondsLeft] = useState(MICROPHONE_REQUEST_TIMEOUT_MS / 1_000);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<Copy | null>(null);
  const [acousticAnalysis, setAcousticAnalysis] = useState<AcousticAnalysis | null>(null);
  const directCaptureAvailability = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    readDirectCaptureAvailability,
    () => "checking",
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);
  const requestAttemptRef = useRef(0);
  const busy = status === "requesting" || status === "recording" || status === "checking";
  const playbackProgress = durationSeconds && durationSeconds > 0
    ? Math.min(100, (playbackTime / durationSeconds) * 100)
    : 0;
  const meterLevelLabel: Copy = status !== "recording"
    ? { bn: "রেকর্ডিং শুরু হয়নি", en: "Not recording" }
    : meterStatus === "unavailable"
      ? { bn: "মিটার পাওয়া যায়নি", en: "Meter unavailable" }
      : inputLevel < 15
        ? { bn: "খুব কম", en: "Very low" }
        : inputLevel < 70
          ? { bn: "ভালো", en: "Good" }
          : { bn: "খুব জোরে", en: "Very loud" };

  function stopMeter() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    void analyserContextRef.current?.close();
    analyserContextRef.current = null;
    setInputLevel(0);
    setMeterStatus("idle");
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopMeter();
  }

  function releaseAudioUrl() {
    playbackRef.current?.pause();
    if (playbackRef.current) playbackRef.current.currentTime = 0;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setPlaybackTime(0);
    setIsPlaying(false);
    setPlaybackError(null);
  }

  function resetAudio() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    stopStream();
    releaseAudioUrl();
    chunksRef.current = [];
    setDurationSeconds(null);
    setSource(null);
    setAudioHash(undefined);
    setAcousticAnalysis(null);
    setError(null);
    setStatus("idle");
  }

  useEffect(() => {
    // React remounts this step (for example in development strict mode), so the
    // mounted flag has to be restored here and not only set at first render.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestAttemptRef.current += 1;
      if (recorderRef.current) recorderRef.current.onstop = null;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      void analyserContextRef.current?.close();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (status !== "requesting") return;

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setRequestSecondsLeft(Math.max(0, Math.ceil((MICROPHONE_REQUEST_TIMEOUT_MS - elapsed) / 1_000)));
    }, 250);

    return () => window.clearInterval(interval);
  }, [status]);

  async function beginLevelMeter(stream: MediaStream) {
    try {
      const context = new AudioContext();
      analyserContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") throw new Error("Audio analyser is not running");

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;
      const samples = new Uint8Array(analyser.fftSize);
      context.createMediaStreamSource(stream).connect(analyser);
      setMeterStatus("live");

      const update = () => {
        analyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        const decibels = rms > 0 ? 20 * Math.log10(rms) : -60;
        const nextLevel = Math.max(0, Math.min(100, Math.round(((decibels + 60) / 50) * 100)));
        setInputLevel((currentLevel) => Math.round(currentLevel * 0.55 + nextLevel * 0.45));
        animationFrameRef.current = requestAnimationFrame(update);
      };

      update();
    } catch {
      void analyserContextRef.current?.close();
      analyserContextRef.current = null;
      setInputLevel(0);
      setMeterStatus("unavailable");
    }
  }

  async function checkAudio(blob: Blob, nextSource: Exclude<CoughAudioChoice, "skipped">) {
    setStatus("checking");
    setError(null);
    releaseAudioUrl();

    try {
      const [quality, nextHash] = await Promise.all([
        hasAudibleSignal(blob),
        nextSource === "uploaded" ? hashUploadedAudio(blob) : Promise.resolve(undefined),
        new Promise((resolve) => setTimeout(resolve, MINIMUM_CHECKING_DISPLAY_MS)),
      ]);
      if (!mountedRef.current) return;
      if (!quality.audible) {
        setError(tooQuietError);
        setStatus("error");
        return;
      }

      let nextAnalysis: AcousticAnalysis;
      try {
        const body = new FormData();
        body.append("audio", blob, `cough.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
        body.append("triageInputs", JSON.stringify(triageInputs));
        const response = await fetch("/api/audio/analyze", { method: "POST", body });
        const payload = await response.json() as AcousticAnalysis | { error?: string };
        if (!response.ok || typeof payload !== "object" || !("available" in payload)) {
          throw new Error("Invalid acoustic-analysis response");
        }
        nextAnalysis = payload;
      } catch {
        nextAnalysis = { available: false, reason: "PROCESSING_UNAVAILABLE" };
      }
      if (!mountedRef.current) return;

      const nextUrl = URL.createObjectURL(blob);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setDurationSeconds(quality.durationSeconds);
      setSource(nextSource);
      setAudioHash(nextHash);
      setAcousticAnalysis(nextAnalysis);
      setStatus("ready");
    } catch {
      setError(decodeError);
      setStatus("error");
    }
  }

  async function startRecording() {
    resetAudio();
    const requestAttempt = requestAttemptRef.current + 1;
    requestAttemptRef.current = requestAttempt;

    if (!window.isSecureContext) {
      setError({
        bn: "মাইক্রোফোন চালাতে নিরাপদ HTTPS ঠিকানা প্রয়োজন। এই পাতাটি HTTPS-এ খুলুন অথবা একই ডিভাইসে localhost ব্যবহার করুন।",
        en: "Microphone recording requires a secure HTTPS address. Open this page over HTTPS or use localhost on the same device.",
      });
      setStatus("error");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError({
        bn: "এই ব্রাউজারে সরাসরি অডিও রেকর্ড করা যায় না। নিচে একটি অডিও ফাইল আপলোড করুন।",
        en: "Direct recording is not available in this browser. Upload an audio file below instead.",
      });
      setStatus("error");
      return;
    }

    setRequestSecondsLeft(MICROPHONE_REQUEST_TIMEOUT_MS / 1_000);
    setStatus("requesting");
    try {
      const stream = await requestMicrophone();
      if (!mountedRef.current || requestAttempt !== requestAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = preferredRecordingType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopStream();
        setError(decodeError);
        setStatus("error");
      };
      recorder.onstop = () => {
        const recordedType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recordedType });
        stopStream();
        recorderRef.current = null;
        if (!blob.size) {
          setError(tooQuietError);
          setStatus("error");
          return;
        }
        void checkAudio(blob, "recorded");
      };
      recorder.start(250);
      setStatus("recording");
      void beginLevelMeter(stream);
    } catch (recordingError) {
      if (!mountedRef.current || requestAttempt !== requestAttemptRef.current) return;
      stopStream();
      setError(microphoneError(recordingError));
      setStatus("error");
    }
  }

  function cancelMicrophoneRequest() {
    requestAttemptRef.current += 1;
    setError({
      bn: "মাইক্রোফোনের অনুরোধ বন্ধ করা হয়েছে। ব্রাউজারে এই সাইটের মাইক্রোফোন Allow করে আবার চেষ্টা করুন, অথবা ডিভাইসের রেকর্ডার ব্যবহার করুন।",
      en: "The microphone request was cancelled. Allow this site's microphone in the browser and try again, or use the device recorder.",
    });
    setStatus("error");
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function togglePlayback() {
    const player = playbackRef.current;
    if (!player) return;

    setPlaybackError(null);
    if (!player.paused) {
      player.pause();
      return;
    }

    try {
      await player.play();
    } catch {
      setPlaybackError({
        bn: "অডিও চালানো যায়নি। অন্য অডিও দিন অথবা অন্য ব্রাউজারে চেষ্টা করুন।",
        en: "The audio could not be played. Use another audio file or try a different browser.",
      });
    }
  }

  function uploadAudio(file: File | undefined, nextSource: Exclude<CoughAudioChoice, "skipped"> = "uploaded") {
    if (!file) return;
    resetAudio();
    if (file.type && !file.type.startsWith("audio/")) {
      setError({ bn: "শুধু অডিও ফাইল নির্বাচন করুন।", en: "Choose an audio file only." });
      setStatus("error");
      return;
    }
    void checkAudio(file, nextSource);
  }

  return (
    <div className="screening-form audio-step" data-screening-stage="audio">
      <section className="audio-hero" aria-labelledby="cough-audio-title">
        <span className="audio-hero-icon"><Icon name="microphone" /></span>
        <div>
          <h3 id="cough-audio-title"><BilingualText copy={{ bn: "কাশির অডিও দিন", en: "Add a cough recording" }} /></h3>
          <p><BilingualText copy={{ bn: "শান্ত জায়গায় ডিভাইসটি স্থির রাখুন। মাইক্রোফোনের দিকে মুখ করে ২–৩ বার স্বাভাবিকভাবে কাশুন। শব্দের মিটার খুব কম নড়লে একটু কাছে আসুন।", en: "Keep the device steady in a quiet place. Face the microphone and cough naturally 2–3 times. Move closer if the sound meter barely moves." }} /></p>
          <p className="audio-hygiene"><BilingualText copy={{ bn: "শেয়ার করা ডিভাইসের ওপর সরাসরি কাশবেন না। নিরাপদ দূরত্ব রাখুন এবং মুখ ঢেকে কাশুন।", en: "Do not cough directly onto a shared device. Keep a safe distance and cover your cough." }} /></p>
        </div>
      </section>

      <div className="audio-choice-grid">
        <section className="audio-choice-card" data-direct-recording={directCaptureAvailability}>
          <Icon name="microphone" />
          <h3><BilingualText copy={{ bn: "এখন রেকর্ড করুন", en: "Record now" }} /></h3>
          <p><BilingualText copy={{ bn: "রেকর্ডিং শুধু এই ব্রাউজারে রাখা হবে।", en: "The recording stays in this browser only." }} /></p>
          {directCaptureAvailability === "needs-https" && (
            <div className="mobile-recording-notice" role="status">
              <Icon name="info" />
              <p><BilingualText copy={{
                bn: "এই HTTP লিঙ্কে ব্রাউজার সরাসরি মাইক খুলতে পারে না। নিচের বোতামে এই ফোনের রেকর্ডার খুলে এখানেই নতুন অডিও দিন। সরাসরি মাইক ব্যবহারের জন্য সাইটটি HTTPS-এ খুলতে হবে।",
                en: "A browser cannot open the microphone directly from this HTTP link. Use the button below to open this phone's recorder and add a new recording here. Direct microphone recording requires HTTPS.",
              }} /></p>
            </div>
          )}
          {directCaptureAvailability === "unsupported" && (
            <div className="mobile-recording-notice" role="status">
              <Icon name="info" />
              <p><BilingualText copy={{
                bn: "এই ব্রাউজারে সরাসরি রেকর্ডিং নেই। নিচের বোতামে এই ফোনের রেকর্ডার খুলে এখানেই নতুন অডিও দিন।",
                en: "Direct recording is unavailable in this browser. Use the button below to open this phone's recorder and add a new recording here.",
              }} /></p>
            </div>
          )}
          {directCaptureAvailability !== "available" ? (
            <label className={`button button-primary file-button native-record-button ${busy ? "file-button-disabled" : ""}`}>
              <Icon name="microphone" />
              <BilingualText copy={directCaptureAvailability === "checking"
                ? { bn: "মাইক্রোফোন যাচাই হচ্ছে...", en: "Checking microphone..." }
                : { bn: "এই ফোনে রেকর্ড করুন", en: "Record on this phone" }} />
              <input
                type="file"
                name="deviceCoughAudio"
                accept="audio/*"
                capture="user"
                disabled={busy || directCaptureAvailability === "checking"}
                onChange={(event) => {
                  uploadAudio(event.target.files?.[0], "recorded");
                  event.target.value = "";
                }}
              />
            </label>
          ) : status === "recording" ? (
            <button className="button button-secondary" type="button" onClick={stopRecording}>
              <Icon name="stop" />
              <BilingualText copy={{ bn: "রেকর্ডিং বন্ধ করুন", en: "Stop recording" }} />
            </button>
          ) : (
            <button className="button button-primary" type="button" onClick={() => void startRecording()} disabled={status === "requesting" || status === "checking"}>
              <Icon name="microphone" />
              <BilingualText copy={status === "requesting" ? { bn: "মাইক্রোফোন চালু হচ্ছে...", en: "Starting microphone..." } : { bn: "রেকর্ডিং শুরু করুন", en: "Start recording" }} />
            </button>
          )}

          {status === "requesting" && (
            <div className="microphone-permission" role="status" aria-live="polite">
              <Icon name="info" />
              <div>
                <p><BilingualText copy={{ bn: "ব্রাউজার অনুমতি চাইলে Allow চাপুন। ‘মাইক চালু—রেকর্ডিং চলছে’ দেখা না পর্যন্ত কাশবেন না।", en: "Choose Allow when the browser asks for microphone permission. Do not cough until you see ‘Microphone live—recording’." }} /></p>
                <p className="permission-countdown"><BilingualText copy={{ bn: `আর ${requestSecondsLeft} সেকেন্ডের মধ্যে অনুমতি না এলে এই চেষ্টা নিজে থেকে বন্ধ হবে।`, en: `This attempt will stop automatically if permission is not received within ${requestSecondsLeft} seconds.` }} /></p>
                <div className="permission-actions">
                  <button className="button button-quiet" type="button" onClick={cancelMicrophoneRequest}>
                    <BilingualText copy={{ bn: "অপেক্ষা বন্ধ করুন", en: "Stop waiting" }} />
                  </button>
                  <button className="button button-secondary" type="button" onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}>
                    <BilingualText copy={{ bn: "নতুন ট্যাবে খুলুন", en: "Open in a new tab" }} />
                  </button>
                </div>
              </div>
            </div>
          )}
          {directCaptureAvailability === "available" && status !== "requesting" && status !== "recording" && (
            <p className="microphone-help"><BilingualText copy={{ bn: "বোতাম চাপার পর ব্রাউজারের মাইক্রোফোন অনুমতি দিন।", en: "After pressing the button, allow microphone access in your browser." }} /></p>
          )}
          {status === "recording" && (
            <p className="recording-status" role="status"><span className="recording-dot" aria-hidden="true" /> <BilingualText copy={{ bn: "মাইক চালু—রেকর্ডিং চলছে", en: "Microphone live—recording" }} /></p>
          )}

          {directCaptureAvailability === "available" && (
            <>
              <div className="audio-level-heading">
                <span><BilingualText copy={{ bn: "শব্দের মাত্রা", en: "Sound level" }} /></span>
                <strong><BilingualText copy={meterLevelLabel} /></strong>
              </div>
              <div
                className={`audio-level ${status === "recording" && meterStatus === "live" ? "audio-level-live" : ""}`}
                role="progressbar"
                aria-label="মাইক্রোফোনের শব্দের মাত্রা / Microphone sound level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status === "recording" && meterStatus === "live" ? inputLevel : 0}
                aria-valuetext={`${meterLevelLabel.bn} / ${meterLevelLabel.en}`}
              >
                <span style={{ width: `${status === "recording" && meterStatus === "live" ? inputLevel : 0}%` }} />
              </div>
              <div className="audio-level-scale" aria-hidden="true">
                <span><BilingualText copy={{ bn: "কম", en: "Low" }} /></span>
                <span><BilingualText copy={{ bn: "ভালো", en: "Good" }} /></span>
                <span><BilingualText copy={{ bn: "জোরে", en: "Loud" }} /></span>
              </div>
            </>
          )}
          {status === "recording" && meterStatus === "unavailable" && (
            <p className="meter-unavailable" role="status"><BilingualText copy={{ bn: "রেকর্ডিং চলছে, তবে এই ব্রাউজার সরাসরি শব্দের মিটার দেখাতে পারছে না। রেকর্ডিং বন্ধ করে অডিও চালিয়ে শুনুন।", en: "Recording is running, but this browser cannot show the live sound meter. Stop and play back the audio to check it." }} /></p>
          )}
          {directCaptureAvailability === "available" && <div className="device-recorder-fallback">
            <p><BilingualText copy={{ bn: "ব্রাউজারের মাইক চালু না হলে এখান থেকে ফোন বা ট্যাবলেটের নিজস্ব রেকর্ডার খুলুন।", en: "If the browser microphone does not start, open your phone or tablet's recorder from here." }} /></p>
            <label className={`button button-secondary file-button ${busy ? "file-button-disabled" : ""}`}>
              <Icon name="microphone" />
              <BilingualText copy={{ bn: "এই ফোনে রেকর্ড করুন", en: "Record on this phone" }} />
              <input
                type="file"
                name="deviceCoughAudio"
                accept="audio/*"
                capture="user"
                disabled={busy}
                onChange={(event) => {
                  uploadAudio(event.target.files?.[0], "recorded");
                  event.target.value = "";
                }}
              />
            </label>
          </div>}
        </section>

        <section className="audio-choice-card">
          <Icon name="upload" />
          <h3><BilingualText copy={{ bn: "অডিও আপলোড করুন", en: "Upload audio" }} /></h3>
          <p><BilingualText copy={{ bn: "আপনার ডিভাইস থেকে একটি অডিও ফাইল বেছে নিন।", en: "Choose an audio file from your device." }} /></p>
          <label className={`button button-secondary file-button ${busy ? "file-button-disabled" : ""}`}>
            <Icon name="upload" />
            <BilingualText copy={{ bn: "অডিও ফাইল বেছে নিন", en: "Choose audio file" }} />
            <input
              type="file"
              name="coughAudio"
              accept="audio/*"
              disabled={busy}
              onChange={(event) => {
                uploadAudio(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </section>
      </div>

      {status === "checking" && (
        <div className="audio-checking" role="status" aria-live="polite">
          <span className="loading-dot" aria-hidden="true" />
          <BilingualText copy={{ bn: "অডিওর মান ও কাশির সংকেত যাচাই করা হচ্ছে...", en: "Checking audio quality and cough signal..." }} />
        </div>
      )}

      {status === "error" && error && (
        <div className="audio-error" role="alert">
          <Icon name="info" />
          <p><BilingualText copy={error} /></p>
        </div>
      )}

      {status === "ready" && audioUrl && source && acousticAnalysis && (
        <section className="prototype-audio-result" aria-labelledby="prototype-audio-title">
          <StatusPill
            tone="neutral"
            icon="info"
            label={acousticAnalysis.available
              ? { bn: "সহায়ক পরীক্ষামূলক HeAR সংকেত", en: "Supporting experimental HeAR signal" }
              : { bn: "উপসর্গভিত্তিক বিকল্প চালু", en: "Symptom-based fallback active" }}
          />
          <h3 id="prototype-audio-title"><BilingualText copy={{ bn: "পরীক্ষামূলক অ্যাকুস্টিক ফলাফল", en: "Experimental acoustic result" }} /></h3>
          <p><BilingualText copy={acousticAnalysis.available
            ? { bn: "Google HeAR অডিও থেকে একটি এমবেডিং তৈরি করেছে এবং কাশি-উপস্থিতির পরীক্ষামূলক মডেল সেটি যাচাই করেছে। এটি যক্ষ্মা রোগ নির্ণয় করে না এবং নির্দিষ্ট উপসর্গভিত্তিক নিরাপত্তা ফলাফল বদলায় না।", en: "Google HeAR created an audio embedding and an experimental cough-presence model checked it. This does not diagnose TB and cannot change the fixed symptom-based safety result." }
            : { bn: "অ্যাকুস্টিক প্রক্রিয়াকরণ সম্পন্ন হয়নি। পরামর্শ শুধু নির্দিষ্ট উপসর্গভিত্তিক স্ক্রিনিংয়ের ওপর ভিত্তি করে দেওয়া হবে।", en: "Acoustic processing could not be completed. The recommendation will be based only on the fixed symptom screening." }
          } /></p>
          <div className="audio-player" data-audio-player>
            <button className="audio-play-button" type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? "অডিও থামান / Pause audio" : "অডিও চালান / Play audio"}>
              <Icon name={isPlaying ? "pause" : "play"} />
            </button>
            <span className="audio-time" lang="en">{formatAudioTime(playbackTime)}</span>
            <div
              className="audio-playback-progress"
              role="progressbar"
              aria-label="অডিও চালানোর অগ্রগতি / Audio playback progress"
              aria-valuemin={0}
              aria-valuemax={durationSeconds ?? 0}
              aria-valuenow={Math.min(playbackTime, durationSeconds ?? playbackTime)}
              aria-valuetext={`${formatAudioTime(playbackTime)} / ${formatAudioTime(durationSeconds ?? 0)}`}
            >
              <span style={{ width: `${playbackProgress}%` }} />
            </div>
            <span className="audio-time" lang="en">{formatAudioTime(durationSeconds ?? 0)}</span>
            <audio
              ref={playbackRef}
              className="audio-playback-source"
              preload="auto"
              src={audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(event) => setPlaybackTime(Math.min(event.currentTarget.currentTime, durationSeconds ?? event.currentTarget.currentTime))}
              onEnded={() => {
                setIsPlaying(false);
                setPlaybackTime(durationSeconds ?? 0);
              }}
            />
          </div>
          {playbackError && <p className="audio-playback-error" role="alert"><BilingualText copy={playbackError} /></p>}
          <dl className="prototype-result-grid">
            <div><dt><BilingualText copy={{ bn: "অডিও ব্যবহারযোগ্য", en: "Audio usable" }} /></dt><dd><BilingualText copy={{ bn: "হ্যাঁ", en: "Yes" }} /></dd></div>
            <div>
              <dt><BilingualText copy={{ bn: "HeAR এমবেডিং", en: "HeAR embedding" }} /></dt>
              <dd><BilingualText copy={acousticAnalysis.available ? { bn: "তৈরি হয়েছে", en: "Created" } : { bn: "পাওয়া যায়নি", en: "Unavailable" }} /></dd>
            </div>
            <div>
              <dt><BilingualText copy={{ bn: "পরীক্ষামূলক কাশির সংকেত", en: "Experimental cough signal" }} /></dt>
              <dd><BilingualText copy={!acousticAnalysis.available
                ? { bn: "প্রক্রিয়াকরণ ব্যর্থ", en: "Processing failed" }
                : acousticAnalysis.signal === "COUGH_LIKE_SIGNAL_PRESENT"
                  ? { bn: "কাশির মতো সংকেত পাওয়া গেছে", en: "Cough-like signal found" }
                  : acousticAnalysis.signal === "NO_COUGH_LIKE_SIGNAL_DETECTED"
                    ? { bn: "কাশির মতো সংকেত পাওয়া যায়নি", en: "No cough-like signal detected" }
                    : { bn: "ফলাফল অনির্দিষ্ট", en: "Inconclusive" }
              } /></dd>
            </div>
            {acousticAnalysis.available && acousticAnalysis.triage && (
              <div>
                <dt><BilingualText copy={{ bn: "গবেষণাভিত্তিক অডিও উদ্বেগ সংকেত", en: "Research acoustic concern signal" }} /></dt>
                <dd><BilingualText copy={
                  acousticAnalysis.triage.band === "ELEVATED_ACOUSTIC_CONCERN"
                    ? { bn: "বর্ধিত উদ্বেগ", en: "Elevated concern" }
                    : acousticAnalysis.triage.band === "LOWER_ACOUSTIC_CONCERN"
                      ? { bn: "তুলনামূলক কম উদ্বেগ", en: "Lower concern" }
                      : { bn: "অনির্দিষ্ট", en: "Inconclusive" }
                } /></dd>
              </div>
            )}
          </dl>
          {acousticAnalysis.available && acousticAnalysis.triage && (
            <p className="audio-triage-notice"><BilingualText copy={acousticAnalysis.triage.band === "ELEVATED_ACOUSTIC_CONCERN"
              ? { bn: "এটি গবেষণাভিত্তিক ট্রায়াজ সংকেত, রোগ নির্ণয় নয়। নির্দিষ্ট উপসর্গভিত্তিক ফলাফল ও পরবর্তী পদক্ষেপই প্রাধান্য পাবে।", en: "This is an investigational triage signal, not a diagnosis. The fixed symptom-based outcome and next action remain primary." }
              : { bn: "এই গবেষণাভিত্তিক সংকেত যক্ষ্মা বাদ দেয় না। নির্দিষ্ট উপসর্গভিত্তিক ফলাফল ও পরবর্তী পদক্ষেপ অনুসরণ করুন।", en: "This investigational signal does not rule out TB. Follow the fixed symptom-based outcome and next action." }
            } /></p>
          )}
          {acousticAnalysis.available && (
            <p className="audio-model-version" lang="en">
              {acousticAnalysis.modelVersion} · {acousticAnalysis.classifierVersion}
            </p>
          )}
          {durationSeconds !== null && <p className="audio-duration"><BilingualText copy={{ bn: `অডিওর সঠিক দৈর্ঘ্য: ${durationSeconds.toFixed(1)} সেকেন্ড`, en: `Verified audio duration: ${durationSeconds.toFixed(1)} seconds` }} /></p>}
          <button className="button button-quiet" type="button" onClick={resetAudio}>
            <BilingualText copy={{ bn: "অন্য অডিও দিন", en: "Use different audio" }} />
          </button>
        </section>
      )}

      <div className="form-actions audio-actions">
        <button className="button button-quiet" type="button" onClick={onBack} disabled={busy}>
          <BilingualText copy={{ bn: "উত্তর বদলান", en: "Change answers" }} />
        </button>
        <div className="audio-forward-actions">
          <button className="button button-quiet" type="button" onClick={onSkip} disabled={busy}>
            <BilingualText copy={{ bn: "এখন অডিও দেব না", en: "Skip audio for now" }} />
          </button>
          <button className="button button-primary" type="button" disabled={status !== "ready" || !source} onClick={() => source && onContinue(source, audioHash)}>
            <BilingualText copy={{ bn: "ফলাফল নিয়ে এগিয়ে যান", en: "Continue with result" }} />
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
