"use client";

import { BilingualText } from "@/components/language";
import { PageShell } from "@/components/ui";
import { AssistantChat } from "@/components/assistant-chat";

export function HealthAssistant() {
  return (
    <PageShell
      eyebrow={{ bn: "দৈনিক সহায়ক", en: "Daily companion" }}
      title={{ bn: "যক্ষ্মা ও স্বাস্থ্য সহায়ক", en: "TB and health companion" }}
      description={{ bn: "যক্ষ্মা, সেবার পথ এবং সাধারণ স্বাস্থ্যশিক্ষা সম্পর্কে জিজ্ঞাসা করুন। এটি রোগ নির্ণয় বা প্রেসক্রিপশন দেয় না।", en: "Ask about TB, care navigation, and basic health education. It does not diagnose or prescribe." }}
      icon="care"
    >
      <p className="assistant-page-safety"><BilingualText copy={{ bn: "জরুরি উপসর্গ, ব্যক্তিগত ওষুধের মাত্রা, বা চিকিৎসা পরিবর্তনের জন্য চিকিৎসক বা ফার্মাসিস্টের সঙ্গে কথা বলুন।", en: "For urgent symptoms, personal medicine doses, or treatment changes, speak with a clinician or pharmacist." }} /></p>
      <AssistantChat variant="page" showControls />
    </PageShell>
  );
}
