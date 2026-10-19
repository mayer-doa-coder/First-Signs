# Prompt for Claude — Create the First Signs Judge Presentation

Copy everything inside the following prompt into Claude. Attach the listed screenshots from `docs/images/` when prompted. Claude should create an editable **PowerPoint (.pptx)** deck, not a PDF or an outline.

---

## Claude prompt

You are an expert pitch-deck designer for a health-tech hackathon. Create an **editable 16:9 PowerPoint presentation (.pptx)** called `First_Signs_Judge_Presentation.pptx`.

This deck will be used in a recorded judge video and must be readable without narration. It is **seven slides exactly**, with a polished, calm, trustworthy, mobile-health visual style. The presentation should take about 2 minutes 5 seconds before a live-product demo and 45 seconds after it, within a five-minute total video.

### Non-negotiable content and safety rules

- Project name: **First Signs**
- Tagline: **Turning warning signs into completed care**
- Context: a bilingual, mobile-first care-navigation prototype for Bangladesh.
- First Signs provides screening and care navigation; it **does not diagnose disease, prescribe treatment, or replace a qualified healthcare professional**.
- Do not state or imply that a person “has TB,” “has dengue,” “has malaria,” “has leprosy,” or “has pneumonia.” Use phrases such as “seek professional evaluation” and “clear next step.”
- Do not call public-health data an outbreak or confirmed hotspot. Call it a **grouped, broad-area investigation signal**.
- Do not claim real pharmacy payment. The prototype has **simulated pharmacy workflow credits** for eligible pharmacy-assisted journeys.
- A referral completion means **attendance and formal evaluation began**, not diagnosis, treatment, or recovery.
- Do not include fabricated metrics, market size, patient counts, accuracy scores, partnerships, clinical validation, or success rates.
- Keep the language concise, plain, and understandable to both technical and non-technical judges.

### Visual direction

- Use restrained healthcare claymorphism: pale blue background surfaces, white rounded cards, dark high-contrast text, black or very dark pill buttons, muted teal accents, generous whitespace, soft shadows, and modern friendly illustration shapes.
- Typography: choose highly readable serif-like heading styling and clean supporting text. Use a Bengali-safe font only if displaying Bangla. Do not overcrowd slides.
- Use one key visual per slide. Maximum 30–35 words of body copy per slide, excluding labels in diagrams.
- Use simple line icons for person, pharmacy, facility, QR referral, shield/privacy, and dashboard. Avoid generic stock photos of doctors.
- Add subtle, editable entrance animations only if they do not affect readability. The deck must look complete without animations.
- Use a small footer on slides 2–7: `First Signs • Hackathon Prototype`.
- Use slide numbers in the lower right.

### Available project screenshots to use

Use only where they strengthen the story. Crop them cleanly inside rounded device/browser frames. Do not use more than two screenshots on a slide.

1. `docs/images/first-signs-landing-overview.png` — landing page
2. `docs/images/first-signs-screening-introduction.png` — screening explanation
3. `docs/images/first-signs-pathway-questionnaire.png` — pathway questions
4. `docs/images/first-signs-urgent-guidance.png` — care guidance state
5. `docs/images/first-signs-my-care-access.png` — My Care access
6. `docs/images/first-signs-pharmacy-assisted-screening.png` — pharmacy-assisted route
7. `docs/images/screening page.png` — screening page
8. `docs/images/telegram bot.png` — optional Telegram access
9. `docs/images/Community.png` — anonymous community feedback
10. `docs/images/admin page 1.png`, `admin page 2.png`, `admin page 3.png` — operational/admin views

### Required slide plan

#### Slide 1 — Title and human story (0:00–0:28)

**Title:** `From a warning sign to appropriate care`

**Subtitle:** `First Signs — bilingual care navigation for Bangladesh`

**Story card:** `Maya has been coughing for more than two weeks. Missing work costs income. A pharmacy is close—but it cannot fully examine her or show her the next step.`

**Visual:** a simple illustrated journey from Maya / phone / pharmacy toward a care facility. Use a human-centered visual; no alarming imagery. Place the First Signs name and tagline clearly.

#### Slide 2 — The gap is between concern and care (0:28–0:53)

**Title:** `People can be lost at every handoff`

Create a 2×2 grid of concise cards:

- `Uncertainty — Is this urgent?`
- `No destination — Where should I go?`
- `Lost handoff — How do I carry a referral?`
- `Missed visit — What happens after work, cost, distance, or fear gets in the way?`

Add a small footer sentence: `Public-health teams also need useful signals without private patient records.`

**Visual:** a broken or dotted care journey line crossing these four cards.

#### Slide 3 — The First Signs solution (0:53–1:18)

**Title:** `One connected journey, two ways to begin`

**Central statement:** `Self-use or pharmacy-assisted care navigation in English and Bangla.`

Show five compact pathway chips/icons:

- `Respiratory concern`
- `Fever concern`
- `Diarrhoea / dehydration`
- `Skin / nerve concern`
- `Child breathing concern`

Show two entry points joining one central workflow: `Self-use` and `Pharmacy-assisted`.

Use a small phone screenshot of the landing or screening interface at the right. Include a small, visible label: `Screening ≠ diagnosis`.

#### Slide 4 — How the journey works (1:18–1:42)

**Title:** `From concern to completed handoff`

Create a clear six-step horizontal flow with friendly icons:

1. `Choose a concern`
2. `Consent + focused questions`
3. `Clear guidance` (small label: `not a diagnosis`)
4. `Choose a listed facility`
5. `Referral ID + private token + QR`
6. `Attendance recorded or follow-up support`

Under the flow, place this exact short line: `If a visit is missed, First Signs identifies the barrier and supports the next attempt.`

No technical terms on this slide.

#### Slide 5 — Built to be safe, private, and resilient (1:42–2:05)

**Title:** `Simple for people. Deliberate underneath.`

Create an easy-to-read architecture diagram with these elements:

- Left: `People` — Web / Mobile / Telegram
- Center: `First Signs • Next.js + React + TypeScript`
- Within the center: two clearly separated blocks: `Fixed safety rules` and `Care navigation: facilities, referrals, follow-up`
- Bottom: `Supabase + PostgreSQL` with labels `role-based access`, `private care records`, and `scoped reporting`
- Right, visually marked optional: `Maps`, `AI explanations`, `reminders`, `experimental audio`

Add four tiny safety badges beneath the diagram:

- `Fixed rules decide care guidance`
- `AI cannot override outcomes`
- `Pharmacy and facility roles are separate`
- `Public-health view uses grouped broad-area signals`

Use only the names of technology that are true: Next.js 16, React 19, TypeScript, Supabase, PostgreSQL, MapLibre, QR tooling, Resend, Telegram Bot API, Gemini, and optional Google HeAR.

This slide will be immediately followed by a live demo. Add a small bottom-right cue: `Next: see the journey live →`.

#### Slide 6 — Why First Signs is different (3:43–4:08)

**Title:** `Not another standalone health tool`

Create a comparison with two columns.

Left column title: `Standalone tools often stop at…`

- `Information`
- `A chatbot answer`
- `A map pin`
- `A referral form`

Right column title: `First Signs connects…`

- `Warning sign → clear next step`
- `Facility → portable QR referral`
- `Referral → independent attendance confirmation`
- `Missed visit → practical follow-up`

Place a bottom bar with these short differentiators: `Bilingual access • Fixed safety rules • Role separation • Privacy-safe reporting`.

Use a linked-chain or continuous-path visual, rather than a generic checkmark table.

#### Slide 7 — Responsible next steps and ending (4:08–4:50)

**Title:** `A responsible path from prototype to impact`

Show a short forward roadmap in three stages:

1. `Validate — independent clinical and Bangla-language review; usability studies`
2. `Strengthen — verified facility data; accessibility; low-bandwidth performance`
3. `Pilot responsibly — governed operational partnerships; outcome and privacy evaluation`

End with a large closing statement:

> `No one should be lost between noticing a warning sign and reaching appropriate care.`

Include a small, clearly separated disclaimer: `Functional hackathon prototype — not clinical deployment.`

Leave a clear lower-right placeholder that can later contain the live-demo URL and repository QR code. Do not invent a QR code; use a labelled editable placeholder: `[Add live demo / repository QR]`.

### Deliverables

1. Return the finished editable `.pptx` file.
2. Use editable text, shapes, connectors, and icon elements wherever possible—do not flatten the slides into screenshots.
3. Add presenter notes to each slide containing the target time range from the required slide plan and a one-sentence delivery reminder.
4. Before returning the file, confirm there are exactly seven slides, all safety rules above are respected, and no unverified statistics or claims have been added.

---

## What to give Claude

1. This entire file.
2. The screenshots listed above, especially the landing, questionnaire, guidance, pharmacy-assisted, and admin/dashboard images.
3. If Claude can access the repository, also provide `PROJECT_STORY.md` and `README.md` as factual references. They must not override the safety rules in this brief.

## After Claude returns the deck

Share the `.pptx`, exported PDF, or slide screenshots here. I will then write the final, slide-by-slide spoken script precisely matched to the finished presentation and the five-minute timing.
