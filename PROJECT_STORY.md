# First Signs: Turning Warning Signs into Verified Care

## Before the platform, there is a person

Maya is a garment worker and a mother in Khulna. She has been coughing for more than two weeks. She also feels feverish and tired, but missing work means losing income.

On her way home, Maya visits a nearby pharmacy. She buys medicine and hopes she will get better. A few days pass, but she is still unwell. The pharmacy was easy to reach, but it could not examine her fully, perform the necessary tests, or confirm what was causing her symptoms. Maya still does not know how serious the warning signs are or where she should go next.

This is where **First Signs** helps.

Maya can open First Signs herself, or a pharmacy worker can help her use the pharmacy-assisted route. She chooses Bangla, reads a clear consent message, selects the respiratory pathway, and answers a short set of questions.

The platform checks her answers using fixed safety rules. Because her cough has lasted at least 14 days, it recommends professional evaluation and clearly explains the urgency. Maya chooses a suitable listed facility and receives a referral ID, private access token, and QR code.

If work prevents her from attending, First Signs asks what got in the way and helps her continue the journey instead of making her start again. When Maya reaches the assigned facility, authorized staff use the referral to record that she arrived and formal evaluation began.

The assisting pharmacy may then receive simulated workflow credit for helping Maya reach care. Public-health staff may see another anonymous respiratory-care signal from the broad area, helping them decide where investigation or support may be useful.

Maya's name, answers, referral token, audio, and exact location are not part of that public-health signal.

Maya's story captures the purpose of First Signs:

> **A warning sign becomes useful when a person can understand it, act on it, and reach appropriate care.**

## The project in one minute

**First Signs is a bilingual, mobile-first care-navigation platform for Bangladesh.** It helps a person move from an early health concern to an appropriate care facility, either independently or with help from a pharmacy.

The platform provides:

- A short safety screening in English or Bangla
- A clear next step based on fixed, versioned rules
- Suitable facility information
- A portable referral with an ID and QR code
- Independent attendance verification at the assigned facility
- Follow-up when a person misses care
- Simulated incentives for eligible pharmacy-assisted journeys
- Privacy-safe, broad-area signals for public-health investigation

The main innovation is not a symptom score. It is the connected journey from concern to care.

## See the prototype

- [Try First Signs](https://first-signs.onrender.com)
- [Start a self-use check](https://first-signs.onrender.com/screen?source=self)
- [Browse the pharmacy-assisted demo directory](https://first-signs.onrender.com/pharmacies)
- [Review the source code and tests](https://github.com/mayer-doa-coder/First-Signs)

The self-use route is the primary experience. Pharmacy assistance is an additional option for people who want help using the same five care pathways.

## Inspiration

We began with one question:

**What happens after a person notices the first warning signs of illness?**

Information alone may not be enough. A person may still be unsure whether the situation is urgent, where to go, how to carry a referral, or what to do after missing an appointment. Limited internet access, fear, transport cost, work pressure, stigma, and low digital confidence can make that gap even wider.

Pharmacies are often one of the easiest places to ask for health-related help. They can offer a familiar location, a shared device, connectivity, and basic assistance. However, a trustworthy system must keep assistance, clinical evaluation, attendance confirmation, and incentives separate.

First Signs was designed around that full handoff. It connects people, pharmacies, care facilities, and public-health teams while giving each participant a clear and limited role.

## The problem we are solving

The care journey often breaks between its separate parts:

| Real-world gap | First Signs response |
| --- | --- |
| A person notices a symptom but cannot judge the next step | A short pathway-specific screening checks warning signs and returns clear care guidance. |
| Advice does not provide a destination | The platform shows a suitable listed facility for the selected concern. |
| A verbal recommendation is easily lost | A portable referral contains a unique ID, private token, QR code, intended facility, and status. |
| A pharmacy helps but there is no accountable handoff | The pharmacy-assisted route records its part of the journey while the assigned facility controls attendance confirmation. |
| Work, distance, fear, stigma, transport, or misunderstanding prevents attendance | Follow-up records the barrier and offers a practical next step. |
| Public-health teams need early visibility without patient records | A separate signal provides grouped, broad-area activity for investigation. |

The result is one traceable, privacy-conscious path from the first concern to formal care.

## What it does

### Five care pathways

First Signs currently supports:

1. Persistent cough or breathing concern
2. Fever or mosquito-borne illness concern
3. Diarrhoea or dehydration concern
4. Skin, sensation, or nerve concern
5. Child cough or difficult breathing

Each pathway has its own questions, danger signs, and outcome logic. The goal is to identify urgency and guide care without guessing which disease caused the symptoms.

### One journey, two ways to begin

A person can start through:

- **Self-use:** The person completes the journey independently.
- **Pharmacy-assisted use:** An assigned pharmacy helps the person complete the same journey.

Both entry routes use the same care rules. The entry context is kept throughout the journey because only a valid pharmacy-assisted case can qualify for simulated pharmacy credit.

### How the journey works

1. **Choose a concern.** The person selects the pathway that best matches the current problem.
2. **Read and accept consent.** The platform explains what information is used and how privacy is protected.
3. **Answer focused questions.** Only information needed for the selected pathway and care navigation is requested.
4. **Receive a care outcome.** Fixed rules return one of three levels: continue with care information, seek professional evaluation, or seek urgent medical evaluation.
5. **Choose a facility.** The platform uses the pathway and broad location to show an appropriate listed care option.
6. **Create a referral.** With the person's agreement, First Signs creates a unique referral ID, a private token, and a QR code.
7. **Reach care.** Authorized staff at the intended facility look up the referral and record attendance.
8. **Continue after a missed visit.** The platform records the barrier and offers a relevant next action.

### The journey at a glance

```text
At home or with pharmacy help
            ↓
Choose one of five health concerns
            ↓
Consent + short, pathway-specific questions
            ↓
Fixed safety outcome and clear next step
            ↓
Listed care facility + optional referral ID and QR code
            ↓
      ┌─────┴─────┐
      ↓           ↓
Attend       Missed visit
      ↓           ↓
Assigned     Identify the barrier and
facility     support another attempt
independently       ↓
records arrival   My Care follow-up
```

### Clear roles

| Participant | What they can do |
| --- | --- |
| Person seeking care | Complete a screening, read guidance, choose a facility, create a referral, and review their own journey. |
| Assisting pharmacy | Help with a linked journey and review its own aggregate workflow activity. |
| Assigned care facility | Look up an intended referral and confirm that the person arrived for formal evaluation. |
| Government or public-health viewer | Review grouped programme indicators and broad-area investigation signals. |
| Optional AI companion | Explain approved health information and navigation steps in plain language. |

### Support beyond the first screening

**My Care** gives signed-in users a private view of their own screening, referral, attendance, follow-up, and reminder status. Anonymous screening remains available.

**Medicine Corner** contains general medicine information, cautions, urgent warning signs, and links to authoritative sources. It does not calculate a personal dose, identify a pill from appearance, prescribe treatment, or tell someone to start or stop a medicine.

**The health companion** explains approved health information and care-navigation steps in English or Bangla. If its approved sources do not support an answer, it directs the person to a qualified professional.

**Telegram access** provides another way to enter the journey while reusing the same central safety logic.

**Experimental cough-audio support** can process an optional recording when the external service is configured. The documented flow does not store raw audio or embeddings, and the main journey continues if audio processing is unavailable.

**Community feedback** collects anonymous information about barriers to care without asking people to disclose whether they have a disease.

## Five boundaries that define First Signs

These safeguards are central to the design, so they are stated once here and applied throughout the implementation.

| Boundary | What it means in practice | Implementation evidence |
| --- | --- | --- |
| **Screening is not diagnosis.** | Outcomes describe the next care action. They do not confirm or rule out TB, dengue, malaria, leprosy, pneumonia, or another condition. | Outcome logic is implemented in [`lib/care-pathways.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/care-pathways.ts) and checked by [`scripts/check-care-pathways.test.mts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-care-pathways.test.mts) and [`scripts/check-safety-rules.test.mts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-safety-rules.test.mts). |
| **AI cannot override fixed safety rules.** | The AI companion explains approved information; it does not set, reduce, or reverse the pathway outcome. | Guardrails are defined in [`lib/ai-companion.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/ai-companion.ts), enforced through [`app/api/health-assistant/route.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/app/api/health-assistant/route.ts), and tested in [`scripts/check-ai-companion.test.mts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-ai-companion.test.mts). |
| **A pharmacy cannot verify its own referral.** | Pharmacy assistance and attendance confirmation belong to different roles. Verification checks the assigned facility and staff scope. | The server workflow is in [`app/api/referrals/verify/route.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/app/api/referrals/verify/route.ts) and [`lib/tb-centre-access.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/tb-centre-access.ts); database protections are exercised in [`supabase/tests/part14_basic_fraud_protection.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/part14_basic_fraud_protection.sql). |
| **Government views exclude identifiable patient information.** | Public-health reporting uses grouped, broad-area data rather than names, raw answers, referral tokens, audio, or exact GPS. | Dashboard shaping is handled by [`app/api/dashboard/route.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/app/api/dashboard/route.ts) and [`lib/government-dashboard.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/government-dashboard.ts); privacy behavior is tested in [`supabase/tests/part13_government_dashboard.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/part13_government_dashboard.sql) and [`supabase/tests/part13_hotspot_map.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/part13_hotspot_map.sql). |
| **Referral completion records attendance, not treatment.** | A completed referral means that the person arrived and formal evaluation began. It says nothing about diagnosis, test result, treatment, or recovery. | The transition is implemented by the verification route and the database workflow in [`supabase/migrations/20260913230323_add_part10_tb_centre_verification.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/migrations/20260913230323_add_part10_tb_centre_verification.sql), with API coverage in [`scripts/check-verification-flow.mjs`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-verification-flow.mjs). |

### Two deliberately separate information paths

```text
Private care journey
person → screening → referral → assigned facility → My Care
              │
              └── private answers, token, and QR stay within the care journey

Privacy-safe public-health signal
broad area + pathway + age band + outcome + time → grouped dashboard
              └── supports investigation and planning, not diagnosis or outbreak confirmation
```

## What makes First Signs different

First Signs is not only a questionnaire, chatbot, map, referral form, pharmacy dashboard, or government dashboard. It connects those parts into one accountable flow:

> **Person → safety guidance → suitable facility → referral → attendance → follow-up**

Alongside that personal journey, carefully limited data can support a second flow:

> **Anonymous grouped activity → public-health investigation and service planning**

Each component closes a specific gap. Bilingual guidance improves understanding. Facility discovery provides a destination. A referral creates a portable handoff. Independent attendance confirmation creates accountability. Follow-up gives a person another chance after a missed visit. Scoped dashboards make activity useful to each role without giving everyone access to the same information.

## How we built it

### General architecture

We separated the platform into three layers:

1. **Safety layer:** versioned care pathways, input validation, urgent-warning precedence, and bilingual outcome content.
2. **Care-navigation layer:** facilities, referrals, QR codes, attendance, follow-up, My Care, role access, and reporting.
3. **Optional support layer:** AI explanations, Telegram messaging, reminders, mapping enhancements, and experimental audio processing.

This separation lets the core care path continue when an optional external service is unavailable. The diagram below shows architectural boundaries, **not** a mandatory execution sequence: optional services can extend the journey, but a referral never has to pass through AI, Telegram, reminders, mapping, or audio processing.

```text
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ Fixed safety layer          │     │ Optional support layer      │
│ questions → versioned rules │     │ AI, messaging, reminders,   │
│ controls the care outcome   │     │ maps, experimental audio    │
└──────────────┬──────────────┘     │ may extend the experience   │
               │                    └──────────────┬──────────────┘
               ↓                                   │
┌─────────────────────────────┐                    │
│ Care-navigation layer       │◀───────────────────┘
│ facilities, referral,       │  optional only
│ attendance, follow-up       │
└─────────────────────────────┘

Optional services can explain or extend the journey.
They do not replace the fixed safety outcome.
```

### Technical architecture

First Signs uses:

- **Next.js 16, React 19, and TypeScript** for the application and shared logic
- **Supabase and PostgreSQL** for authentication, persistence, database functions, role policies, referrals, incentives, and reporting
- **MapLibre** for facility and public-health maps
- **QR generation and scanning** for portable referrals
- **Resend** for optional reminders
- **Telegram Bot API** for optional messaging access
- **Gemini** for bounded conversational support when configured
- **Google HeAR** for optional experimental audio processing

### What happens behind one journey

The interface is deliberately simple, but the server performs several checks:

1. It establishes whether the journey is self-use or linked to a valid pharmacy.
2. It validates consent, the selected pathway, required answers, age band, broad area, and supported values.
3. It runs the versioned TypeScript care rules and produces a language-neutral outcome.
4. It persists the screening through a controlled server and database flow.
5. It separates the private care record from the limited public-health signal.
6. It creates a referral only when requested and keeps the public ID separate from the private token.
7. It restricts attendance confirmation to authorized staff associated with the intended facility.
8. It evaluates follow-up and simulated pharmacy credits separately from the care outcome.
9. It returns role-scoped information to patient, pharmacy, facility, and government dashboards.

### Designed to fail safely

- If the AI service is unavailable, the screening and referral journey can continue.
- If audio processing fails, it does not change the symptom-based outcome.
- If map routing is unavailable, listed facility details can still be shown.
- If a reminder fails, it does not alter referral status.
- Malformed or incomplete answers are rejected instead of being replaced with a reassuring default.
- Retry-sensitive database operations use uniqueness or idempotency controls where duplicate actions could affect referrals or incentives.

## Evidence behind the strongest technical claims

The table below points judges and reviewers to the implementation and verification artifacts behind the main claims.

| Technical claim | Source evidence | Verification evidence |
| --- | --- | --- |
| Five pathway-specific rules engines share a common outcome model. | [`lib/care-pathways.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/care-pathways.ts) | [`scripts/check-care-pathways.test.mts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-care-pathways.test.mts) and [`scripts/check-multisyndrome-browser.mjs`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-multisyndrome-browser.mjs) |
| English and Bangla use one persistent language system and the required fonts. | [`components/language.tsx`](https://github.com/mayer-doa-coder/First-Signs/blob/main/components/language.tsx) and [`app/globals.css`](https://github.com/mayer-doa-coder/First-Signs/blob/main/app/globals.css) | Bilingual pathway coverage in [`scripts/check-multisyndrome-browser.mjs`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-multisyndrome-browser.mjs) |
| Referral numbering is transaction-safe and checked against duplicates. | [`supabase/migrations/20260912192242_use_transactional_referral_counter.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/migrations/20260912192242_use_transactional_referral_counter.sql) | [`supabase/tests/referral_counter_invariants.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/referral_counter_invariants.sql) |
| Simulated pharmacy credits include duplicate and fraud controls. | [`supabase/migrations/20261010092952_add_part14_basic_fraud_protection.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/migrations/20261010092952_add_part14_basic_fraud_protection.sql) | [`supabase/tests/part14_basic_fraud_protection.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/part14_basic_fraud_protection.sql) |
| Messaging channels reuse central security and care logic. | [`lib/channel-security.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/channel-security.ts) and [`lib/messaging-server.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/messaging-server.ts) | [`scripts/check-messaging-channels.test.mts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-messaging-channels.test.mts) |
| Repeated audio can be compared without storing the raw recording in the documented hash flow. | [`lib/audio-hash.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/audio-hash.ts) and [`lib/channel-audio.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/channel-audio.ts) | [`scripts/check-part14-audio-hash.test.mts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/scripts/check-part14-audio-hash.test.mts) |
| Broad-area reporting applies privacy-focused aggregation and map rules. | [`lib/government-dashboard.ts`](https://github.com/mayer-doa-coder/First-Signs/blob/main/lib/government-dashboard.ts) and [`supabase/migrations/20261009093335_add_part13_privacy_safe_area_activity.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/migrations/20261009093335_add_part13_privacy_safe_area_activity.sql) | [`supabase/tests/part13_government_dashboard.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/part13_government_dashboard.sql) and [`supabase/tests/part13_hotspot_map.sql`](https://github.com/mayer-doa-coder/First-Signs/blob/main/supabase/tests/part13_hotspot_map.sql) |

The repository has also been checked with the production build, ESLint, TypeScript, and focused automated tests for care rules, AI claim guardrails, medicine data, audio hashing, and messaging security. Browser-level suites cover the five pathways and both languages; some browser suites use controlled API fixtures, so they demonstrate interface behavior rather than a live external-service guarantee.

## Challenges we ran into

### Explaining urgency without creating fear

Health messages need to encourage action without causing panic. We used short outcomes, plain language, and a visible next step. The wording focuses on what the person should do now instead of guessing the cause.

### Supporting five different concerns safely

Symptoms can overlap across many conditions. We kept each pathway separate, gave urgent danger signs priority, and avoided false precision where symptoms alone cannot distinguish diseases.

### Making English and Bangla equally usable

Translation affects meaning, button length, typography, validation, alerts, and mobile layout. Bilingual content was built into shared components and outcome keys so both interfaces follow the same underlying logic.

### Protecting privacy while keeping data useful

Public-health teams need enough information to notice service gaps, but unnecessary detail can expose a person. We separated private records from limited area signals and built reporting around grouped counts.

### Creating fair incentives

An incentive can help pharmacies support referrals, but it can also encourage duplicates or self-confirmation. We attached credits to validated workflow milestones and added role, uniqueness, and review controls.

### Keeping several channels consistent

The web and messaging experiences should not give different safety answers. Shared server-side rules reduce the risk of each channel developing its own interpretation.

## Accomplishments that we're proud of

We are proud that First Signs demonstrates a connected system rather than a collection of unrelated screens. The prototype brings together:

- Five care-navigation pathways
- Self-use and pharmacy-assisted entry
- English and Bangla interfaces
- Fixed, versioned safety outcomes
- Facility discovery across Bangladesh's eight divisions
- Referral IDs, private tokens, and QR codes
- Role-scoped attendance confirmation
- Missed-referral follow-up
- Patient, pharmacy, facility, government, and administrator views
- Pharmacy-only simulated credits with integrity checks
- Grouped public-health signals
- Medicine information, messaging, AI, reminders, and optional audio support

The most important achievement is the workflow itself: a person can move from uncertainty toward a real care destination, while each participant has enough information to do their job and no single optional feature controls the whole journey.

## What we learned

The biggest lesson was that healthcare access is a journey, not a prediction.

A model or questionnaire has limited value if a person still does not understand the result, know where to go, trust the handoff, or receive help after missing care. We also learned that:

- Clear limits can create more trust than exaggerated capability.
- Bilingual support works best when it begins with the product structure.
- Fixed rules are easier to review and test for safety-critical decisions.
- Incentives need verification and integrity protections from the beginning.
- Useful public-health insight does not require publishing patient histories.
- A missed referral is another opportunity to help, not only a failed statistic.
- Optional technology should improve the journey without becoming a single point of failure.

## What's next for First Signs

First Signs is a functional prototype under active technical validation. Real public deployment would also require independent clinical review, governance, operational partnerships, and field evaluation.

The next steps are to:

- Review all English and Bangla questions, danger signs, and care messages with qualified clinical and public-health professionals
- Test usability with patients, pharmacists, and care-facility staff
- Verify and maintain the national facility directory
- Improve accessibility and low-bandwidth performance
- Test a wider range of shared and low-cost mobile devices
- Measure referral acceptance, attendance, and common barriers
- Strengthen privacy thresholds for real programme reporting
- Pilot incentives only with suitable governance and funding
- Expand approved educational sources and messaging access
- Evaluate acoustic support only with authorized clinical data, transparent performance reporting, calibration, and independent validation

Our long-term vision is simple:

> **No one should be lost between noticing a warning sign and reaching appropriate care.**
