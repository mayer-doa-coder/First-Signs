# First Signs — Product Requirements Document

## 1. Product Name

**First Signs**

## 2. One-Line Description

A simple TB screening and care-navigation service that people can use from home or anywhere through their own phone, while pharmacies provide assisted access for people who do not have a suitable smartphone or need help.

## 3. Main Goal

The product should reduce the chance that a person with possible TB symptoms is lost before reaching formal TB care.

People can enter the system in two ways:

1. **Self-use:** from home or anywhere using their own phone.
2. **Pharmacy-assisted use:** through a nearby pharmacy when they do not have a suitable phone, internet access, or need help.

The main care journey is:

**home / anywhere OR pharmacy → screening → care navigation → referral → government TB centre → completed formal evaluation**

The product does **not** diagnose TB. It may show a separately labelled, optional **investigational acoustic TB-triage score** only when the requirements in Section 10A are met. The score is a research signal for whether a cough recording resembles the model's validated TB-screening cohort; it is not a diagnosis, a confirmed probability that a person has TB, or a substitute for clinical assessment and microbiological testing.

## Language Requirement

First Signs is built primarily for Bangladesh. All user-facing interfaces and messages must be implemented in both Bangla and English from the first version, including patient, pharmacy, TB-centre verification, government/public-health, and community screens.

- English is the default and primary language.
- Bangla is the secondary language and must be available from the persistent language toggle from the first screen; it must not be postponed as a later enhancement.
- Safety, consent, referral, and follow-up messages must keep the same meaning in both languages.

### Typography

The entire product must use this global typography system from the first UI version:

- Bangla text uses **Noto Sans Bengali**.
- English text uses **Merriweather**.
- Do not introduce another font family without explicit approval.
- The typography rule applies to every interface state: forms, dashboards, validation, alerts, loading states, errors, modals, toasts, and application-controlled map labels.
- Mixed-language content must render each language in its specified font.
- Important health information must remain highly readable; do not use light font weights.

### Visual and Motion Reference

The UI must consistently implement the observable component patterns verified on `https://letters.app/` and its Awwwards elements page:

- pale-blue rounded page and hero shells,
- high-contrast white navigation,
- oversized centered hero copy,
- black pill primary actions and white pill secondary controls,
- soft-gray bento cards with compact labels and generous whitespace,
- restrained floating, reveal, and hover motion,
- responsive compositions that preserve the same hierarchy on mobile.

Healthcare-specific component patterns may be adapted from verified 21st.dev and Framer healthcare examples only when they express an existing First Signs requirement. Approved examples are clinical trust/status cards, care-pathway steps, safety reassurance panels, facility discovery, and readable health metrics. Do not add fictional doctors, appointments, testimonials, clinical claims, or services. Use Motion for React for interruptible spring-based route and state transitions, scroll progress, and reduced-motion-aware animation.

Use project-owned HTML and CSS for these patterns. Do not copy Letters branding, proprietary source code, product copy, or unavailable assets. The approved Merriweather and Noto Sans Bengali typography and all original healthcare and safety content remain mandatory.

## 4. Why This Makes Sense in Bangladesh

- A recent Bangladesh study found that **42.1%** of participants reported nearby pharmacies as their first place for seeking care.
- Bangladesh's National TB Programme says pharmacies and drug sellers are an important first point of contact and calls pharmacy engagement an under-used resource for TB case finding.
- Bangladesh's TB strategy reports **107,592 licensed drug shops**.
- SMC's Blue Star network reported **217,254 suspected TB referrals from July 2024 to June 2025**, showing that pharmacy-linked TB referral can work at large scale.
- Bangladesh's National TB Programme already publishes a large list of TB laboratories and their available services.

## 5. Main Users

### Patient / General User
Can use the service from home or anywhere as a simple health-navigation companion.

Needs:
- simple check-up support,
- cough recording,
- symptom screening,
- clear next-step guidance,
- referral support,
- follow-up support.

### Pharmacy Person
Provides assisted access for people who do not have a suitable smartphone, internet access, or need help.

Needs a reason to refer the patient instead of losing the possible medicine sale.

### TB Centre Staff
Needs a simple way to confirm that a referred person reached the centre.

### Government / Public Health Viewer
Needs anonymous information about screening, referrals, referral completion, pharmacy performance, and geographic areas showing unusually high potential-TB screening activity.

The dashboard should help authorities identify areas that may need:
- investigation,
- awareness activity,
- mobile screening/testing support,
- or additional TB service capacity.

## 6. Core Product Promise

**The pharmacy should not lose financially for sending the right patient to formal TB care.**

The prototype will show an incentive system where the pharmacy can earn from:

1. a valid screening,
2. an appropriate referral,
3. a larger bonus when the TB centre independently confirms attendance,
4. an optional monthly quality bonus.

All money shown in the prototype must be clearly marked as **illustrative / simulated**.

## 7. Main Patient Flow

1. Patient visits a pharmacy with a persistent cough or related concern.
2. Pharmacy shows the First Signs QR code.
3. Patient scans the QR code.
4. Patient opens the web chat first. WhatsApp can be connected later.
5. Patient sees a clear message that this is screening and care navigation, not diagnosis.
6. Patient gives consent.
7. Patient answers a small number of TB symptom and risk questions.
8. Patient is asked to send or record a cough sample.
9. The system checks whether the audio is usable.
10. The system produces an **experimental acoustic screening signal** and, when a validated research model is available, may show an investigational acoustic TB-triage score.
11. The fixed safety rule uses only the documented symptom inputs. The optional acoustic signal and triage score are shown separately and can never change or downgrade that result.
12. If formal TB evaluation is recommended, the system shows a nearby verified TB centre.
13. Patient accepts the referral.
14. System creates a one-time referral ID / QR code.
15. Pharmacy dashboard shows the referral as pending.
16. TB centre staff verifies the referral when the patient arrives.
17. Referral becomes completed.
18. Pharmacy receives the simulated completion reward.
19. If the patient does not attend, the system follows up and asks why.
20. The system records the barrier and helps the patient reconnect with formal care.

## 8. Must-Build Features

These are required for the hackathon prototype.

### A. Patient Screening Flow

- direct web/mobile entry from anywhere
- pharmacy QR / assisted entry
- consent message
- English-first simple chat with Bangla available from the persistent language toggle
- symptom questions
- cough upload / recording
- an in-flow mobile recording action; the person must not have to record in another app before returning to upload
- trusted HTTPS on deployed patient and pharmacy links so supported mobile browsers can request microphone access
- a native device-recorder fallback when direct browser recording is unavailable
- screening result wording
- referral recommendation
- simple companion-style follow-up
- optional passwordless account sign-in after or before screening; anonymous screening remains available
- a private My Care area for the person's own screening, referral, attendance, follow-up, and consented reminders; it must not diagnose TB or manage treatment

### Account and Staff Access

- Patient accounts use an optional passwordless email link and may store a name and optional Bangladesh phone number.
- Pharmacy, TB-centre, and government accounts are invite-only and receive only their assigned workspace.
- Government information remains anonymous and aggregated; pharmacy users never see private self-use patient information; TB-centre staff independently confirm attendance only for their assigned centre.
- Reminder email is optional and generic: it must not contain symptoms, referral identifiers, centre details, or diagnostic wording.

### B. TB Centre Finder

- nationwide list of verified Bangladesh TB-evaluation facilities, with coverage across all eight divisions
- distance or nearby-centre display
- service type such as microscopy or GeneXpert when available
- whole-Bangladesh map coverage and broad division-level location selection without collecting an exact home address or patient GPS point

### C. Referral System

- unique referral ID
- for the prototype, the first committed referral ID is `JVH-KHU-00001`; each subsequent successfully committed, non-deleted referral increments by one
- failed or rolled-back creation attempts and idempotent retries must not consume a referral number
- referral status
- pending / completed / closed states
- centre-side verification button or page

### D. Pharmacy Dashboard

Show:

- valid screenings
- referrals created
- referrals completed
- simulated earnings
- referral completion rate
- simple integrity score

### E. Missed-Referral Follow-Up

- demo button to simulate time passing
- follow-up question
- barrier options such as work, distance, fear, misunderstanding, or transport
- simple next action

### F. Government / NTP-Style Dashboard

Show only anonymous and aggregated information:

- screenings
- referrals
- completed referrals
- completion rate
- area-wise activity
- pharmacy performance
- fraud alerts
- geographic screening-risk map
- hotspot warnings when one area shows unusually high potential-TB screening/referral activity

### Hotspot Map Rule

The dashboard can show a **red warning area** when many independent users from the same area are repeatedly meeting the system's referral criteria.

A red area means:

**High potential-TB screening activity — investigate.**

It must **not** mean:

**Confirmed TB outbreak.**

Government/public-health staff can then decide whether the area needs:
- field investigation,
- awareness work,
- temporary/mobile TB screening,
- or additional TB testing/service capacity.

Small numbers must be hidden or grouped so individual patients cannot be identified.

### G. Basic Fraud Protection

- one patient cannot repeatedly create paid referrals
- pharmacy cannot confirm its own referral completion
- one-time referral code
- duplicate patient warning
- repeated audio warning
- unusually high referral volume warning
- suspicious reward marked as held

## 9. Strongly Recommended Features

Build these after the main flow is working.

### A. Simple Companion / Agent Behaviour

Use AI only where it improves conversation and support.

Examples:

- guide a user through a check-up from home,
- remind the user about an unfinished screening or referral,
- understand a patient's reason for missing the appointment,
- convert a free-text answer into a barrier category,
- explain the next step in simple Bangla or English.

Medical safety decisions should remain fixed rules.

### A1. TB-first Daily Health Companion

Provide a bilingual daily companion focused on TB education, care navigation,
and basic medicine information. It may answer general health-education
questions, but it must not diagnose, prescribe, calculate a personal treatment
plan, or replace a clinician or pharmacist.

- Use retrieval-augmented generation from an approved, versioned source set.
  Server-side refreshes may fetch only approved official health-source pages;
  do not use open-web search results or arbitrary scraped pages as medical
  evidence. Show the sources used with each answer.
- Signed-in people may explicitly enable private activity context. The assistant
  can then use only that person's My Care status, reminders, and confirmed
  follow-up state to make a practical suggestion. It must never expose this
  context to pharmacy, TB-centre, government, public, or other account views.
- "Learning" means user-controlled conversational memory and retrieval, never
  training a model on patient conversations or silently profiling a person.
  Let the person inspect, clear, or disable saved memory and activity context.
- Urgent symptoms and deterministic screening outcomes always take precedence.
  The assistant must direct emergency concerns to the existing urgent guidance
  and must not downgrade or reinterpret it.
- Support optional voice recording/audio upload and image upload for a single
  assistant turn. Validate allowed media types and signatures server-side,
  discard the bytes immediately after inference, and never retain media in
  chat memory. Treat media as supporting context only: it cannot identify a
  medicine, diagnose a condition, or determine a dose.
- No generative model can guarantee zero hallucinations. Require the assistant
  to answer only when approved retrieved sources support it; otherwise it must
  state that it does not know and direct the person to a clinician/pharmacist
  or the existing urgent path as appropriate.

### A2. Medicine Corner

Provide a bilingual, searchable Medicine Corner with at least 100 common
generic medicine ingredients. It is a public education aid, not a prescription
tool, stock catalogue, medicine-recognition tool, or a way to diagnose or treat
a person.

- For every medicine, show the generic name, broad medicine category, a short
  general-use description, a general caution, urgent warning signs, and a link
  to an authoritative label or guideline source. Do not provide a dose,
  individualized interaction decision, start/stop instruction, or claim that a
  medicine is available, registered, safe, or suitable in Bangladesh.
- The first release uses DailyMed label-search links for non-TB entries and WHO
  TB guidance for TB entries. These are source links, not a statement that a
  U.S. label or product pack applies in Bangladesh. The local pack and a
  pharmacist/clinician remain the source for a person's actual medicine.
- Product photographs may be shown only after a person requests a verified,
  exact product-label match. Display the source title, product/generic name,
  active ingredient/strength where present, NDC, manufacturer label text, and
  source link with the image. Current images come from U.S. DailyMed label
  media and must be labelled as U.S. products that may not match Bangladesh
  packaging. Do not use a generic name alone to select a product photo, and
  explicitly tell people not to identify a medicine from a photo, colour, or
  look-alike name. Bangladesh product imagery remains disabled until a licensed
  or official product-level image source is available.
- Never present the catalogue as a substitute for urgent care. Keep the fixed
  urgent guidance and all existing TB referral and screening flows unchanged.

### B. WhatsApp and Telegram Connection

Connect the already-working patient flow to WhatsApp and Telegram. Both channels must support self-use and pharmacy-assisted entry while reusing the same consent, fixed clinical safety rules, patient records, screening persistence, referral workflow, and follow-up workflow as the website.

Messaging voice files must be processed through the shared prototype audio pipeline. Store only the lowercase SHA-256 digest needed for duplicate-file warning; do not retain the audio file. Messaging audio must not diagnose TB or change the deterministic safety outcome.

Provider webhook requests must be authenticated server-side. Store only a one-way channel identifier for conversation continuity; do not store raw WhatsApp phone numbers, Telegram chat IDs, or inbound free text in the messaging-session tables.

Do not make the live presentation depend on WhatsApp or Telegram. Keep the web version as a backup.

### C. Public Launch Page

Show:

- problem
- solution
- demo button
- community support / feedback button
- public interest count

This directly supports the hackathon's marketing and community-engagement criteria.

## 10. Optional Features

Only build these after everything above is stable.

### A. Real HeAR Cough Processing and Investigational TB-Triage Score

Use the official Google HeAR 1.0.0 TensorFlow model with 16 kHz mono, two-second audio windows to create 512-value embeddings. Use Google's bundled health-event detector to locate the most cough-like window and a small, regularized downstream classifier trained on frozen HeAR embeddings to estimate cough presence.

The cough-presence classifier may be trained with balanced, high-confidence CoughVID weak labels under its CC BY 4.0 licence. Split by recording identity before training, choose the decision threshold on a validation split, and report metrics on a separate held-out split. CoughVID is not a TB dataset and must not be used to train or validate the TB-triage score.

The optional TB-triage classifier requires a separately authorised dataset containing cough recordings and microbiological TB reference labels. Before a dataset or a released third-party weight may be used, record its source URL, version or revision, licence/terms, population, reference standard, recording protocol, class balance, split method, and evaluation results. A Hugging Face mirror or repository without a dataset card, licence/terms, model card, and data provenance is an unverified lead and must not be used for training or inference. A repository licence alone does not establish that its model weights or upstream medical data may be reused.

For the hackathon, the only permitted patient-facing interpretation is an **investigational acoustic TB-triage score** with a companion concern band: `ELEVATED_ACOUSTIC_CONCERN`, `LOWER_ACOUSTIC_CONCERN`, or `INCONCLUSIVE`. A displayed percentage is permitted only when the versioned model has a calibration report for a defined reference population, and it must be labelled in both languages as a research triage estimate rather than the person's probability of TB. Never call it a diagnosis, confirmation, or rule-out.

The triage score must not determine referral eligibility, must never lower or replace the deterministic Section 14 safety outcome, and must not be used to withhold testing. An elevated score may add a bilingual recommendation for formal evaluation; a lower or inconclusive score must retain all symptom-based safety recommendations. Raw audio and embeddings are transient and must not be persisted by this workflow. If decoding, model loading, or inference fails, show the documented symptom-based fallback and keep the care-navigation flow usable.

The published model artifact must include person-disjoint train/validation/held-out splits, sensitivity, specificity, ROC-AUC, calibration, confidence intervals, subgroup results where available, and a documented external-validation limitation. It must state that evidence from one country, phone type, recording workflow, or referral population does not establish performance in Bangladesh.

Current research leads are the TBscreen cohort and code release, the CODA TB DREAM Challenge data access programme, and the Jaga investigational implementation. They are not interchangeable assets: the project must verify the separate licence/terms for each dataset, codebase, model weight, and derivative before use. In particular, a repository's MIT or Apache licence does not automatically grant rights to use its training data or trained medical-model weights.

### B. Advanced Fraud Detection

Examples:

- audio fingerprint matching
- device-level anomaly detection
- unusual pharmacy behaviour score

### C. Treatment Adherence

Do not include this in the main MVP journey.

It can be shown as a future expansion.

## 11. What Must Not Be Built or Claimed

- Do not say the system diagnoses TB.
- Do not show a statement such as "You have TB".
- Do not make a cough model the only reason for referral.
- Do not let an AI model override safety rules.
- Do not reward a pharmacy because a patient tests positive.
- Do not expose patient identity on the public-health dashboard.
- Do not use real financial payments in the prototype.
- Do not build treatment-management features before the referral flow works.

## 12. Pharmacy Incentive Model for the Prototype

Use a simple split reward.

Example only:

- valid screening: small credit
- appropriate referral: small credit
- independently verified attendance: larger credit
- strong monthly quality: optional bonus

Important rule:

**The pharmacy earns something for doing its own work, but the largest reward requires independent TB-centre confirmation.**

## 13. Fraud Rules

### Rule 1
A pharmacy cannot approve its own referral.

### Rule 2
A referral code can be used only once.

### Rule 3
The same patient cannot receive the same pharmacy reward type again within 30 days, even through another pharmacy. The screening, referral, and health service continue; only the repeated incentive is blocked.

### Rule 4
The second and later use of the exact same uploaded audio file should create a warning. Store only its SHA-256 file hash, never the audio, for this check. This warning is for review and is not proof of fraud.

### Rule 5
For the prototype, 10 pharmacy referrals within a rolling 24-hour period is an explicitly labelled demo volume threshold. Once reached, only newly created rewards are marked `HELD_FOR_REVIEW`; earlier rewards are not changed. This signal is not proof of fraud.

### Verification access

The `/verify` workflow must require a server-side `TB_CENTRE_STAFF_PIN`. The PIN must never be exposed through a public environment variable, URL, log, repository file, or pharmacy screen. This is prototype access separation, not production staff identity management.

Pharmacy-specific review warnings appear on the pharmacy dashboard. The government dashboard shows anonymous aggregate warning counts only.

### Rule 6
Reward is based on correct workflow completion, not on a positive TB result.

## 14. Safety Rules

- Always say this is screening and navigation, not diagnosis.
- Use fixed rules for urgent or safety-critical situations.
- If the patient reports a serious red-flag symptom, advise formal medical evaluation instead of relying on the cough score.
- Use only verified TB-centre information.
- Keep personal health information away from public dashboards.
- Delete cough audio after processing in the prototype unless it is specifically needed for the demonstration.

### 14.1 Evidence-based Step 21 symptom rule

The Step 21 rule is a conservative, deterministic **screening and care-navigation rule**. It is not a diagnostic algorithm, does not estimate the probability of TB, and must not be described as endorsed or approved by Bangladesh NTP. A positive result means that professional evaluation is recommended; only appropriate clinical assessment and diagnostic testing can determine whether TB or another condition is present.

The evidence basis is:

- The Bangladesh NTP guideline index was checked on 12 September 2026 and still lists the sixth-edition national guideline as its current general TB operational manual.[^safety-5]
- Bangladesh NTP states that pulmonary TB should be presumed when a person has a persistent cough for two weeks or more and that GeneXpert or sputum microscopy should be requested even without other symptoms. It also lists blood in sputum, fever, night sweats, and weight loss as relevant symptoms.[^safety-1]
- Bangladesh NTP contact-investigation guidance refers symptomatic household and close contacts for evaluation and also refers asymptomatic contacts of drug-susceptible TB index cases for further evaluation and TB-preventive-treatment assessment.[^safety-1]
- WHO reports that, among people aged 15 years or older with negative or unknown HIV status, prolonged cough screening has estimated sensitivity of 42% and specificity of 94%. Screening for any TB symptom—cough, haemoptysis, fever, night sweats, or weight loss—raises estimated sensitivity to 71% and lowers specificity to 64%. This supports using the additional symptoms to avoid relying only on cough duration.[^safety-2]
- Coughing up even a small amount of blood warrants urgent professional assessment. More than a few spots or streaks, or blood with breathing difficulty, a very fast heartbeat, or chest or upper-back pain, warrants immediate emergency care.[^safety-3]
- Bangladesh National Emergency Service `999` provides 24-hour, toll-free ambulance access nationwide.[^safety-4]

### 14.2 Required inputs

The rule accepts only a complete, valid answer set:

- `coughDays`: a non-negative whole number,
- `fever`: yes or no,
- `nightSweats`: yes or no,
- `weightLoss`: yes or no,
- `bloodInSputum`: yes or no,
- `tbExposure`: yes or no; this means close contact with someone known to have TB.

Invalid or incomplete answers must be blocked by the interface. The function must not silently convert malformed answers into a safety outcome.

### 14.3 Required outcomes and precedence

Evaluate the rules in this exact order:

1. Return `URGENT_MEDICAL_EVALUATION` when `bloodInSputum` is yes. This always takes precedence over every other answer.
2. Otherwise return `FORMAL_TB_EVALUATION_RECOMMENDED` when at least one of these is true:
   - `coughDays` is 14 or more,
   - `fever` is yes,
   - `nightSweats` is yes,
   - `weightLoss` is yes,
   - `tbExposure` is yes.
3. Otherwise return `CONTINUE_SCREENING`.

For valid inputs, the function may return only those three language-neutral codes. It must remain in one visible source file, independent of AI prompts. AI and an experimental acoustic result must never downgrade `URGENT_MEDICAL_EVALUATION` or `FORMAL_TB_EVALUATION_RECOMMENDED`.

### 14.4 Required patient-facing meaning

All outcome messages must appear in equivalent Bangla and English and must preserve these meanings:

- `URGENT_MEDICAL_EVALUATION`: blood in sputum requires prompt medical evaluation. If there is more than a small amount of blood, difficulty breathing, a very fast heartbeat, or chest or upper-back pain, call Bangladesh National Emergency Service `999` or go to the nearest hospital emergency department immediately. A TB-centre referral is not a replacement for emergency care.
- `FORMAL_TB_EVALUATION_RECOMMENDED`: the answers meet the fixed referral criteria, so evaluation and appropriate testing at a verified TB centre are recommended. This result does not mean the person has TB.
- `CONTINUE_SCREENING`: none of the current answers meets the fixed urgent or formal-evaluation criteria. This does not rule out TB or another illness. Continue the remaining screening, and seek medical care if symptoms persist, worsen, or cause concern.

The person must continue to control whether the system creates a referral. Urgent safety instructions must still be shown even if the person declines a TB referral.

### 14.5 Known clinical limitations and governance

- This symptom-only prototype will produce false positives and false negatives. It does not replace history-taking, examination, chest radiography, or WHO-recommended rapid diagnostic testing.
- A simple yes/no symptom set cannot distinguish mild from massive haemoptysis. The rule therefore sends every report of blood in sputum to urgent evaluation and separately explains when immediate emergency care is required.
- The questions do not capture all age-specific, paediatric, pregnancy, HIV, diabetes, malnutrition, extrapulmonary-TB, or other emergency criteria. A qualified Bangladesh TB/public-health clinician must review and approve this rule before real-world clinical deployment.
- Rule changes require a documented version, source review, clinical approval, and regression tests. The initial implementation version is `BD-NTP-WHO-SYMPTOM-V1`.

### 14.6 Meaning of formal TB evaluation and attendance confirmation

Part 10 records that the person reached the intended TB centre and that formal evaluation started. It does not record a TB diagnosis, a positive result, treatment initiation, or clinical outcome.

Patient-facing explanations after confirmation must preserve these meanings in Bangla and English:

- trained centre staff review the person's symptoms and relevant history,
- for pulmonary TB, an appropriate specimen such as sputum may be tested,
- the centre may use GeneXpert or another WHO-recommended rapid molecular test, microscopy, chest radiography, or other investigations according to available services and clinical need,
- only the centre's qualified clinical and laboratory process can determine a diagnosis and next steps,
- a `COMPLETED` referral means attendance and evaluation started; it is not a test result.

After attendance is confirmed, the companion may also set expectations for what the visit itself usually involves, provided each statement stays hedged and none of it promises a result:

- a sputum specimen is commonly requested when pulmonary TB is suspected, in Bangladesh programme practice typically a spot specimen and a next-morning specimen,[^evaluation-4]
- the person should tell staff if they cannot produce sputum, without the app naming a specific alternative sample type,[^evaluation-3]
- rapid molecular results can often arrive the same day — Xpert MTB/RIF reports in under two hours and Truenat in under an hour — but the app must present timing as varying by centre and test rather than as a guarantee,[^evaluation-5]
- the person should return at the time the centre specifies to collect the result, because long delays between testing and treatment initiation are a documented weakness in the national cascade of care.[^evaluation-6]

Cost must not be overstated. National TB programme diagnosis and treatment are provided free at government facilities, but the NTP's own strategic plan records "the imposition of user fees for the chest x-ray" among current access barriers, so the app must tell people to ask the centre what is free instead of promising that every test is free.[^evaluation-6]

The wording must use “may” rather than promise a particular test, because available services differ between listed centres and the appropriate evaluation varies by person. Bangladesh NTP states that pulmonary TB cases require sputum examination with an NTP/WHO-recommended diagnostic tool, defines bacteriological confirmation through microscopy, culture, or WHO-recommended rapid diagnostics, and allows qualified physicians to make a clinical diagnosis based on strong clinical evidence when bacteriological criteria are not met.[^evaluation-1] WHO recommends a molecular WHO-recommended rapid diagnostic test as the initial diagnostic test for symptomatic adults and adolescents, while recognizing that further clinical assessment and additional testing may be needed.[^evaluation-2] WHO's March 2026 update added new near-point-of-care molecular tests and tongue-swab options, but Bangladesh programme adoption and availability must be confirmed before the app promises either option at a specific centre.[^evaluation-3]

[^safety-1]: Bangladesh National Tuberculosis Control Programme, [*National Guideline and Operational Manual for Tuberculosis*, sixth edition](https://www.ntp.gov.bd/wp-content/uploads/2021/10/Operational-Manual-for-Tuberculosis_compressed.pdf), October 2021, sections 3.3, 11.2, and 20.14.
[^safety-2]: World Health Organization, [“3.1.1 Symptom screening,” TB Knowledge Sharing Platform](https://tbksp.who.int/en/node/1406), based on the 2021 consolidated screening-guideline evidence review.
[^safety-3]: NHS, [“Coughing up blood”](https://www.nhs.uk/symptoms/coughing-up-blood/), reviewed 13 June 2024.
[^safety-4]: Bangladesh Police Telecom Organization, [“National Emergency Service 999”](https://telecom-police.portal.gov.bd/pages/static-pages/695e3b0cc4774958d7b72321), updated 1 December 2025.
[^safety-5]: Bangladesh National Tuberculosis Control Programme, [“Guidelines & SOP”](https://www.ntp.gov.bd/guidelines/), accessed 12 September 2026.
[^evaluation-1]: Bangladesh National Tuberculosis Control Programme, [*National Guideline and Operational Manual for Tuberculosis*, sixth edition](https://www.ntp.gov.bd/wp-content/uploads/2021/10/Operational-Manual-for-Tuberculosis_compressed.pdf), October 2021, sections 3.1 and 4.3.
[^evaluation-2]: World Health Organization, [“Algorithm 1 — WHO-recommended rapid diagnostics as initial diagnostic tests for TB,” TB Knowledge Sharing Platform](https://tbksp.who.int/en/node/3147), accessed 14 September 2026.
[^evaluation-3]: World Health Organization, [“WHO recommends near point-of-care tests, tongue swabs, and sputum pooling for TB diagnosis”](https://www.who.int/news/item/09-03-2026-who-recommends-near-point-of-care-tests--tongue-swabs--and-sputum-pooling-for-tb-diagnosis), 9 March 2026.
[^evaluation-4]: Bangladesh National Tuberculosis Control Programme, [*Tuberculosis Control in Bangladesh*](https://www.ntp.gov.bd/wp-content/uploads/2021/07/1487245939.pdf): presumptive TB cases bring a morning sputum specimen and a further specimen is collected on the spot at the DOTS centre.
[^evaluation-5]: World Health Organization, [“4.3.5.3 Molecular WHO-recommended rapid diagnostic tests for TB,” TB Knowledge Sharing Platform](https://tbksp.who.int/en/node/2189), accessed 14 September 2026: Xpert MTB/RIF reports in under two hours and Truenat MTB/MTB Plus in under an hour.
[^evaluation-6]: Bangladesh National Tuberculosis Control Programme, [*National Strategic Plan for Tuberculosis Control 2021–2025*](https://www.ntp.gov.bd/wp-content/uploads/2022/03/Clear_FINAL_NSP-Bangladesh-2021-2025.pdf), section 4 "Key Challenges", page 26: records both long delays between diagnosis and treatment initiation and "the imposition of user fees for the chest x-ray" as access barriers.

## 15. Main Screens

### Screen 1 — Main User / Landing Page
Lets anyone start screening from home or anywhere.

Also includes a pharmacy QR / assisted-access option.

### Screen 2 — Patient Companion / Chat
Collects consent, symptoms, cough audio, shows next steps, and supports follow-up.

### Screen 3 — Referral Page
Shows the chosen TB centre and referral ID / QR.

### Screen 4 — TB Centre Verification Page
Allows demo staff to confirm attendance.

### Screen 5 — Pharmacy Dashboard
Shows referral activity and simulated earnings.

### Screen 6 — Government / NTP Dashboard
Shows anonymous programme-level information and a privacy-safe geographic hotspot map.

Areas with unusually high potential-TB screening/referral activity can appear as red warning zones for public-health review.

### Screen 7 — Public Launch Page
Shows the product story and gathers public feedback / support.

## 16. Hackathon Success Criteria

Hypomatrix says final evaluation includes Product Quality, Innovation, User Experience, Marketing Effort, and Community Engagement.

### Product Quality
The full referral journey works without breaking.

### Innovation
The key innovation is the **closed-loop care pathway**, not simply cough AI.

### User Experience
A patient should understand what to do without learning a new app.

### Marketing Effort
The problem, name, visual identity, and one-line pitch should be memorable.

### Community Engagement
Collect real public feedback or partner interest without asking people to reveal private health information.

## 17. Demo Success Condition

A judge should be able to see this complete story in a few minutes:

**home / anywhere OR pharmacy → screening → cough → care navigation → formal referral → missed visit → follow-up → attendance verification → pharmacy reward when applicable → public-health hotspot dashboard update**

## 18. Suggested Simple Technology Choices

These are recommendations, not requirements.

- **Main website:** Next.js
- **Database and login:** Supabase
- **Hosting:** Vercel Hobby for the prototype
- **Map:** MapLibre
- **AI conversation:** Gemini API free tier or fixed responses if AI is unavailable
- **Messaging:** WhatsApp Business Platform and Telegram Bot API after the web flow works
- **Cough model:** Google HeAR only after the main product is stable

## 19. Useful Online Resources

### Hackathon
- Hypomatrix Hackathon: https://hackathon.hypomatrix.com/

### Bangladesh TB Programme
- National TB Programme: https://www.ntp.gov.bd/
- NTP TB laboratory list: https://www.ntp.gov.bd/laboratory/
- NTP Guidelines and SOPs: https://www.ntp.gov.bd/guidelines/
- National Strategic Plan for TB 2024–2030: https://www.ntp.gov.bd/guideline/national-strategic-plan-for-tb-control-2021-2025/
- National TB Guideline and Operational Manual: https://www.ntp.gov.bd/guideline/national-guide-lines-tb-6th-ed/

### Bangladesh Pharmacy / Referral Evidence
- Bangladesh TB delay study: https://pmc.ncbi.nlm.nih.gov/articles/PMC12212489/
- SMC Blue Star Program: https://smc-bd.org/blue-star-program-bsp-

### Similar Pharmacy TB Intervention
- Pharmacy TB referral study in Patna, India: https://pmc.ncbi.nlm.nih.gov/articles/PMC6528751/
- Review of pharmacy involvement in TB care: https://pmc.ncbi.nlm.nih.gov/articles/PMC9020292/

### Cough Audio
- Google HeAR overview: https://developers.google.com/health-ai-developer-foundations/hear
- HeAR model card: https://developers.google.com/health-ai-developer-foundations/hear/model-card
- HeAR getting started: https://developers.google.com/health-ai-developer-foundations/hear/get-started
- HeAR GitHub: https://github.com/Google-Health/hear
- HeAR PyTorch model: https://huggingface.co/google/hear-pytorch
- TBscreen data and reproducible code: https://zenodo.org/records/10431329
- CODA TB DREAM Challenge: https://www.synapse.org/TBcough
- Jaga investigational triage implementation: https://github.com/AMD-Hackathon-ISPM/jaga

### WhatsApp
- WhatsApp Developer Hub: https://whatsappbusiness.com/developers/developer-hub/
- WhatsApp Business Platform: https://whatsappbusiness.com/products/business-platform/
- WhatsApp pricing: https://whatsappbusiness.com/products/platform-pricing/

### Telegram
- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram webhooks: https://core.telegram.org/bots/webhooks

### Map
- MapLibre: https://maplibre.org/maplibre-gl-js/docs/

### Database / Hosting
- Supabase: https://supabase.com/
- Supabase pricing: https://supabase.com/pricing
- Vercel: https://vercel.com/
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby

### Optional Free AI
- Gemini API getting started: https://ai.google.dev/gemini-api/docs/get-started
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing

## 20. Final Product Positioning

**First Signs is not an AI TB diagnosis app. It is a simple, always-available TB screening and care-navigation companion that people can use from home or anywhere, while pharmacies provide assisted access for people who need it. The system helps users move from first concern to completed formal TB evaluation, gives pharmacies a fair reason to participate, and gives public-health authorities anonymous geographic signals that can help identify areas needing further investigation or additional TB service capacity.**
