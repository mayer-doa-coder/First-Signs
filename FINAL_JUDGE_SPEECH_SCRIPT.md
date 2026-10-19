# First Signs — Final Judge Video Speech Script

**Deck matched:** `First_Signs_Judge_Presentation.pptx` from the final Downloads version  
**Target duration:** about **4 minutes 48 seconds**  
**Sequence:** Title → Maya animation → Slides 3–6 → product recording → Slides 7–8

## Timing at a glance

| Time | Visual | Purpose |
| --- | --- | --- |
| 0:00–0:04 | Slide 1 | Introduce the project. |
| 0:04–0:24 | Slide 2 video | Create a human connection through Maya’s story. |
| 0:24–0:44 | Slide 3 | State the real-world problem. |
| 0:44–1:03 | Slide 4 | Introduce the solution. |
| 1:03–1:21 | Slide 5 | Explain the care journey in plain language. |
| 1:21–1:44 | Slide 6 | Explain the technical architecture and safeguards. |
| 1:44–3:39 | Screen recording | Demonstrate the working product. |
| 3:39–4:04 | Slide 7 | Explain the differentiation. |
| 4:04–4:38 | Slide 8 | Explain the responsible roadmap and close. |
| 4:38–4:48 | Slide 8 | Hold the final message and QR/link. |

---

## 0:00–0:04 — Slide 1: First Signs

**On screen:** `FIRST SIGNS — From a warning sign to appropriate care`.

**Say:**

> This is First Signs: turning warning signs into appropriate care.

## 0:04–0:24 — Slide 2: Maya animation

**On screen:** Play the embedded 20-second Maya animation full screen.

**Say:**

> Meet Maya, a garment worker and mother in Khulna. She has been coughing for more than two weeks. Missing work costs income. A nearby pharmacy is easy to reach, yet it cannot fully examine her or tell her where to go next. First Signs turns this uncertainty into a practical path to appropriate care.

## 0:24–0:44 — Slide 3: People can be lost at every handoff

**On screen:** Slide 3. Point from left to right across the four problem cards.

**Say:**

> Maya’s situation is not only an information problem. People can be lost at every handoff: they may not know whether a concern is urgent, where to go, how to keep a referral, or what to do after work, cost, distance, or fear causes a missed visit.

## 0:44–1:03 — Slide 4: One connected journey, two ways to begin

**On screen:** Slide 4. Point first to the two entry routes, then to the five pathways.

**Say:**

> First Signs is a bilingual, mobile-first care-navigation platform for Bangladesh. A person can start independently or with help from a participating pharmacy. It supports respiratory, fever, diarrhoea or dehydration, skin or nerve, and child-breathing concerns. Both entry routes lead into one connected workflow in English and Bangla. This is screening and care navigation, never a diagnosis.

## 1:03–1:21 — Slide 5: From concern to completed handoff

**On screen:** Slide 5. Follow the six boxes from left to right with the cursor.

**Say:**

> The care journey is simple: choose a concern, give consent, answer focused questions, and receive clear next-step guidance. The person can select a listed facility and create a private referral with an ID, token, and QR code. The intended facility records attendance, and missed visits receive follow-up support.

## 1:21–1:44 — Slide 6: Safety-first technical architecture

**On screen:** Slide 6. Point to access channels, then the central application, then Supabase and the optional services.

**Say:**

> Technically, web, mobile, and Telegram access all connect to one First Signs application. Next.js, React, and TypeScript run the bilingual interface, fixed safety rules, and care-navigation workflow. Supabase and PostgreSQL manage authentication, private records, role-based access, and scoped reporting. Maps, AI explanations, reminders, and audio are optional extensions; none can change the safety outcome.

## 1:44–3:39 — Web-app screen recording

Begin the screen recording on the landing page. Keep the cursor deliberate. Use only sample data and do not show real names, phone numbers, private tokens, credentials, or patient records.

### 1:44–1:55 — Landing page and language

**Show:** Landing page. Briefly show the English/Bangla control, then select self-use.

**Say:**

> Now let’s see the journey in the working product. The platform is available in English and Bangla, and a person can begin independently or through a pharmacy-assisted route. I’ll use self-use for this example.

### 1:55–2:10 — Consent and pathway choice

**Show:** Screening introduction, consent, then select the respiratory pathway.

**Say:**

> Before screening, First Signs explains consent and its limits. Maya selects a persistent respiratory concern. The questions are pathway-specific, so the system asks only for information needed to guide the next care step.

### 2:10–2:26 — Focused questions

**Show:** The questionnaire. Use prepared sample answers, including cough for 14 or more days.

**Say:**

> Maya answers focused warning-sign questions, including that the cough has continued for more than two weeks. The system does not guess a disease from symptoms. It applies fixed, reviewable rules to decide the appropriate action.

### 2:26–2:40 — Guidance outcome

**Show:** The guidance outcome. Pause so the action is readable.

**Say:**

> The result recommends professional evaluation. Notice the boundary: it clearly explains what Maya should do, but it does not say that she has TB or prescribe treatment. If urgent danger signs are present, they always take priority.

### 2:40–2:53 — Facility and referral

**Show:** Facility selection, then the referral ticket with ID and QR code.

**Say:**

> Maya can choose an appropriate listed facility and create a portable referral. The referral has a public ID, a private access token, and a QR code, so the handoff is not only verbal or easy to lose.

### 2:53–3:05 — My Care and missed-visit support

**Show:** My Care and the missed-visit barrier or next-action section.

**Say:**

> My Care keeps the journey private and accessible. If work, transport cost, distance, fear, or another barrier prevents the visit, First Signs helps identify the barrier and supports the next attempt.

### 3:05–3:19 — Independent verification

**Show:** Verification workspace with a prepared sample referral.

**Say:**

> At the intended facility, authorized staff can record that the person arrived and formal evaluation began. This is independent: an assisting pharmacy cannot verify its own referral, and attendance is not a diagnosis or treatment result.

### 3:19–3:31 — Pharmacy and public-health views

**Show:** Pharmacy workspace, followed by the public-health or admin dashboard.

**Say:**

> Pharmacies see only their own eligible workflow activity and simulated credits. Public-health teams see grouped, broad-area investigation signals—not names, raw answers, referral tokens, exact GPS, or confirmed outbreaks.

### 3:31–3:39 — Transition

**Show:** Return to Slide 7.

**Say:**

> This is how First Signs moves from information to a more accountable path to care.

## 3:39–4:04 — Slide 7: Not another standalone health tool

**On screen:** Slide 7. Read the left side quickly, then give emphasis to the connected journey on the right.

**Say:**

> A symptom checker, chatbot, map, or referral form can each be useful, but they often stop at one point. First Signs connects the full journey: warning sign to clear next step, facility to portable referral, referral to independent attendance confirmation, and missed visit to follow-up. Bilingual access, fixed rules, role separation, and privacy-safe reporting make that journey more trustworthy.

## 4:04–4:38 — Slide 8: A responsible path from prototype to impact

**On screen:** Slide 8. Point to Validate, Strengthen, and Pilot responsibly. End on the vision statement.

**Say:**

> First Signs is a functional hackathon prototype, not clinical deployment. Next, we will validate it through independent clinical and Bangla-language review and usability studies. Then we will strengthen verified facility data, accessibility, and low-bandwidth performance. Finally, we will pursue carefully governed pilots and evaluate both impact and privacy. Our vision is simple: no one should be lost between noticing a warning sign and reaching appropriate care.

## 4:38–4:48 — Ending frame

**On screen:** Keep Slide 8 visible. Show a working QR code or clear link to the live prototype and repository.

**Say:**

> Thank you.

## Final recording checks

- Verify that Slide 2’s animation starts automatically in Slide Show mode.
- Replace any QR placeholder on the final slide with a tested QR code or readable live-demo/repository URL.
- Use sample records only; never expose real personal information, referral tokens, or credentials.
- Export at 1080p, with captions if possible.
- If the recording runs over five minutes, shorten Slide 6 first. Do not remove the explanation that the product is non-diagnostic or privacy-conscious.
