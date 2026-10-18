# First Signs — Updated Implementation Guide

This guide is a practical implementation checklist for the hackathon prototype.

You do **not** have to follow every step rigidly. Use the steps as a guide, move back and forth when needed, and correct things as you build.

A good general direction is to make the main care journey work first, then add optional integrations and polish.

## Server configuration diagnostics

Run `npm run check:config` before starting the app or deploying it. It prints only configuration names and states; it never prints keys, PINs, tokens, or URLs containing secrets.

- Required core persistence: `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
- Recommended for stable QR links: `NEXT_PUBLIC_APP_URL` (or server-only `APP_URL`) with the final public HTTPS origin.
- Feature-specific: `TB_CENTRE_STAFF_PIN` enables demo centre verification; `GEMINI_API_KEY` enables AI explanations; both `HEAR_SERVICE_URL` and `HEAR_SERVICE_TOKEN` enable real acoustic processing.
- Telegram messaging is disabled until its variables and a public HTTPS callback URL are configured.

Copy `.env.example` to `.env.local` for local development, replace placeholders, and restart Next.js after every environment-variable change. Keep `.env.local` out of Git. In hosted environments, add the same server-only values through the host's secret/configuration panel, then rebuild if `NEXT_PUBLIC_APP_URL` changes because Next.js embeds `NEXT_PUBLIC_` values into the browser bundle at build time.

## Language foundation — required from the start

- Implement all user-facing copy in English and Bangla from the first version. English is the default; Bangla is always available through the persistent language toggle.
- Keep safety outcome codes language-neutral and render equivalent safety meaning in both languages.

## Optional accounts and role workspaces

- Keep screening available without sign-in. Offer passwordless email access when a person wants to save their own My Care journey.
- Use invite-only memberships for pharmacy, TB-centre, government, and platform-admin workspaces; a public sign-up never selects a staff role.
- A patient may see only their own care journey. Pharmacy and government views must never show patient identity, symptoms, audio, or referral tokens.
- Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser authentication only. Keep Supabase secret keys and `RESEND_API_KEY` server-only.
- Configure Supabase Auth with the deployed `/auth/callback` URL and Resend SMTP before sending passwordless links or invitations. Schedule a server-side POST to `/api/reminders/send` with `x-reminder-cron-secret`; it sends only the generic First Signs reminder text.

## Typography foundation — required from the start

- Use only **Noto Sans Bengali** for Bangla and **Merriweather** for English; do not add another font family without approval.
- Apply these fonts globally, including all UI states and controlled map labels; mixed-language content uses the correct font per language.
- Do not use light weights for important health information.

## Visual and motion foundation — required from the start

Use the observable component system verified on `https://letters.app/` and `https://www.awwwards.com/sites/letters#elements`: pale-blue rounded shells, white navigation, oversized centered hero copy, black pill actions, white pill controls, soft-gray bento cards, compact labels, generous whitespace, and restrained floating/reveal motion. Recreate these patterns with project-owned HTML/CSS; do not copy Letters branding, proprietary source, product copy, or unavailable assets. Apply the patterns consistently to every route and state, with a complete mobile composition and a `prefers-reduced-motion` fallback. Keep Merriweather and Noto Sans Bengali unchanged.

Use healthcare-specific 21st.dev and Framer patterns for clinical trust/status cards, safety reassurance, care pathways, facility discovery, and readable health metrics. Adapt only the component structure and interaction pattern; retain First Signs content, tokens, and fonts, and do not introduce fictional clinicians, appointments, testimonials, or claims. Use the public `motion` package for spring-smoothed route transitions and scroll feedback. Every animation must honor the operating-system reduced-motion preference and must never delay an urgent action or hide safety-critical information.

The product supports two ways to enter:

1. **Self-use:** a person can use First Signs from home or anywhere using their own phone.
2. **Pharmacy-assisted use:** a pharmacy can help a person who does not have a suitable phone, internet access, or needs help.

Both paths use the same screening, care-navigation, referral, and follow-up system.

---

# Part 1 — Start the Project

## Step 1 — Create one project

Create:

`first-signs`

Recommended simple setup:

- Next.js — website
- Supabase — database
- Vercel — hosting

Keep the setup simple. One main project is enough for the prototype.

## Step 2 — Create the main pages

Create these pages first:

1. `/` — main landing page
2. `/screen` — screening and health-navigation flow
3. `/care` — user's current status and follow-up companion
4. `/referral` — referral result
5. `/verify` — TB centre attendance verification
6. `/pharmacy` — pharmacy dashboard
7. `/dashboard` — government / public-health dashboard
8. `/community` — public launch and feedback page

It is useful to make sure every page opens before adding deeper logic.

---

# Part 2 — Build the Two Entry Paths

## Step 3 — Build the landing page

The landing page should clearly show:

- what First Signs does,
- that it is not a TB diagnosis tool,
- that formal TB testing is required when recommended.

Add two entry choices:

### Option A

`Check From Home`

This opens:

`/screen?source=self`

### Option B

`Pharmacy-Assisted Check`

This is mainly entered through a pharmacy QR code.

## Step 4 — Create pharmacy-specific QR links

Each demo pharmacy gets its own link.

Example:

`/screen?source=pharmacy&pharmacy=PHARMACY_001`

Create a QR code from this link.

When scanned, the system knows:

- the screening is pharmacy-assisted,
- which pharmacy helped the person.

## Step 5 — Support people without their own phone

For the prototype, the pharmacy can open the screening page on its own phone, tablet, or computer.

The person should still:

- see the consent message,
- answer the screening questions,
- control whether a referral is created.

The assisted path should also work for a person who does not own a smartphone.

---

# Part 3 — Create the Database

## Step 6 — Create a Supabase project

Open:

https://supabase.com/

Create one free project.

Use the table editor.

## Step 7 — Create `patients`

Store:

- `patient_id`
- `phone_or_demo_id`
- `consent_status`
- `created_at`

For a person without a phone, create a temporary demo ID.

Example:

`PAT-DEMO-0042`

## Step 8 — Create `pharmacies`

Store:

- `pharmacy_id`
- `name`
- `area`
- `active`
- `integrity_score`

## Step 9 — Create `tb_centers`

Store:

- `center_id`
- `name`
- `district`
- `area`
- `latitude`
- `longitude`
- `service_type`

## Step 10 — Create `screenings`

Store:

- `screening_id`
- `patient_id`
- `source_type`
- `pharmacy_id`
- `area_name`
- `area_latitude`
- `area_longitude`
- `symptom_answers`
- `audio_status`
- `screening_result`
- `created_at`

Use:

`source_type = SELF`

or:

`source_type = PHARMACY`

If the user came from home:

`pharmacy_id = empty`

If the user came through a pharmacy:

save the pharmacy ID.

Persist every consented, completed screening independently of the referral decision. A person who declines a referral, or whose fixed-rule result does not recommend one, must still count as a completed screening without creating a referral. Make this write idempotent by `screening_id`.

## Step 11 — Do not store exact home locations

For screening and the government map, store only a coarse Bangladesh division for new records.

Example:

- Dhaka
- Chattogram
- Rajshahi
- Khulna
- Barishal
- Sylhet
- Rangpur
- Mymensingh

Use only a broad division on the government dashboard, not an individual's exact house or GPS point. Keep the five earlier Khulna demo-area values readable only for existing seeded and persisted records.

## Step 12 — Create `referrals`

Store:

- `referral_id`
- `screening_id`
- `patient_id`
- `pharmacy_id`
- `tb_center_id`
- `status`
- `created_at`
- `completed_at`

Possible status:

- `PENDING`
- `FOLLOW_UP`
- `COMPLETED`
- `CLOSED`

## Step 13 — Create `rewards`

Store:

- `reward_id`
- `pharmacy_id`
- `screening_id` when the credit is for a valid assisted screening
- `referral_id`
- `reward_type`
- `amount`
- `status`
- `created_at`

Possible reward status:

- `PENDING`
- `CONFIRMED`
- `HELD_FOR_REVIEW`

A self-use patient should not create a pharmacy reward.

## Step 14 — Create `followups`

Store:

- `patient_id`
- `referral_id`
- `followup_status`
- `barrier`
- `next_action`
- `created_at`

---

# Part 4 — Add Real TB Centre Demo Data

## Step 15 — Add a small number of real TB centres

Use Bangladesh NTP data:

https://www.ntp.gov.bd/laboratory/

For the nationwide prototype, retain the 15 verified Khulna centres and add verified government TB-evaluation referral facilities so all eight Bangladesh divisions have coverage. Keep the facility source and coordinates documented, show the available service type only when verified, and advise users to confirm current availability before travel.

Store:

- real centre name,
- real area,
- real service type,
- map position.

Cover all eight Bangladesh divisions from the first nationwide finder release.

## Step 16 — Add 10 demo pharmacies

Example:

- Rahman Pharmacy
- City Pharmacy
- Shapla Pharmacy

These are demo records only.

---

# Part 5 — Build the Common Screening Flow

## Step 17 — Build consent

At `/screen`, show:

- this is screening and care navigation,
- this is not TB diagnosis,
- the person can stop at any time.

Add:

`I Agree and Continue`

Do not continue until consent is accepted.

## Step 18 — Show how the user entered

Do not make this confusing.

For self-use:

`You are checking from your own device.`

For pharmacy-assisted use:

`This screening is being assisted by Rahman Pharmacy.`

The medical flow stays the same.

## Step 19 — Ask the symptom questions

Keep them short.

For the prototype, collect:

- cough duration,
- fever,
- night sweats,
- unexplained weight loss,
- blood in sputum,
- known TB exposure.

Keep the questions limited to what is useful for this prototype.

## Step 20 — Ask for area

Ask the user to select one of Bangladesh's eight broad divisions. Do not request or store an exact home address or patient GPS point.

Example:

`Which area are you currently in?`

Use this for:

1. finding a nearby TB centre,
2. anonymous hotspot calculations.

Do not require exact GPS.

## Step 21 — Create fixed safety rules

Create one simple rule function.

It returns only:

- `CONTINUE_SCREENING`
- `FORMAL_TB_EVALUATION_RECOMMENDED`
- `URGENT_MEDICAL_EVALUATION`

Keep the rules in one visible file.

Keep safety rules outside the AI prompt so they stay easy to inspect and explain.

Implement the inputs, outcome precedence, bilingual patient-facing meaning, limitations, and governance requirements exactly as specified in `PRD.md` section 14. Do not duplicate or independently reinterpret the clinical thresholds here.

---

# Part 6 — Add Cough Recording

## Step 22 — Add cough recording or upload

Let the person:

- record cough audio in the browser,
- or upload an audio file.

Show:

`Checking audio quality...`

For the browser prototype:

- keep the selected recording local to the current browser session,
- preserve the browser/file audio blob without transcoding,
- request mono capture and automatic gain control when the browser supports them,
- show a live input-level indicator so the person can move closer when the signal is too quiet,
- show a clear microphone-live state and tell the person not to cough while browser permission is still pending,
- treat direct browser recording as available only when `window.isSecureContext`, `getUserMedia`, and `MediaRecorder` are available; mobile LAN links using plain HTTP cannot request microphone access,
- use trusted HTTPS for deployed patient/pharmacy links and physical-phone QR testing; `localhost` is a development-only secure-context exception,
- handle blocked permission, missing or busy microphones, insecure HTTP origins, and unanswered permission prompts with actionable bilingual guidance; do not imply that changing permission can make an HTTP LAN link secure,
- never leave the interface indefinitely in a microphone-request state: provide an immediate cancel action and automatically recover after 10 seconds,
- provide an in-flow native device-recorder fallback using a file input with `accept="audio/*"` and `capture="user"`; make it the primary action when direct browser capture is unavailable,
- keep recording available when a browser can capture audio but cannot display the live analyser,
- provide playback and a clear retry action; drive the playback time and progress indicator from the decoded audio duration instead of unreliable MediaRecorder container metadata,
- reject non-audio, undecodable, silent, or extremely quiet input,
- allow the optional audio step to be skipped,
- release the microphone and discard the local audio when the step or shared-device session is cleared.

Do not promise a fixed recording distance. Microphone pickup depends on the device, browser, room, and background noise. The local quality check is a basic technical audibility check, not cough detection or clinical validation.

Mobile voice recording has not yet been tested on a physical mobile device.

## Step 23 — Use a clear prototype result first

Before adding a real model, return a demo result such as:

- audio usable: yes
- cough detected: yes
- experimental acoustic signal: moderate

Label it:

**Prototype acoustic result**

The prototype values must be visibly marked as fixed demonstration output. They must not be presented as the result of a real cough model and must not change the fixed Step 21 safety outcome. Do not display a made-up TB percentage.

## Step 24 — Keep the cough result secondary

Do not write:

`You have an 87% chance of TB.`

Write:

`Your screening suggests that formal TB evaluation is recommended.`

The cough signal can support the screening.

It cannot diagnose TB.

---

# Part 7 — Build the User Companion

## Step 25 — Build `/care`

This page is the person's simple health-navigation companion.

Show:

- current screening status,
- current recommendation,
- referral status,
- nearest selected TB centre,
- next action,
- follow-up message if needed.

## Step 26 — Make it work for both entry paths

Self-use person:

`My Care`

Pharmacy-assisted person:

the same care information should be available during the pharmacy session.

If the person has a phone number, they can later reopen their care status.

For the prototype, a demo patient ID is enough.

`/care` must refresh screening, referral, completion, and follow-up state from the persisted backend record. Browser storage may keep the current device session and optional phone lookup, but it must not be the authoritative source for care status.

## Step 27 — Add simple check-up support

After screening, show only useful actions.

Examples:

- `Continue to referral`
- `View TB centre`
- `Check referral status`
- `I could not attend`
- `Ask what to do next`

Keep this focused on TB screening and care navigation rather than expanding into a large general-health app.

The prototype remains focused on TB screening and care navigation.

---

# Part 8 — Build TB Centre Finding

## Step 28 — Find a nearby centre

Use the user's selected area.

Show the nearest suitable TB centre from the `tb_centers` table.

## Step 29 — Add a map

Use MapLibre:

https://maplibre.org/maplibre-gl-js/docs/

Show:

- user's broad area,
- recommended TB centre,
- centre name,
- service type.

Avoid showing the person's exact house.

---

# Part 9 — Create the Referral

## Step 30 — Create the referral

When the person accepts:

1. create a referral record,
2. generate a unique referral code,
3. create a QR code,
4. set status to `PENDING`.

Example:

`JVH-KHU-00124`

Use a private transactional counter row rather than a PostgreSQL sequence for
the human-readable referral number. Allocate the number inside the same short
database transaction that creates the referral. Lock the counter row through
an atomic `UPDATE ... RETURNING`, check for an existing `screening_id` before
allocation, and keep a unique constraint on `referral_id`. This ensures that:

- the first committed prototype referral is `JVH-KHU-00001`,
- concurrent requests cannot receive the same number,
- failed or rolled-back attempts do not consume a number,
- retries for one screening return its existing referral,
- values above `99999` are not truncated.

Committed referral IDs must not be renumbered. Deleting a committed referral
will naturally leave a gap and should not occur in the normal care workflow.

## Step 31 — Show `/referral`

Show:

- centre name,
- centre location,
- service type,
- referral ID,
- QR code,
- current status.

## Step 32 — Apply pharmacy reward logic correctly

If:

`source_type = PHARMACY`

create the small pharmacy screening/referral credit.

If:

`source_type = SELF`

do not create a pharmacy reward.

The health outcome must be identical for both entry paths.

---

# Part 10 — Build TB Centre Verification

## Step 33 — Build `/verify`

This page represents the TB centre.

Allow demo staff to:

- enter referral ID,
- or scan referral QR.

Show:

- whether referral exists,
- whether it was already used,
- intended TB centre.

For the prototype, support live camera scanning on secure HTTPS pages and QR-image selection as a fallback. A scanned referral QR must be parsed locally, and only its opaque referral token may be sent to the verification API. Manual lookup uses the referral ID. Neither response may expose patient identity, phone, symptoms, or audio.

## Step 34 — Confirm formal evaluation

Add:

`Confirm Formal Evaluation Started`

When pressed:

1. set referral to `COMPLETED`,
2. mark referral code as used,
3. save completion time.

If the referral came through a pharmacy:

4. create the larger completion reward.

If it came from self-use:

4. no pharmacy reward is created.

Complete these changes in one short database transaction. Lock the referral row before checking its state, accept only `PENDING` or `FOLLOW_UP`, and make retries idempotent. A second or concurrent confirmation must report that the code was already used and must not create another completion reward. The intended centre ID must match the referral.

`COMPLETED` means only that attendance was independently confirmed and formal evaluation started. It does not mean that TB was diagnosed, a test was positive, or treatment started. The prototype completion reward is illustrative, has no configured money amount unless the PRD later specifies one, and is linked to workflow completion rather than any clinical result.

## Step 35 — Update the patient's companion

After verification, `/care` should show:

`Formal evaluation attendance confirmed.`

Refresh the saved referral from the backend when `/care` opens and when the person checks status. Explain bilingually that trained centre staff may review symptoms/history and choose an appropriate test such as sputum GeneXpert/another rapid molecular test, microscopy, chest X-ray, or another investigation based on available services and clinical need. Do not promise a particular test and do not display attendance confirmation as a diagnosis or test result.

TB-centre staff authentication and centre-role authorization are not defined for this prototype. `/verify` is therefore a demo workspace only and must not be represented as production-ready staff access.

---

# Part 11 — Build Pharmacy Dashboard

## Step 36 — Build `/pharmacy`

Show:

- pharmacy-assisted screenings,
- referrals created,
- referrals completed,
- referral completion rate,
- simulated earnings,
- integrity score.

Self-use screenings should stay separate from pharmacy activity.

Read these totals from aggregate database queries scoped to one pharmacy. Do not return patient details. This is a demo workspace until pharmacy staff authentication and role authorization are specified.

## Step 37 — Add simulated rewards

Clearly label:

**Illustrative prototype incentive**

Use separate example rewards for:

- valid pharmacy-assisted screening,
- appropriate pharmacy referral,
- independently verified completion,
- optional quality bonus.

Keep rewards linked to the referral workflow, not to a positive TB result.

The PRD does not define example monetary amounts or an integrity-score formula. Keep reward events separate and visible, but show earnings as not configured and integrity score as not calculated until those product values are specified. Do not invent either value.

## Step 38 — Show live reward updates

When a pharmacy referral is verified at `/verify`:

- completed referral count increases,
- pharmacy earnings increase.

Make this visible during the demo.

Refresh the selected pharmacy's aggregate dashboard automatically while it is open and provide a manual refresh action. Verification remains transactional and idempotent; only the first valid independent completion can add its completion credit.

---

# Part 12 — Build Missed-Referral Follow-Up

## Step 39 — Add `Simulate +24 Hours`

This is a presentation-only button.

If a referral is still `PENDING`:

change it to:

`FOLLOW_UP`

## Step 40 — Ask why the person did not attend

Use options:

- work schedule,
- centre too far,
- fear,
- stigma,
- transport problem,
- did not understand,
- other.

## Step 41 — Show the next action

Examples:

- explain why testing matters,
- show another centre,
- suggest another suitable option,
- mark for human support.

## Step 42 — Update `/care`

The companion should show the new next step.

This works for both self-use and pharmacy-assisted users.

---

# Part 13 — Build the Government Dashboard

## Step 43 — Build the main cards

At `/dashboard`, show only anonymous totals.

Show:

- total screenings,
- self-use screenings,
- pharmacy-assisted screenings,
- formal referrals,
- completed referrals,
- completion rate.

## Step 44 — Add the referral funnel

Show:

`Screened → Referred → Completed`

## Step 45 — Add the geographic activity map

Group data by broad area.

Never show individual patient points.

For each area, calculate:

- number of unique users screened,
- number of unique users recommended for formal evaluation,
- referral count,
- completion count.

## Step 46 — Create a simple hotspot rule for the prototype

Use a clearly labelled **demo rule**.

Example:

Within the last 7 demo days:

- fewer than 3 independent referred users = normal
- 3–4 independent referred users = watch
- 5 or more independent referred users = red warning

Use unique patient IDs so one person cannot create the hotspot repeatedly.

This threshold is only for demonstrating the product.

It is **not a medical or government-approved outbreak threshold**.

## Step 47 — Show the red warning correctly

For a red area, show:

**High potential-TB screening activity — investigate**

Avoid wording such as:

`TB outbreak confirmed`

or:

`Massive TB outbreak`

The system provides a signal.

Government/public-health staff make the decision.

## Step 48 — Show possible government actions

When a red area is selected, show a simple action panel:

- `Review area`
- `Plan awareness activity`
- `Consider mobile screening/testing`
- `Review need for additional TB service capacity`

The dashboard should support planning decisions rather than automatically creating a TB centre.

The dashboard only helps authorities decide whether more investigation or service capacity may be needed.

## Step 49 — Protect privacy on the map

Do not show a hotspot if the number of independent users is too small.

For the prototype, hide any area with fewer than 3 independent screening records.

The government view should not expose:

- patient names,
- phone numbers,
- cough recordings,
- exact addresses.

---

# Part 14 — Add Basic Fraud Protection

## Step 50 — Block repeated pharmacy rewards for one patient

Before giving an incentive, check whether the same patient recently received the same type of pharmacy reward.

For this prototype, `recently` means the previous 30 days across all pharmacies. Serialize the eligibility check and reward write so simultaneous requests cannot create two rewards. Do not block screening, referral, or care.

If yes:

`Reward not eligible — recent screening already exists.`

This does not block the person from using the health service again.

It only blocks repeated incentive payments.

## Step 51 — Block reused referral codes

A completed referral code can be used only once.

## Step 52 — Add repeated-audio warning

Create a simple file hash for uploaded cough recordings.

Use SHA-256 and store only the lowercase hash. Do not upload or store the audio for this check. The second exact-file match triggers the warning.

If the same file is repeatedly used:

`Possible reused audio`

Treat repeated audio as a warning for review, not proof of fraud.

## Step 53 — Add unusual pharmacy-volume warning

If one pharmacy produces unusually high activity in the demo:

`Activity requires review`

The labelled demo threshold is 10 referrals in a rolling 24-hour period. Hold only new rewards created after the threshold is reached; do not change earlier rewards. Show pharmacy-specific warnings on `/pharmacy` and anonymous aggregate counts on `/dashboard`.

Protect referral lookup and completion at `/verify` with the server-only `TB_CENTRE_STAFF_PIN` environment variable. Send it in a request header, never a URL, and never expose it to pharmacy screens. This is demo access separation; production must use real staff authentication later.

## Step 54 — Keep hotspot fraud-resistant

Hotspot calculations must use:

- unique patient IDs,
- independent screening records,
- area-level aggregation.

Repeated attempts by the same person should not make an area red.

---

# Part 15 — Add AI Companion Behaviour

## Step 55 — Add AI only after the main flow works

A free option is Gemini API.

Getting started:

https://ai.google.dev/gemini-api/docs/get-started

Use AI only for:

- simple Bangla or English explanations,
- understanding a free-text follow-up answer,
- identifying a barrier category,
- helping the user understand the next step.

## Step 56 — Do not let AI control safety

AI may understand:

`I could not go because my office would not give me leave.`

and convert it to:

`WORK_SCHEDULE`

AI may not override:

`FORMAL_TB_EVALUATION_RECOMMENDED`

Safety decisions stay in fixed rules.

Implementation boundary:

- keep `GEMINI_API_KEY` server-only; never use a `NEXT_PUBLIC_` key,
- configure the optional server-only `GEMINI_MODEL` value when a different stable model is required; otherwise use `gemini-3.8-flash`, with `gemini-3.5-flash-lite` as a server-side fallback only when the primary model is unavailable or retired,
- send only the short free-text barrier answer needed for classification, never patient identifiers,
- do not store the free-text answer; persist only the person's confirmed fixed barrier category,
- show the AI-selected category for review and require the person to confirm before saving,
- never send urgent guidance to AI, and never let an AI response alter the deterministic screening outcome,
- if Gemini is unavailable, keep the fixed barrier choices and fixed next-step guidance fully usable.

## Step 56A — Add the opt-in TB-first daily companion

- Add a separate `/assistant` experience. Anonymous visitors receive only
  non-persistent general education. Signed-in people may opt in to private
  activity context and conversation memory; both controls default off and may
  be cleared or disabled at any time.
- Keep assistant messages and preferences in a private, account-owned data
  store. Never show them in pharmacy, TB-centre, government, public, referral,
  or aggregate workflows; never use them to train a model.
- Retrieve only from an approved source allow-list (for example WHO and the
  Bangladesh NTP). Any server-side web refresh must keep the source URL,
  retrieve a bounded excerpt, discard it after the response, and show that URL
  to the person. Never treat arbitrary web pages or user-provided URLs as RAG
  knowledge.
- Supply the model only a minimal, identifier-free summary of enabled My Care
  activity: care saved, referral stage, follow-up action, and pending-reminder
  count. The deterministic safety result remains outside the prompt and is
  rendered by the app.
- Do not give dosage, start/stop instructions, interaction guarantees, or a
  treatment plan. For medicine questions, offer general education, advise a
  pharmacist/clinician for personal use, and preserve fixed urgent guidance.
- Accept only JPEG, PNG, WebP, WAV, OGG, WebM, M4A, or MPEG assistant media
  with server-side signature and size validation. Forward valid bytes only for
  the current multimodal inference, never persist the bytes, and do not retain
  them in conversational memory. Images and audio are supporting context, not
  evidence that can identify a medicine, diagnose, or determine dosage.
- Use structured model output plus application validation and citations. This
  reduces unsupported answers but cannot make hallucination mathematically
  impossible; the explicit product behavior for insufficient approved evidence
  is a direct "I do not know" answer and referral to a clinician/pharmacist or
  urgent guidance.

## Step 56B — Add the medicine education catalogue

- Add `/medicines` as a client-side searchable page backed by a versioned local
  generic-medicine catalogue. Keep at least 100 unique generic entries; search
  English and Bangla names, category, and broad general-use copy without a
  network call or patient-data collection.
- Use a small `Medicine` schema with bilingual generic name, category, general
  use, general caution, urgent warning signs, and a source URL. Do not add a
  dose, a prescription instruction, treatment recommendation, stock status,
  price, brand endorsement, or Bangladesh-availability assertion.
- Link non-TB entries to the official DailyMed label search and TB entries to
  official WHO TB guidance. Explain in the UI that DailyMed is a U.S. label
  resource and that local packs/registration can differ.
- Add an on-demand server route that uses DailyMed generic search results, then
  obtains each individual SPL's product packaging and media. Render a photo
  only for an exact returned label product with its DailyMed title, product and
  generic name, ingredients/strength where supplied, NDC, and label URL.
  Accept only `https://dailymed.nlm.nih.gov/dailymed/image.cfm` image URLs;
  never trust an arbitrary remote image URL. The images are U.S. label media,
  not Bangladesh product images. Require a clear U.S.-product notice, keep the
  neutral medicine icon as the default, and do not present photos as an
  identification or authenticity tool. Bangladesh imagery stays disabled until
  an official or licensed product-level source is integrated.
- Keep the page fully bilingual, English-first, mobile-friendly, and compliant
  with the existing Merriweather/Noto Sans Bengali typography system. Add an
  automated test for the count, unique IDs, bilingual content, warning fields,
  and official-source URL host allow-list.

---

# Part 16 — Connect Telegram

## Step 57 — Create the Telegram entry channel

Create a Telegram bot through `@BotFather` after the web flow works.

## Step 58 — Use Telegram as an optional entry channel

A person should be able to start from home using Telegram. A pharmacy QR can also open the same Telegram flow. Use deep-link payloads that carry only `SELF` or a validated active pharmacy ID. An invalid or inactive pharmacy ID must be rejected, never silently changed to self-use.

## Step 59 — Use the same backend flow

Telegram and web must use:

- the same screening rules,
- the same patient data,
- the same referral system,
- the same follow-up system.

Reuse the same deterministic safety function and the same Supabase screening, referral, care, and follow-up RPCs for web and Telegram. Persist private conversation state by an HMAC-SHA256 channel key; do not persist raw Telegram chat IDs or inbound message text.

## Step 60 — Support voice messages

When a Telegram voice message arrives:

1. receive the audio,
2. send it to the same audio function,
3. save only what is needed,
4. return the next step.

Validate the provider file type, size, and audio-container signature; calculate the same lowercase SHA-256 digest used by web uploads; process the transient bytes through the shared HeAR service, and then discard them. Return the experimental cough-presence signal or the symptom-based fallback. Never let either alter the fixed safety result.

## Step 61 — Keep the website as backup

Keep the website as a reliable backup if Telegram is unavailable.

Implementation boundary:

- authenticate Telegram POST requests with `X-Telegram-Bot-Api-Secret-Token`,
- keep all provider tokens and webhook secrets server-only,
- reject non-private Telegram chats and malformed provider/user IDs,
- make webhook event handling idempotent and replay the saved safe reply for an already-completed provider event,
- require a public HTTPS application URL for provider callbacks; local/LAN URLs remain website-only,
- keep provider setup external: Meta and Telegram credentials are never committed to the repository.

### Telegram webhook setup

Telegram does not create the webhook secret for you. Generate a random URL-safe value, save the exact same value as `TELEGRAM_WEBHOOK_SECRET` in both `.env.local` and Render, then register it with Telegram. Telegram adds that value to each delivery as the `X-Telegram-Bot-Api-Secret-Token` header; the application rejects a request when it does not match.

Use this PowerShell command locally to generate a valid secret without printing any existing credentials:

```powershell
$bytes = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
```

Set `APP_URL` (or `NEXT_PUBLIC_APP_URL`) to the public HTTPS Render origin, then run these commands from the project directory after the Render deployment is live:

```powershell
npm run telegram:webhook:set
npm run telegram:webhook:status
```

The setup command registers only `message` updates at `https://<public-host>/api/channels/telegram`; it does not discard pending updates. It never prints a bot token or webhook secret. The status command reports the endpoint host/path, pending update count, and Telegram's last delivery error. During a rotation, deploy the new `TELEGRAM_WEBHOOK_SECRET`, retain the previous value temporarily as `TELEGRAM_WEBHOOK_SECRET_PREVIOUS`, run the setup command with the new secret, verify status, then remove the previous value in a later deployment.

---

# Part 17 — Add Real HeAR and an Investigational TB-Triage Score Only If Needed

## Step 62 — Read the HeAR model card

https://developers.google.com/health-ai-developer-foundations/hear/model-card

Remember:

HeAR 1.0.0 expects 16 kHz mono audio in two-second windows and creates a 512-value health-audio embedding. The base model is too large for the web client, so keep it in a separately hosted server-side inference service.

HeAR is an embedding model, not a cough classifier and not a TB diagnostic model. Use the bundled Google health-event detector only to locate a cough-like window. Train a small regularized classifier on frozen embeddings for cough presence. Do not fine-tune the HeAR base model without a suitable clinical dataset and separate validation.

## Step 63 — Test HeAR separately

Resources:

https://developers.google.com/health-ai-developer-foundations/hear/get-started

https://github.com/Google-Health/hear

https://huggingface.co/google/hear-pytorch

Use the official `google/hear` TensorFlow artifact when the gated PyTorch repository is unavailable to the authenticated Hugging Face account. Test model loading and a `(1, 32000)` input independently before connecting it to the application.

For the prototype classifier, prepare a balanced CoughVID subset using high-confidence weak cough-presence labels (`cough_detected >= 0.95` and `<= 0.05`). Split by recording identity into train, validation, and held-out test sets. Choose the threshold on validation data and publish held-out metrics in the classifier artifact. CoughVID is not a TB dataset and must not be used for TB prediction.

## Step 64 — Replace the demo acoustic value and, only with authorised data, add a triage score

If it works reliably:

1. validate and decode transient audio to 16 kHz mono,
2. use the official detector to select the most cough-like two-second window,
3. create a 512-value HeAR embedding,
4. apply the versioned cough-presence classifier,
5. return `COUGH_LIKE_SIGNAL_PRESENT`, `NO_COUGH_LIKE_SIGNAL_DETECTED`, or `INCONCLUSIVE`, and
6. only when an independently versioned, authorised, calibrated TB-triage classifier is installed, return an investigational triage score and concern band.

The triage classifier must be trained on cough recordings with microbiological TB reference labels, not CoughVID. Its data source must have explicit terms permitting the intended research use. Do not use a Hugging Face mirror, checkpoint, or GitHub repository that lacks a model card, data provenance, licence/terms, and reproducible evaluation. Treat the Jaga repository as an architectural reference only unless the licence and provenance of every imported weight and its upstream data are independently verified.

At the time this guide was updated, the most useful non-CODA research lead is TBscreen: its public release documents 149 pulmonary-TB and 46 non-TB participants, 33,000 passive and 1,600 forced coughs, recording devices, code, and metadata. Its raw audio exists only for consented rows and its large data download is hosted separately from the code release. Verify the dataset's current terms before downloading or training; do not infer permission from the code archive's CC-BY-4.0 licence. A public Hugging Face ZIP named `AHFIDAILabs/coda_tb_dataset` has no dataset card or licence metadata and remains an unverified lead.

Keep the model and score server-side. Do not return embeddings or raw audio to the browser and do not persist either. Return a score only as `researchEstimate` together with `ELEVATED_ACOUSTIC_CONCERN`, `LOWER_ACOUSTIC_CONCERN`, or `INCONCLUSIVE`; never label it diagnosis, confirmation, or rule-out. A percentage may be displayed only with the UI label “Investigational research triage estimate — not your probability of TB” and equivalent Bangla copy.

Before enabling a score, publish the model and dataset version, cohort/reference standard, person-disjoint split, sensitivity, specificity, ROC-AUC, calibration assessment, confidence intervals, and known external-validation limits. A score may add a recommendation to seek formal evaluation but must never cancel, downgrade, or replace the fixed Step 21 result or deny a referral.

## Step 65 — Keep a fallback

If cough processing fails:

`Acoustic screening unavailable. Recommendation based on symptom screening.`

The care-navigation system must still work.

Use this fallback only for an unavailable or failed acoustic-processing request. A valid negative or inconclusive acoustic result is not a processing failure. The same boundary applies to web and Telegram audio.

---

# Part 18 — Build Community Engagement

## Step 66 — Build `/community`

Show:

- the problem,
- the solution,
- demo button,
- community feedback question,
- public interest/support count.

## Step 67 — Do not ask users to reveal TB status

Use safe questions such as:

`What usually prevents people from going for TB testing?`

Options:

- work,
- distance,
- fear,
- stigma,
- lack of information,
- transport.

## Step 68 — Show anonymous feedback

Example:

`Work schedule — 38%`

`Distance — 27%`

`Fear or stigma — 21%`

This can help explain why the companion needs adaptive follow-up.

---

# Part 19 — Prepare the Best Demo

## Step 69 — Seed the government map

Create demo data in several broad areas.

Example:

- Sonadanga — normal
- Khalishpur — watch
- Daulatpur — red warning

Clearly mark seeded numbers as demo data.

## Step 70 — Make one new screening trigger the hotspot

For a strong demonstration, seed four independent referred users in one area.

During the live demo:

1. a fifth independent user completes screening,
2. formal evaluation is recommended,
3. government dashboard updates,
4. the area changes to red.

Show:

**High potential-TB screening activity — investigate**

This makes the surveillance idea easy to understand.

## Step 71 — Prepare one self-use demo

Show:

`Home → screening → cough → care navigation → referral → My Care`

This proves the system is not pharmacy-only.

## Step 72 — Prepare one pharmacy-assisted demo

Show:

`Pharmacy QR → screening → referral → attendance verification → pharmacy reward`

This proves the assisted-access and incentive model.

## Step 73 — Show missed-referral recovery

Use:

`Simulate +24 Hours`

Show:

- referral missed,
- barrier identified,
- next action updated.

## Step 74 — Show one fraud case

Example:

- repeated audio,
- duplicate patient reward,
- unusual pharmacy volume.

Show:

`Reward held for review.`

### Repeatable rehearsal

- Run `npm run test:integration` to validate the complete deterministic demo story without changing persisted patient data.
- Run `npm run demo:record` while the production app is running to validate the same story and save a phone-sized video under `.artifacts/part19-demo-video/`.
- The rehearsal covers self-use, pharmacy-assisted use, missed-referral recovery, independent verification, pharmacy reward isolation, a held-reward review signal, and the fifth independent Daulatpur referral changing the map from watch to red.

---

# Part 20 — Final Quality Check

## Step 75 — Test the self-use path

Check:

`Landing → self-use screening → cough → referral → care page → follow-up`

## Step 76 — Test the pharmacy-assisted path

Check:

`Pharmacy QR → screening → referral → verification → pharmacy reward`

## Step 77 — Test government hotspot update

Check:

- both self-use and pharmacy-assisted risk signals appear in area totals,
- duplicate patients do not increase the hotspot count,
- no individual location is visible,
- red means investigate, not confirmed outbreak.

## Step 78 — Test mobile layout

The patient side should work well on a normal phone screen.

For every changed user-facing screen, confirm that English loads by default, Bangla is available through the persistent toggle, and safety-critical meaning is equivalent in both languages.

## Step 79 — Test from a clean browser

Test:

- main link,
- pharmacy QR,
- recording/upload,
- referral QR,
- verification,
- pharmacy dashboard,
- care companion,
- government dashboard,
- community page,
- web fallback.

Run `npm run test:final` from a configured workstation for the repeatable Part 20 suite. It performs static checks, the production build, transactional database tests, Supabase advisors, unit tests, all major browser workflows, HeAR and AI checks, and the multi-viewport bilingual layout sweep.

---

# Suggested Build Order

This section is only a recommended order. You can move between items as needed while testing and improving the prototype.

## Start With These — Core Product

1. project pages
2. database
3. self-use entry
4. pharmacy-assisted entry
5. symptom screening
6. fixed safety rules
7. area selection
8. cough upload with prototype result
9. user companion
10. TB-centre finder
11. referral creation
12. TB-centre verification
13. pharmacy reward logic
14. missed-referral follow-up
15. government dashboard
16. privacy-safe hotspot map

## Add Next — Helpful for a Strong Demo

17. basic fraud checks
18. simple AI companion
19. English-first visual polish and language-quality review (bilingual support is already core)
20. community feedback page
21. Telegram connection

## Add Later — Optional

22. real HeAR cough model
23. advanced fraud scoring
24. larger national TB-centre database
25. advanced hotspot analysis
26. treatment-adherence features

---

# Important Logic Summary

## Self-Use

`Home / anywhere → screening → care navigation → referral → follow-up → formal evaluation`

No pharmacy reward.

## Pharmacy-Assisted

`Pharmacy → assisted screening → care navigation → referral → follow-up → formal evaluation`

Pharmacy can receive the simulated incentive.

## Government View

Both paths contribute anonymous area-level information.

`screenings + referral signals → area aggregation → hotspot warning`

The hotspot is only a reason to investigate.

It is not a TB diagnosis and not an outbreak confirmation.

---

# Useful Resources

## Bangladesh TB

- NTP: https://www.ntp.gov.bd/
- TB laboratories: https://www.ntp.gov.bd/laboratory/
- Guidelines: https://www.ntp.gov.bd/guidelines/
- National Strategic Plan: https://www.ntp.gov.bd/guideline/national-strategic-plan-for-tb-control-2021-2025/
- TB operational manual: https://www.ntp.gov.bd/guideline/national-guide-lines-tb-6th-ed/

## Pharmacy-Based TB Referral Evidence

- Bangladesh TB delay study: https://pmc.ncbi.nlm.nih.gov/articles/PMC12212489/
- SMC Blue Star Program: https://smc-bd.org/blue-star-program-bsp-
- Pharmacy TB referral intervention: https://pmc.ncbi.nlm.nih.gov/articles/PMC6528751/
- Pharmacy TB engagement review: https://pmc.ncbi.nlm.nih.gov/articles/PMC9020292/

## Cough Audio

- HeAR overview: https://developers.google.com/health-ai-developer-foundations/hear
- HeAR model card: https://developers.google.com/health-ai-developer-foundations/hear/model-card
- HeAR start guide: https://developers.google.com/health-ai-developer-foundations/hear/get-started
- HeAR GitHub: https://github.com/Google-Health/hear
- HeAR PyTorch: https://huggingface.co/google/hear-pytorch

## Telegram

- Bot API: https://core.telegram.org/bots/api
- Webhooks: https://core.telegram.org/bots/webhooks

## Map

- MapLibre: https://maplibre.org/maplibre-gl-js/docs/

## Database

- Supabase: https://supabase.com/
- Database guide: https://supabase.com/docs/guides/database/overview

## Hosting

- Vercel: https://vercel.com/
- Hobby plan: https://vercel.com/docs/plans/hobby

## Optional AI

- Gemini API: https://ai.google.dev/gemini-api/docs/get-started
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

## Hackathon

- Hypomatrix: https://hackathon.hypomatrix.com/

---

# Final Demo Story

The prototype should prove three things clearly:

### 1. Anyone can use it

**Home / anywhere → screening → cough → care navigation → referral**

### 2. Pharmacies provide assisted access

**Pharmacy-assisted screening → verified referral → pharmacy incentive**

### 3. Government gets anonymous early warning signals

**Many independent potential-risk screenings in one area → red investigation signal → government reviews whether more screening or TB service capacity is needed**

The final message should be:

**First Signs is a TB screening and care-navigation companion available from anywhere. Pharmacies extend access to people who need help, while anonymous area-level signals help public-health authorities identify places that may need investigation or additional TB services.**
