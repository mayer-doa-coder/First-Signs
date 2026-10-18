"use client";
/* eslint-disable @next/next/no-img-element -- selected image files use transient object URLs and cannot use Next optimization. */

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { Icon } from "@/components/icons";

type Source = { title: string; url: string };
type Chat = { role: "USER" | "ASSISTANT"; content: string; citations?: Source[] };
type Settings = { activityContextEnabled: boolean; memoryEnabled: boolean };
type Attachment = { id: string; file: File; url: string };
type Props = { variant: "page" | "drawer"; showControls?: boolean; onClose?: () => void };

const acceptedMedia = "image/jpeg,image/png,image/webp,audio/wav,audio/ogg,audio/webm,audio/m4a,audio/mp4,audio/mpeg";
const maxAttachments = 3;

function kindLabel(file: File, language: "bn" | "en") {
  return file.type.startsWith("image/") ? (language === "bn" ? "ছবি" : "Image") : (language === "bn" ? "অডিও" : "Audio");
}

export function AssistantChat({ variant, showControls = false, onClose }: Props) {
  const { language } = useLanguage();
  const [signedIn, setSignedIn] = useState(false);
  const [settings, setSettings] = useState<Settings>({ activityContextEnabled: false, memoryEnabled: false });
  const [messages, setMessages] = useState<Chat[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Copy | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const inputId = useId();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const attachmentUrls = useRef<string[]>([]);

  useEffect(() => {
    void fetch("/api/health-assistant", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return;
        setSignedIn(data.signedIn === true);
        setSettings((current) => data.settings ?? current);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      });
  }, []);

  useEffect(() => { messageEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    attachmentUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
        attachmentUrls.current = attachmentUrls.current.filter((url) => url !== removed.url);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function addFiles(files: FileList | File[]) {
    const candidates = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type.startsWith("audio/"));
    if (!candidates.length) return;
    const room = maxAttachments - attachments.length;
    if (room < candidates.length) setNotice({ bn: `একসঙ্গে সর্বোচ্চ ${maxAttachments}টি ছবি বা অডিও যোগ করা যায়।`, en: `You can add up to ${maxAttachments} images or audio clips at once.` });
    const next = candidates.slice(0, Math.max(0, room)).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    attachmentUrls.current.push(...next.map((attachment) => attachment.url));
    if (next.length) setAttachments((current) => [...current, ...next]);
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  async function recordVoice() {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const active = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      chunks.current = []; stream.current = activeStream; recorder.current = active;
      active.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      active.onstop = () => {
        stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
        if (timer.current) clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: active.mimeType || "audio/webm" });
        if (blob.size > 512) addFiles([new File([blob], `voice-${Date.now()}.webm`, { type: blob.type })]);
        setRecording(false); setRecordedSeconds(0);
      };
      active.start(); setRecordedSeconds(0); setRecording(true);
      timer.current = setInterval(() => setRecordedSeconds((seconds) => seconds + 1), 1000);
    } catch { setNotice({ bn: "মাইক্রোফোন চালু করা যায়নি। একটি অডিও ফাইল বেছে নিন।", en: "The microphone could not be started. Choose an audio file instead." }); }
  }

  async function saveSettings(next: Settings) {
    setSettings(next);
    if (!signedIn) return;
    await fetch("/api/health-assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PREFERENCES", language, ...next }) });
  }

  async function transcribeAudio() {
    const audio = attachments.find((attachment) => attachment.file.type.startsWith("audio/"));
    if (!audio || busy) return;
    setBusy(true); setNotice(null);
    try {
      const body = new FormData(); body.set("language", language); body.set("action", "TRANSCRIBE"); body.append("media", audio.file);
      const response = await fetch("/api/health-assistant", { method: "POST", body });
      const data = await response.json();
      if (!response.ok || typeof data.transcript !== "string" || data.transcript.length < 1) throw new Error();
      setQuestion(data.transcript); removeAttachment(audio.id);
      setNotice({ bn: "কণ্ঠের লেখা যোগ করা হয়েছে। পাঠানোর আগে চাইলে বদলে নিন।", en: "The transcript is in the message box. You can edit it before sending." });
    } catch { setNotice({ bn: "এখন নির্ভরযোগ্যভাবে কণ্ঠের লেখা তৈরি করা যাচ্ছে না। অডিওটি সহায়ক তথ্য হিসেবে পাঠাতে পারেন।", en: "A reliable transcript is not available now. You can still send the audio as supporting context." }); }
    finally { setBusy(false); }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (nextQuestion.length < 3 || busy) return;
    const sentAttachments = attachments;
    setQuestion(""); setAttachments([]); setBusy(true); setNotice(null);
    setMessages((current) => [...current, { role: "USER", content: sentAttachments.length ? `${nextQuestion} [${sentAttachments.length} attachment${sentAttachments.length === 1 ? "" : "s"} added]` : nextQuestion }]);
    try {
      const body = new FormData(); body.set("language", language); body.set("message", nextQuestion);
      sentAttachments.forEach((attachment) => body.append("media", attachment.file));
      const response = await fetch("/api/health-assistant", { method: "POST", body });
      const data = await response.json();
      if (!response.ok || typeof data.answer !== "string") throw new Error();
      setMessages((current) => [...current, { role: "ASSISTANT", content: data.answer, citations: Array.isArray(data.citations) ? data.citations : [] }]);
    } catch { setNotice({ bn: "এখন উত্তর পাওয়া যাচ্ছে না। জরুরি উপসর্গ হলে অ্যাপের জরুরি নির্দেশনা অনুসরণ করুন।", en: "An answer is not available now. Follow the app's urgent guidance for emergency symptoms." }); }
    finally {
      sentAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
      attachmentUrls.current = attachmentUrls.current.filter((url) => !sentAttachments.some((attachment) => attachment.url === url));
      setBusy(false);
    }
  }

  async function clearMemory() {
    if (!signedIn) return;
    await fetch("/api/health-assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CLEAR_MEMORY", language }) });
    setMessages([]); setNotice({ bn: "সংরক্ষিত কথোপকথন মুছে ফেলা হয়েছে।", en: "Saved conversation memory was cleared." });
  }

  return <section className={`assistant-chat assistant-chat-${variant}`} aria-label={language === "bn" ? "স্বাস্থ্য সহায়কের সঙ্গে কথোপকথন" : "Conversation with the health assistant"}>
    <header className="assistant-chat-header"><span className="assistant-avatar"><Icon name="care" /></span><div><strong><BilingualText copy={{ bn: "ফার্স্ট সাইনস সহায়ক", en: "First Signs assistant" }} /></strong><small><BilingualText copy={{ bn: "স্বাস্থ্যশিক্ষা, রোগ নির্ণয় নয়", en: "Health education, not diagnosis" }} /></small></div>{onClose && <button type="button" className="assistant-close" onClick={onClose} aria-label={language === "bn" ? "সহায়ক বন্ধ করুন" : "Close assistant"}>×</button>}</header>
    <div className="assistant-messages" aria-live="polite">
      {!messages.length && <div className="assistant-welcome"><p><BilingualText copy={{ bn: "যক্ষ্মা, কাশি, সেবাকেন্দ্রে যাওয়া বা সাধারণ স্বাস্থ্যশিক্ষা নিয়ে জিজ্ঞাসা করুন। নির্ভরযোগ্য তথ্য না থাকলে আমি সরাসরি তা বলব।", en: "Ask about TB, coughs, getting care, or basic health education. I will say directly when reliable information is not available." }} /></p></div>}
      {messages.map((item, index) => <article key={`${item.role}-${index}`} className={`assistant-message assistant-message-${item.role.toLowerCase()}`}><span className="assistant-message-name"><BilingualText copy={item.role === "USER" ? { bn: "আপনি", en: "You" } : { bn: "সহায়ক", en: "Assistant" }} /></span><p>{item.content}</p>{item.citations?.length ? <div className="assistant-citations">{item.citations.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div> : null}</article>)}
      {busy && <article className="assistant-message assistant-message-assistant assistant-thinking"><span className="assistant-message-name"><BilingualText copy={{ bn: "সহায়ক", en: "Assistant" }} /></span><span /><span /><span /></article>}
      <div ref={messageEnd} />
    </div>
    <form className="assistant-composer" onSubmit={ask}>
      {attachments.length > 0 && <div className="assistant-attachments" aria-label={language === "bn" ? "সংযুক্ত ফাইল" : "Attached files"}>{attachments.map((attachment) => <div className="assistant-attachment" key={attachment.id}>{attachment.file.type.startsWith("image/") ? <img src={attachment.url} alt={attachment.file.name} /> : <span className="assistant-audio-tile"><Icon name="microphone" /></span>}<div><strong>{kindLabel(attachment.file, language)}</strong><small>{attachment.file.name}</small>{attachment.file.type.startsWith("audio/") && <audio controls src={attachment.url} />}</div><button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={language === "bn" ? `${attachment.file.name} সরান` : `Remove ${attachment.file.name}`}>×</button></div>)}</div>}
      {recording && <div className="assistant-recording" role="status"><span className="recording-dot" /><span className="recording-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><BilingualText copy={{ bn: `শোনা হচ্ছে · ${recordedSeconds} সেকেন্ড`, en: `Listening · ${recordedSeconds}s` }} /></div>}
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={600} placeholder={language === "bn" ? "আপনার প্রশ্ন লিখুন…" : "Ask a health question…"} aria-label={language === "bn" ? "আপনার প্রশ্ন" : "Your question"} required />
      <input ref={fileInput} className="assistant-file-input" id={inputId} type="file" accept={acceptedMedia} multiple onChange={chooseFiles} />
      <div className="assistant-composer-actions"><button type="button" className="assistant-tool" onClick={() => fileInput.current?.click()} disabled={busy || attachments.length >= maxAttachments}><Icon name="upload" /><span><BilingualText copy={{ bn: "ফাইল", en: "Attach" }} /></span></button><button type="button" className={`assistant-tool ${recording ? "is-recording" : ""}`} onClick={() => void recordVoice()} disabled={busy}><Icon name={recording ? "stop" : "microphone"} /><span><BilingualText copy={recording ? { bn: "থামান", en: "Stop" } : { bn: "কণ্ঠ", en: "Voice" }} /></span></button>{attachments.some((attachment) => attachment.file.type.startsWith("audio/")) && <button type="button" className="assistant-tool" onClick={() => void transcribeAudio()} disabled={busy || recording}><Icon name="document" /><span><BilingualText copy={{ bn: "লেখায় নিন", en: "To text" }} /></span></button>}<button className="assistant-send" disabled={busy || question.trim().length < 3}><Icon name="arrow" /><span><BilingualText copy={busy ? { bn: "অপেক্ষা করুন", en: "Working" } : { bn: "পাঠান", en: "Send" }} /></span></button></div>
    </form>
    {notice && <p className="assistant-notice" role="status"><BilingualText copy={notice} /></p>}
    {showControls && <section className="assistant-controls"><h2><BilingualText copy={{ bn: "ব্যক্তিগত নিয়ন্ত্রণ", en: "Your controls" }} /></h2>{!signedIn ? <p><BilingualText copy={{ bn: "কথোপকথন সংরক্ষণ করতে এবং নিজের সেবার অগ্রগতি ব্যবহার করতে অ্যাকাউন্টে সাইন ইন করুন।", en: "Sign in to save conversation memory and use your personal care progress." }} /></p> : <><label className="check-row"><input type="checkbox" checked={settings.activityContextEnabled} onChange={(event) => void saveSettings({ ...settings, activityContextEnabled: event.target.checked })} /><BilingualText copy={{ bn: "আমার সেবার অগ্রগতি ব্যবহার করতে দিন", en: "Allow use of my care progress" }} /></label><label className="check-row"><input type="checkbox" checked={settings.memoryEnabled} onChange={(event) => void saveSettings({ ...settings, memoryEnabled: event.target.checked })} /><BilingualText copy={{ bn: "এই কথোপকথন মনে রাখুন", en: "Remember this conversation" }} /></label><button type="button" className="button button-secondary" onClick={() => void clearMemory()}><BilingualText copy={{ bn: "কথোপকথন মুছুন", en: "Clear conversation" }} /></button></>}</section>}
  </section>;
}
