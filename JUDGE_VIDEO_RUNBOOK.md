# First Signs — 5-Minute Judge Video Runbook

**Target duration:** 4 minutes 45 seconds to 4 minutes 55 seconds  
**Format:** 7-slide presentation → live product recording → 2 closing slides  
**Core message:** First Signs turns an early health concern into a clearer, privacy-conscious route to appropriate care. It is a care-navigation and screening prototype, **not a diagnostic tool**.

## Timing at a glance

| Time | Visual | Goal |
| --- | --- | --- |
| 0:00–0:28 | Slide 1 | Start with Maya’s story and the human need. |
| 0:28–0:53 | Slide 2 | State the real-world gap. |
| 0:53–1:18 | Slide 3 | Introduce First Signs and its value. |
| 1:18–1:42 | Slide 4 | Explain the end-to-end journey in non-technical language. |
| 1:42–2:05 | Slide 5 | Show how the system is built and kept safe. |
| 2:05–3:43 | Screen recording | Prove the workflow in the product. |
| 3:43–4:08 | Slide 6 | Explain what makes it different. |
| 4:08–4:33 | Slide 7 | Show responsible next steps. |
| 4:33–4:50 | Slide 7 / end card | Close with the vision and live link. |

Leave the remaining few seconds as a safety buffer. Speak calmly; do not try to cover every feature in detail.

## Before recording

1. Use a 16:9 canvas and record at 1080p if possible.
2. Increase browser zoom to 110–125% so text is readable in the final video.
3. Use a clean browser profile. Disable notifications, bookmarks bar, extensions, and password prompts.
4. Pre-open these tabs in this order: landing page, screening start, a prepared outcome/referral state, My Care, verification, pharmacy view, admin programme overview, admin review signals, and the broad-area activity map. Sign in beforehand where required.
5. If the live database is not configured or is slow, use the project’s controlled demo/test state. Never fabricate a successful referral, attendance confirmation, or dashboard signal.
6. Prepare one safe sample journey: **persistent cough for 14+ days**, with no emergency claim. Say “seek professional evaluation”; do not say that the person “has TB.”
7. Keep the cursor deliberate: one click, a short pause, then the next click. Avoid typing long answers on camera.

## Presentation and narration plan

The lines below are a recording-ready draft. When the final slide deck is available, replace them with a slide-matched final speech script.

### Slide 1 — From a warning sign to care (0:00–0:28)

**Show:** Title, a simple person-to-care visual, and the First Signs name.

**Say:**

> Meet Maya, a garment worker and mother in Khulna. She has had a cough for more than two weeks, but missing work means losing income. A nearby pharmacy is easy to reach, yet it cannot fully examine her, test her, or tell her where to go next. This is the moment First Signs is designed for: turning an early warning sign into a practical path to appropriate care.

### Slide 2 — The real-world problem (0:28–0:53)

**Show:** Four short gaps: uncertainty, no destination, lost referrals, and missed visits. Add privacy as a small fifth point.

**Say:**

> The problem is not only health information. People can be lost at every handoff: they may not know how urgent a concern is, where to go, how to keep a referral, or what to do after missing a visit because of work, cost, distance, or fear. At the same time, public-health teams need useful signals without seeing people’s private health records.

### Slide 3 — Our solution (0:53–1:18)

**Show:** “First Signs: bilingual, mobile-first care navigation for Bangladesh,” with five pathways and the two entry points: self-use and pharmacy-assisted.

**Say:**

> First Signs is a bilingual, mobile-first care-navigation platform for Bangladesh. A person can use it independently or with help from a participating pharmacy. It supports five concern pathways: respiratory, fever, diarrhoea or dehydration, skin or nerve concerns, and child breathing. It uses fixed safety rules to give a clear next step, then helps the person find a facility, create a private referral, and continue the journey.

### Slide 4 — How it works, in plain language (1:18–1:42)

**Show:** A six-step arrow: choose concern → consent and questions → clear guidance → facility → referral QR → attendance or follow-up. Put “not a diagnosis” beneath the guidance step.

**Say:**

> The journey is simple. Choose the concern, answer focused questions after consent, receive clear care guidance, select a suitable listed facility, and optionally create a referral with an ID and QR code. The intended facility independently records attendance. If the person misses a visit, First Signs asks what got in the way and helps them take the next step. It guides care; it never diagnoses disease.

### Slide 5 — Safe and dependable by design (1:42–2:05)

**Show:** A simplified architecture with client → Next.js safety and care-navigation layer → Supabase, plus optional services at the edge. Highlight four safeguards: fixed rules, role separation, privacy-safe aggregation, optional services cannot override care outcome.

**Say:**

> Behind this simple experience is a deliberately separated system. Next.js and TypeScript run the interface and fixed care rules. Supabase and PostgreSQL securely manage records, referrals, roles, and scoped reporting. Optional AI, audio, maps, reminders, and Telegram can extend access, but none can change the safety outcome. Private care records stay separate from grouped, broad-area public-health investigation signals.

## Screen-recording walkthrough (2:05–3:43)

Record this as one smooth story. It is better to show a complete journey than to open every page.

| Time | What to show | What to say |
| --- | --- | --- |
| 2:05–2:15 | Landing page. Briefly switch English ↔ Bangla, then select self-use. | “The journey begins in English or Bangla, and a person can start independently or receive pharmacy assistance.” |
| 2:15–2:31 | Screening introduction, consent, and concern selection. Select the respiratory pathway. | “Before screening, First Signs explains consent and its limits. Maya selects a persistent respiratory concern.” |
| 2:31–2:48 | Focused questions. Use prepared answers, including cough for 14+ days. | “The questions are pathway-specific. They identify warning signs and urgency; they do not attempt to name a disease.” |
| 2:48–3:01 | Guidance outcome. Pause long enough for the judge to read it. | “Here, the fixed rules recommend professional evaluation. This is clear action guidance, not a TB diagnosis or a prescription.” |
| 3:01–3:13 | Facility choice, then referral ID / private token / QR ticket. | “Maya can choose an appropriate listed facility and carry the handoff as a referral ID and QR code.” |
| 3:13–3:24 | My Care. Open the missed-visit barrier / next-action section if available. | “My Care keeps the private journey accessible. If work, cost, transport, or fear prevents a visit, the journey continues instead of ending.” |
| 3:24–3:33 | Verification workspace with a pre-prepared referral. | “Only authorized staff at the intended facility can record attendance. The assisting pharmacy cannot confirm its own referral.” |
| 3:33–3:43 | Show the pharmacy workspace, then the admin programme overview, review signals, and broad-area activity map. | “Pharmacies see only their eligible workflow activity. The admin panel gives authorized programme teams a privacy-safe overview of aggregate screenings, referrals, completion patterns, and operational review signals. Broad-area activity is an investigation prompt for planning—not personal data or a confirmed outbreak.” |

### Demo wording to keep exact

- Say **“screening and care navigation”**, not “diagnosis.”
- Say **“professional evaluation”** or **“urgent medical evaluation”**, not “you have TB/dengue/malaria/pneumonia.”
- Say **“attendance was recorded”**, not “treatment was completed.”
- Say **“investigation signal”**, not “outbreak” or “hotspot confirmed.”
- Say **“simulated pharmacy workflow credit”**, not payment or clinical reward.

## Closing slides

### Slide 6 — Why First Signs is different (3:43–4:08)

**Show:** A comparison: standalone symptom checker / chatbot / directory / referral form on one side, and the connected First Signs journey on the other.

**Say:**

> Most solutions stop at one point: a symptom checker gives information, a map gives a location, or a chatbot gives an answer. First Signs connects the full, accountable journey: warning sign, clear next step, suitable facility, private referral, independent attendance verification, and follow-up. It also protects trust through bilingual access, fixed rules, separated roles, and privacy-safe reporting.

### Slide 7 — Responsible path forward and ending (4:08–4:50)

**Show:** Next steps: clinical and Bangla-language review, usability pilots, verified facility data, low-bandwidth access, governed partnership pilots, and evaluation. End with the project statement and repository/live-demo QR or URL.

**Say:**

> First Signs is a functional prototype, not a replacement for healthcare professionals. Before real deployment, we will conduct independent clinical and language review, usability testing with patients and care teams, facility-data verification, accessibility and low-bandwidth improvements, and carefully governed pilots. Our vision is simple: no one should be lost between noticing a warning sign and reaching appropriate care. Thank you.

## Editing notes

- Use a clean cut from Slide 5 to the browser. Add a small title card, “See the journey,” only if it takes less than one second.
- Keep background music quiet or omit it; speech and readable UI should lead.
- Add captions, especially for the care-boundary statements.
- Do not display real names, phone numbers, tokens, secrets, or patient records. Use only demo/sample data.
- Keep the final frame on the project name, live prototype URL, and repository URL for 2–3 seconds.
