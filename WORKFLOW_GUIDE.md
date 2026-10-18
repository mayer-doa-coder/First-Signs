# First Signs — Complete Workflow Guide

## Purpose and non-negotiable boundaries

First Signs is a bilingual, nationwide Bangladesh **screening and care-navigation prototype**. It does not diagnose TB, predict TB probability, confirm an outbreak, or manage treatment. Every workflow below follows the same boundaries:

- English is the default language; Bangla remains available on every user-facing screen.
- The fixed symptom rule, not AI or cough audio, determines the safety outcome.
- A person controls consent, answers, whether to create a referral, and whether to continue.
- Exact home address, patient GPS, raw cough audio, audio embeddings, public patient identity, raw Telegram chat IDs, raw WhatsApp numbers, and inbound free text are not retained in the documented persistence flows.
- A pharmacy credit reflects a valid workflow step only. It never reflects a TB diagnosis, positive test, or treatment result.
- A government red map signal means **high potential-TB screening activity — investigate**. It never means a confirmed outbreak.

## System map

```text
Web / Telegram / WhatsApp
             |
             v
Consent -> symptom answers -> optional audio -> fixed safety rule
             |                                      |
             |                                      +--> Continue with care guidance
             |                                      +--> Formal evaluation recommended
             |                                      +--> Urgent medical evaluation
             v
Patient chooses whether to create a referral
             |
             v
Referral + QR -> TB-centre staff verification -> completed attendance
             |                  |
             |                  +--> independent confirmation only
             v
Care companion -> missed-visit follow-up -> barrier-specific next action
             |
             +--> pharmacy aggregates / simulated credits when pharmacy-assisted
             +--> anonymous government aggregates and investigation signals
```

## 1. Entry and language workflows

### 1.1 Self-use web entry

1. A person opens the landing page and selects the self-use start action.
2. The app opens `/screen?source=self`.
3. The session is marked as self-use; no pharmacy is credited.
4. The user sees English first and can switch to Bangla with the persistent language control.
5. The person enters the shared screening workflow in section 2.

### 1.2 Pharmacy-assisted web entry

1. A pharmacy displays its dedicated QR code or opens its assisted link.
2. The link includes a validated active pharmacy identifier, for example `/screen?source=pharmacy&pharmacy=<id>`.
3. The page identifies the interaction as pharmacy-assisted. The person can use the pharmacy device without owning a smartphone or providing a phone number.
4. The pharmacy worker may help with the device only. Consent, symptom answers, and the referral decision remain the person's own.
5. The shared screening workflow begins. Only this source type can create pharmacy workflow credits.

### 1.3 Invalid or inactive pharmacy link

1. The system rejects a missing, malformed, inactive, or unrecognised pharmacy identifier.
2. It does not silently convert the interaction to self-use.
3. The user must start through a valid pharmacy link or deliberately choose self-use.

### 1.4 Language behaviour

- Website: English is initially selected; Bangla is always available.
- Telegram: English starts a new conversation. `BANGLA` changes it to Bangla; `ENGLISH` changes it back. `LANGUAGE` shows the language instruction.
- All changed content, errors, forms, alerts, status text, and controlled map labels require equivalent Bangla and English meaning. Bangla uses Noto Sans Bengali; English uses Merriweather.

## 2. Shared patient screening workflow

This workflow is used by the web app and, once configured, both messaging providers.

### 2.1 Consent

1. The person is told that First Signs provides screening and care navigation, not TB diagnosis.
2. The person is told they can stop at any time.
3. Consent is required before symptom questions.
4. If consent is declined or the person sends `STOP` in messaging, screening stops. No referral is created.
5. The person may later begin a new self-use session with the relevant start action.

### 2.2 Required questions

The person must provide all of the following before a fixed safety outcome is calculated:

1. Whole-number cough duration in days; `0` is valid when there is no cough.
2. Fever: yes or no.
3. Unusual night sweats: yes or no.
4. Unintentional weight loss: yes or no.
5. Blood in sputum: yes or no.
6. Close contact with a person known to have TB: yes or no.
7. Current division: one of Dhaka, Chattogram, Rajshahi, Khulna, Barishal, Sylhet, Rangpur, or Mymensingh.

Invalid, missing, or malformed answers keep the user on the relevant question. The system never guesses a missing answer or produces a safety outcome from an incomplete answer set. Only broad division data is requested; exact address and GPS are not required.

### 2.3 Fixed safety outcomes

The deterministic rule runs in this exact precedence order:

| Condition | Outcome | Required meaning |
| --- | --- | --- |
| Blood in sputum is `yes` | `URGENT_MEDICAL_EVALUATION` | Prompt medical evaluation is needed. With more than a few spots of blood, breathing difficulty, very fast heartbeat, or chest/upper-back pain, call 999 or go to an emergency department now. A referral is not an emergency replacement. |
| No blood in sputum, but cough is 14+ days, or fever, night sweats, weight loss, or TB exposure is `yes` | `FORMAL_TB_EVALUATION_RECOMMENDED` | Formal evaluation at a verified TB centre is recommended. This does not mean the person has TB. |
| None of the above | `CONTINUE_SCREENING` | The current answers did not meet the fixed urgent or formal-evaluation criteria. This does not rule out TB or another illness; seek care if symptoms persist or worsen. |

AI and acoustic processing cannot create, downgrade, or override any of these outcomes.

## 3. Optional cough-audio workflow

### 3.1 Web audio

1. After questions, the user may record a cough in the flow or upload an audio file.
2. The app requests microphone access only on trusted HTTPS sites (or localhost during development). If direct recording is unavailable, a supported native recorder/upload fallback is offered.
3. The file is checked for allowed audio type, valid container signature, minimum length, and size limit.
4. The app calculates a lowercase SHA-256 hash for duplicate-file review and sends transient bytes to the separate HeAR service when it is available.
5. Raw audio and the 512-value embedding are not persisted.

### 3.2 Telegram or WhatsApp audio

1. The provider sends a voice/audio identifier to the authenticated webhook.
2. The server accepts private Telegram chats only, safely downloads the transient provider file, and applies the same shared validation and SHA-256 process.
3. The same HeAR service is used when configured.
4. Provider file identifiers, media URLs, raw message text, and raw audio are not stored in the messaging-session tables.

### 3.3 Successful acoustic processing

The experimental service may return only:

- cough-like signal present;
- no cough-like signal detected; or
- inconclusive.

The result is displayed separately from the symptom outcome and never claims TB diagnosis or probability.

### 3.4 Audio unavailable, invalid, or failed

- Unsupported, too-short, oversized, or invalid files are rejected; the person can retry or skip the optional step.
- If model download, decode, inference, connectivity, or service startup fails, the user sees the symptom-based fallback and the care workflow continues.
- The current Cloudflare tunnel is an operational route to the laptop-hosted HeAR service. If it stops, changes URL, or loses connectivity, the app must show the fallback—not invent an audio result.

## 4. Referral and care-navigation workflows

### 4.1 Centre recommendation

1. The selected division is used only as a coarse location signal.
2. The app shows nearby verified TB-evaluation facilities across Bangladesh, with available service information where present.
3. The person may review centres without exposing an exact home location.

### 4.2 Referral creation

1. For urgent or formal-evaluation outcomes, the app offers a referral to a verified centre.
2. The person may accept or decline. Declining does not hide the urgent or formal-care advice.
3. If accepted, the backend transaction creates one referral ID, one access token, and a QR-capable referral view.
4. A failed transaction or idempotent retry does not consume a referral number. A successful referral begins as `PENDING`.
5. The person receives `/referral` and `/care` links. The referral ID/QR is intended for centre staff, not public sharing.

### 4.3 No-referral branch

1. If the person selects “not now,” the completed screening remains available in My Care.
2. No referral, attendance confirmation, or completion credit is created.
3. The person can still use care guidance and seek medical help independently.

### 4.4 My Care

`/care` reloads persisted screening, referral, attendance, and follow-up state rather than relying only on browser storage. It shows the current safety explanation, referral status, intended centre, and next action where available.

## 5. Referral status and follow-up workflows

### 5.1 Status lifecycle

| Status | Meaning | Next workflow |
| --- | --- | --- |
| `PENDING` | Referral exists; attendance has not been independently confirmed. | Attend the intended centre or use follow-up support. |
| `FOLLOW_UP` | Demo missed-attendance follow-up has been started. | Record one barrier and show a next action. |
| `COMPLETED` | Centre staff independently confirmed attendance and that formal evaluation started. | Show care expectations; this is not a diagnosis or test result. |
| `CLOSED` | Referral is no longer active. | No further verification or reward action is available for that referral. |

### 5.2 Missed-attendance flow

1. In the prototype, the user can select `Start demo follow-up` after a pending referral.
2. The referral moves to the follow-up path where eligible.
3. The user chooses one barrier: work schedule, centre too far, fear, stigma/discrimination, transport problem, did not understand, or other.
4. The app saves the barrier and presents the matching next action:
   - work → plan a practical visit time;
   - distance → review another nearby verified centre;
   - fear → explain what formal evaluation involves;
   - stigma → privacy and support guidance;
   - transport → travel-support or nearer-option guidance;
   - did not understand → explain why formal evaluation matters;
   - other → mark for human support.
5. “Human support” is a prototype marker; it does not notify a real support team automatically.

### 5.3 Messaging equivalents

- `STATUS` or `CARE` returns My Care status.
- `MISSED`, `FOLLOWUP`, or `FOLLOW-UP` starts the available follow-up path.
- The messaging user selects the numbered barrier and receives the same next action.

## 6. TB-centre staff verification workflow

1. Staff open `/verify` and scan the referral QR or enter its details manually.
2. The staff-only, server-side `TB_CENTRE_STAFF_PIN` is required in a request header; it is never placed in a URL, public variable, pharmacy screen, or log.
3. The system validates the referral lookup and shows only the staff-appropriate referral information.
4. A centre staff member confirms attendance once the person has arrived and formal evaluation has started.
5. The backend makes the confirmation transactional and idempotent. Reusing a completed/used referral cannot create another completion or reward.
6. Completion means attendance and formal evaluation started. It does not mean TB was diagnosed, a test was positive, or treatment began.

Failure branches include invalid QR/lookup, unavailable backend, missing or invalid staff PIN, referral not found, and a referral already completed or otherwise ineligible for confirmation. These failures must not disclose unnecessary patient information.

## 7. Pharmacy workflow

### 7.1 Allowed data and purpose

1. `/pharmacy` is an aggregate demo workspace for a selected pharmacy.
2. It shows only that pharmacy’s assisted-screening, referral, completion, credit, completion-rate, and integrity/review aggregates.
3. Self-use cases remain separate and do not appear as pharmacy activity.
4. This prototype dashboard is not a substitute for production pharmacy authentication and role authorization.

### 7.2 Simulated credit lifecycle

For a pharmacy-assisted case only, the system may create illustrative workflow credits for:

1. valid assisted screening;
2. appropriate referral; and
3. independently verified attendance.

No self-use pathway creates a pharmacy reward. No workflow reward depends on a positive TB result. Amounts remain illustrative; if no amount is configured, the dashboard does not invent one.

### 7.3 Fraud and review branches

| Event | System behaviour |
| --- | --- |
| Same patient would receive the same credit type within 30 days | Block only the repeat credit; continue screening, referral, and care. |
| Exact same audio hash is used again | Add a review warning only; it is not proof of fraud. |
| A pharmacy attempts to verify its own referral | Not permitted; independent TB-centre verification is required. |
| Referral code is reused | Do not create another confirmation or completion credit. |
| 10 pharmacy referrals in a rolling 24 hours | Mark only new credits `HELD_FOR_REVIEW`; do not alter older credits. This is a demo review signal, not proof of fraud. |

## 8. Government / public-health workflow

1. `/dashboard` reads programme-level aggregate data only.
2. It presents screenings, referrals, completed referrals, completion rate, pharmacy performance, area activity, and fraud/review counts.
3. The whole-Bangladesh map uses coarse division-level activity, not exact patient address or GPS.
4. Small counts are hidden or grouped to reduce re-identification risk.
5. A hotspot signal is calculated from repeated independent screening/referral activity in an area.
6. A red signal is labelled as an investigation signal. Appropriate possible responses include field investigation, awareness activity, mobile screening, or capacity review.
7. The dashboard must never label an area as a confirmed TB outbreak or expose patient-level data.

## 9. Community engagement workflow

1. A visitor opens `/community`.
2. The visitor selects one general barrier: work, distance, fear, stigma, lack of information, or transport.
3. The app stores the category, submission time, and an idempotency identifier only.
4. It does not ask for a name, phone number, free text, or the visitor’s TB status.
5. The page displays anonymous aggregate totals and category percentages. Totals are not claims about verified unique people.

## 10. Messaging and webhook workflows

### 10.1 Telegram

1. Telegram calls `POST /api/channels/telegram` over HTTPS.
2. The request must include the configured `X-Telegram-Bot-Api-Secret-Token`; invalid requests receive no workflow processing.
3. Only private chats and valid update/user identifiers are accepted.
4. A one-way HMAC channel key maintains continuity; raw chat IDs and inbound free text are not saved in messaging sessions.
5. Duplicate provider updates are idempotent and reuse the saved safe response.
6. `/start`, `/restart`, and `START SELF` start/restart self-use. Valid provider deep links can start a validated pharmacy-assisted source.
7. Unsupported update shapes or group chats receive no patient-flow response.

### 10.2 WhatsApp

1. Meta first verifies the callback with the configured verify token.
2. Each POST body is authenticated against `X-Hub-Signature-256` with the server-only app secret.
3. Valid messages enter the same screening, safety, referral, and follow-up logic as web and Telegram.
4. Invalid signatures, malformed payloads, or unavailable provider configuration do not enter the patient flow.

### 10.3 Provider outage or configuration gap

- If Telegram or WhatsApp is not configured, has a webhook failure, or is otherwise unavailable, use the web workflow as the patient-facing backup.
- Provider credentials, webhooks, and secrets remain server-only and are never committed.

## 11. AI companion workflow

1. The companion may explain screening, referral, and follow-up information in simple language.
2. It may help interpret free-text follow-up context only within the fixed workflow.
3. If the AI provider is unavailable, the fixed bilingual safety and workflow content remains usable.
4. AI never determines a symptom outcome, changes a referral criterion, diagnoses TB, or overrides an urgent instruction.

## 12. Operational and recovery workflow

### 12.1 Required deployment services

| Service | Responsibility | Failure behaviour |
| --- | --- | --- |
| Next.js web service | Website, authenticated APIs, referrals, messaging webhooks | Patient-facing web errors should be retried; do not claim a result that was not persisted. |
| Supabase | Persisted screening, referral, care, aggregate, and workflow state | Surface a safe unavailable state; do not substitute browser-only state as authoritative care status. |
| HeAR service (optional) | Experimental transient cough-presence analysis | Return symptom-based fallback; screening/referral safety remains available. |
| Cloudflare tunnel (current laptop-hosted HeAR route) | Temporary HTTPS route from Render to local HeAR | A stopped/restarted tunnel or changed URL makes HeAR unavailable until Render is updated; it must not block care navigation. |
| Telegram / WhatsApp | Optional entry channels | Keep web entry available. |

### 12.2 HeAR tunnel restart procedure

1. Confirm the local model service returns `GET /health` with `{"status":"ready"}`.
2. Start or confirm the Cloudflare tunnel to local port `8017`.
3. Verify `<tunnel-url>/health` returns `{"status":"ready"}`.
4. Set the rendered tunnel origin as `HEAR_SERVICE_URL` in the Render Next.js service.
5. Ensure the Render `HEAR_SERVICE_TOKEN` exactly matches the laptop service token; never put the token in a URL.
6. Redeploy Render and restart a new patient screening before testing audio.
7. If the tunnel URL changes, update Render and redeploy. A Quick Tunnel has no uptime guarantee; a named Cloudflare Tunnel is required for stable long-running use.

## 13. End-to-end scenario checklist

Use these scenarios to demonstrate or regression-test the full product.

1. **Self-use, no fixed referral criterion:** home entry → consent → complete valid answers with no formal criterion → skip or process audio → continue-care guidance → My Care.
2. **Self-use, formal evaluation:** home entry → 14+ day cough, fever, night sweats, weight loss, or exposure → optional audio → formal evaluation recommendation → accept referral → referral QR → My Care.
3. **Urgent safety path:** report blood in sputum → urgent medical evaluation instruction and 999/emergency warning where applicable → referral remains optional and does not replace urgent care.
4. **Referral declined:** formal/urgent recommendation → select not now → saved completed screening, no referral or credit.
5. **Pharmacy-assisted path:** valid pharmacy QR → person consents and answers → appropriate referral → pharmacy aggregate reflects the workflow; a self-use case never does.
6. **Independent attendance confirmation:** pending QR → `/verify` with valid staff PIN → one completed confirmation → updated My Care and eligible pharmacy completion credit.
7. **Invalid verification:** wrong/missing PIN, invalid QR, not-found referral, or reused code → no confirmation, no extra credit, no unnecessary disclosure.
8. **Missed visit:** pending referral → start demo follow-up → select every barrier option in turn → matching next action → My Care refresh.
9. **Audio success:** valid voice/audio → valid container/size → optional HeAR signal shown separately → same safety outcome as before audio.
10. **Audio fallback:** denied microphone, invalid audio, unavailable HeAR service, changed Cloudflare URL, or service timeout → clear fallback → symptom/referral flow continues.
11. **Telegram:** valid private `/start` → English consent → `BANGLA` switch → screening → voice or `SKIP` → care/referral; group messages and invalid webhook headers are rejected.
12. **WhatsApp:** verified callback and signed message → same shared patient flow; invalid signature or configuration failure remains outside the workflow.
13. **Duplicate and fraud cases:** repeat credit inside 30 days, reused audio, reused referral QR, pharmacy volume threshold → appropriate review/hold behaviour while care continues.
14. **Government privacy:** nationwide divisions render on the map; small counts remain protected; red hotspot is shown only as an investigation signal.
15. **Community feedback:** one anonymous category per submission → aggregate update; no TB-status, name, phone, or free-text collection.

## 14. Completion definition

A patient journey is complete only when the workflow has reached the appropriate persisted endpoint:

- screening completed with care guidance; or
- referral created and pending; or
- attendance independently verified and formal evaluation started; or
- follow-up barrier recorded with a next action; or
- the person deliberately stopped/declined, while retaining only the records permitted by the flow.

No branch may be described as a TB diagnosis, confirmed TB result, treatment start, confirmed outbreak, or real-money payment.
