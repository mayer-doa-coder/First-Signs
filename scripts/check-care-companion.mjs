import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
async function installScreeningBackend(pageContext) {
  await pageContext.route("**/api/screenings", async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ screening: { screeningId: input.screeningId, created: true, screeningRewardCreated: input.sourceType === "PHARMACY" } }) });
  });
}
async function installReferralUnavailableBackend(pageContext) {
  await pageContext.route("**/api/referrals*", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "TEST_REFERRAL_BACKEND_UNAVAILABLE" }),
    });
  });
}
async function installCareUnavailableBackend(pageContext) {
  await pageContext.route("**/api/care", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "TEST_CARE_BACKEND_UNAVAILABLE" }),
    });
  });
}
await installScreeningBackend(context);
await installCareUnavailableBackend(context);
await context.route("**/api/companion", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      result: {
        action: "EXPLAIN_NEXT_STEP",
        explanation: {
          bn: "পরবর্তী ধাপ হিসেবে নির্ধারিত সেবাকেন্দ্রে যাওয়ার একটি সুবিধাজনক সময় ঠিক করুন।",
          en: "For the next step, choose a practical time to attend the intended TB centre.",
        },
      },
    }),
  });
});
const referralRequests = [];
let mockedFollowUp = {
  referralId: "JVH-KHU-00991",
  referralStatus: "PENDING",
  status: null,
  barrier: null,
  nextAction: null,
  createdAt: null,
};
await context.route("**/api/referrals/follow-up*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  referralRequests.push(`${request.method()} ${url.pathname}`);
  if (request.method() === "POST") {
    mockedFollowUp = {
      ...mockedFollowUp,
      referralStatus: "FOLLOW_UP",
      status: "AWAITING_BARRIER",
      createdAt: "2026-09-15T18:20:00.000Z",
    };
  } else if (request.method() === "PATCH") {
    const { barrier } = request.postDataJSON();
    mockedFollowUp = {
      ...mockedFollowUp,
      referralStatus: "FOLLOW_UP",
      status: "ACTION_READY",
      barrier,
      nextAction: barrier === "WORK_SCHEDULE" ? "PLAN_SUITABLE_TIME" : "HUMAN_SUPPORT",
      createdAt: mockedFollowUp.createdAt ?? "2026-09-15T18:20:00.000Z",
    };
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ followUp: mockedFollowUp }) });
});
await installReferralUnavailableBackend(context);
const failures = [];
const runtimeErrors = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function watchRuntime(page) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 503")) {
      const sourceUrl = message.location().url;
      runtimeErrors.push(sourceUrl ? `${message.text()} (${sourceUrl})` : message.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500 && response.status() !== 503) {
      runtimeErrors.push(`HTTP ${response.status()} from ${response.url()}`);
    }
  });
}

async function open(path, pageContext = context) {
  const page = await pageContext.newPage();
  watchRuntime(page);
  const response = await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "networkidle" });
  check(response?.status() === 200, `${path} returned HTTP ${response?.status()}`);
  await page.getByRole("button", { name: "বাংলা" }).click();
  return page;
}

async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(size.scrollWidth <= size.clientWidth + 1, `${label} overflows horizontally (${size.scrollWidth}px > ${size.clientWidth}px)`);
}

/** Completes the Part 5–6 screening so a care record exists, then opens `/care`. */
async function screenAndOpenCare(page, { coughDays = "20", yesAnswers = [], referral = "continue" } = {}) {
  const consentStage = page.locator('[data-screening-stage="consent"]');
  await consentStage.locator('input[type="checkbox"]').check();
  await consentStage.locator('button[type="button"]').click();

  const questionsStage = page.locator('[data-screening-stage="questions"]');
  await questionsStage.locator("#cough-days").fill(coughDays);
  for (const group of ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"]) {
    await questionsStage.locator(`input[name="${group}"][value="${yesAnswers.includes(group) ? "yes" : "no"}"]`).check();
  }
  await questionsStage.locator('input[name="area"][value="Khulna"]').check();
  await questionsStage.locator('button[type="submit"]').click();

  await page.locator('[data-screening-stage="audio"]').getByRole("button", { name: "এখন অডিও দেব না" }).click();

  const referralStage = page.locator('[data-screening-stage="referral"]');
  await referralStage.locator(`input[name="referral-choice"][value="${referral}"]`).check();
  await referralStage.locator('button[type="submit"]').click();

  const completeStage = page.locator('[data-screening-stage="complete"]');
  await completeStage.waitFor({ state: "visible" });
  const patientId = (await completeStage.locator("code").textContent())?.trim();
  check(/^JVH-DEMO-[A-F0-9]{8}$/.test(patientId ?? ""), `Screening did not produce a demo patient ID (${patientId})`);

  await completeStage.getByRole("link", { name: /আমার সেবা|সেবার তথ্য দেখুন/ }).click();
  await page.locator("[data-patient-id]").waitFor({ state: "visible" });
  check((await page.locator("[data-patient-id]").textContent())?.trim() === patientId, "Care companion opened a different patient record");

  return patientId;
}

async function summaryText(page, name) {
  return (await page.locator(`[data-summary="${name}"]`).textContent())?.trim() ?? "";
}

// --- Self-use path: every Step 25 item, then every Step 27 action ----------------
const selfPage = await open("/screen?source=self");
const selfPatientId = await screenAndOpenCare(selfPage);

for (const [name, label] of [
  ["screening", "current screening status"],
  ["recommendation", "current recommendation"],
  ["referral", "referral status"],
  ["centre", "nearest selected TB centre"],
  ["next-action", "next action"],
  ["followup", "follow-up"],
]) {
  check((await selfPage.locator(`[data-summary="${name}"]`).count()) === 1, `My Care does not show the ${label}`);
}
check((await summaryText(selfPage, "screening")).includes("খুলনা বিভাগ"), "Screening status does not show the selected division");
check((await summaryText(selfPage, "screening")).includes("অডিও এইবার দেওয়া হয়নি"), "Screening status does not reflect the skipped cough audio");
check((await summaryText(selfPage, "recommendation")).includes("আনুষ্ঠানিক মূল্যায়নের পরামর্শ"), "Current recommendation does not match the fixed safety outcome");
check((await summaryText(selfPage, "referral")).includes("রেফারেলের পথে এগোতে প্রস্তুত"), "The referral choice made during screening is not shown on My Care");
check((await selfPage.locator("[data-next-action]").textContent())?.trim().length > 0, "No next action is shown");
check(!(await selfPage.locator("[data-followup-message]").count()), "A follow-up message is shown when no follow-up is needed");
check(!(await selfPage.getByText(/chance of TB|যক্ষ্মা শনাক্ত হয়েছে|যক্ষ্মা ধরা পড়েছে/i).count()), "My Care contains a prohibited diagnosis claim");
check(
  (await selfPage.locator(".next-action-card").textContent())?.includes("এই ফলাফলের অর্থ এই নয় যে আপনার যক্ষ্মা হয়েছে"),
  "My Care does not state that the recommendation is not a TB diagnosis",
);
await noOverflow(selfPage, "Mobile My Care");

// Action: view TB centre and select one.
check(!(await selfPage.locator("#care-centre-panel").count()), "The TB-centre panel is open before it is requested");
await selfPage.locator('[data-action="view-centre"]').click();
await selfPage.locator("#care-centre-panel").waitFor({ state: "visible" });
check((await summaryText(selfPage, "centre")).includes("আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল"), "Khulna Division did not preselect its nearest listed TB centre");
await selfPage.locator("#care-centre").selectOption("NTP-KHL-RUPSHA");
await selfPage.locator('[data-care-feedback]').waitFor({ state: "visible" });
check((await summaryText(selfPage, "centre")).includes("রূপসা"), "Choosing a different TB centre did not update the care summary");
await noOverflow(selfPage, "Mobile TB-centre panel");

// Action: check referral status.
await selfPage.locator('[data-action="check-referral"]').click();
check((await selfPage.locator("[data-care-feedback]").textContent())?.includes("বর্তমান রেফারেল অবস্থা"), "Check referral status gave no status answer");

// A missed visit only exists once a real referral does (Part 9/10): while the
// person has merely recorded the intention to continue, there is no visit to miss.
check(
  (await selfPage.locator('[data-action="missed-visit"]').count()) === 0,
  "A missed-visit action is offered before any referral exists",
);

// Put the saved record into the PENDING state and attach the limited referral
// view that the Part 12 endpoint identifies by its opaque access token.
await selfPage.evaluate((patientId) => {
  const key = `jvh-care-v1:${patientId}`;
  const record = JSON.parse(localStorage.getItem(key) ?? "null");
  if (!record) throw new Error("care record missing");
  record.referralStatus = "PENDING";
  record.referral = {
    referralId: "JVH-KHU-00991",
    accessToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    status: "PENDING",
    tbCenterId: "NTP-KHL-RUPSHA",
    centreName: "Rupsha Upazila Health Complex",
    centreArea: "Rupsha",
    centreDistrict: "Khulna",
    serviceType: "Microscopy",
    createdAt: "2026-09-15T18:00:00.000Z",
    rewardCreated: false,
  };
  record.updatedAt = new Date().toISOString();
  localStorage.setItem(key, JSON.stringify(record));
}, selfPatientId);
await selfPage.reload({ waitUntil: "networkidle" });
await selfPage.getByRole("button", { name: "বাংলা" }).click();
await selfPage.locator("[data-patient-id]").waitFor({ state: "visible" });

// Step 39: presentation-only time simulation persists FOLLOW_UP and opens the
// Step 40 barrier question.
const simulationCount = await selfPage.locator('[data-action="simulate-24-hours"]').count();
if (simulationCount !== 1) {
  const storedState = await selfPage.evaluate((patientId) => {
    const record = JSON.parse(localStorage.getItem(`jvh-care-v1:${patientId}`) ?? "null");
    return { referralStatus: record?.referralStatus, hasReferral: Boolean(record?.referral) };
  }, selfPatientId);
  const renderedStatus = await summaryText(selfPage, "referral");
  const renderedActions = await selfPage.locator(".care-action-grid").textContent();
  throw new Error(`Expected one time-simulation action; rendered ${simulationCount}. Stored state: ${JSON.stringify(storedState)}. Rendered status: ${renderedStatus}. Actions: ${renderedActions}`);
}
await selfPage.locator('[data-action="simulate-24-hours"]').click();
await selfPage.waitForTimeout(500);
if (!(await selfPage.locator("[data-followup-message]").count())) {
  throw new Error(`Follow-up did not appear after simulation. Feedback: ${await selfPage.locator("[data-care-feedback]").textContent().catch(() => "none")}. Requests: ${referralRequests.join(", ")}. Runtime: ${runtimeErrors.join(", ")}`);
}
check((await summaryText(selfPage, "followup")).includes("প্রয়োজন"), "Reporting a missed visit did not set follow-up");
check((await summaryText(selfPage, "referral")).includes("ফলো-আপ প্রয়োজন"), "Reporting a missed visit did not update the referral status");
check((await selfPage.locator("[data-followup-message]").textContent())?.includes("রূপসা"), "The follow-up message does not name the selected centre");
check(await selfPage.locator("[data-followup-question]").isVisible(), "The missed-referral barrier question did not appear");

// Steps 40–41: save one required barrier and show its deterministic action.
await selfPage.locator('input[name="followup-barrier"][value="WORK_SCHEDULE"]').check();
await selfPage.locator('[data-followup-question] button[type="submit"]').click();
await selfPage.locator("[data-followup-action]").waitFor({ state: "visible" });
check((await selfPage.locator("[data-followup-action]").textContent())?.includes("যেতে পারবেন এমন দিন ও সময়"), "Work-schedule barrier did not show its next action");
check(!(await selfPage.locator('[data-action="simulate-24-hours"]').count()), "Time simulation remained available after follow-up started");

// Action: ask what to do next.
await selfPage.locator('[data-action="explain-next"]').click();
await selfPage.locator("[data-care-feedback]").filter({ hasText: "AI সহায়কের" }).waitFor({ state: "visible" });
check((await selfPage.locator("[data-care-feedback]").textContent())?.includes("পরবর্তী ধাপ"), "Ask what to do next gave no next-step answer");

// Changes must survive a reload of the same care link.
await selfPage.reload({ waitUntil: "networkidle" });
await selfPage.getByRole("button", { name: "বাংলা" }).click();
await selfPage.locator("[data-patient-id]").waitFor({ state: "visible" });
check((await summaryText(selfPage, "centre")).includes("রূপসা"), "The selected TB centre was lost after reloading My Care");
check((await summaryText(selfPage, "referral")).includes("ফলো-আপ প্রয়োজন"), "The database follow-up status was lost after reloading My Care");
check(await selfPage.locator("[data-followup-action]").isVisible(), "The saved barrier action was lost after reloading My Care");

// English must carry the same care meaning.
await selfPage.getByRole("button", { name: "English" }).click();
check(await selfPage.getByText("Follow-up needed").first().isVisible(), "English referral status is missing");
check(await selfPage.getByText("Formal evaluation recommended").first().isVisible(), "English recommendation is missing");
check(await selfPage.getByRole("button", { name: "Continue to referral" }).first().isVisible(), "English check-up actions are missing");
check(await selfPage.getByText("Plan a day and time you can attend").first().isVisible(), "English follow-up action is missing");
await noOverflow(selfPage, "English mobile My Care");
await selfPage.getByRole("button", { name: "বাংলা" }).click();

// Step 26: save a phone number, then reopen care with it.
await selfPage.locator("#care-phone").fill("12345");
await selfPage.locator(".care-phone-form button[type=submit]").click();
check(await selfPage.locator(".care-phone-form .care-form-error").isVisible(), "An invalid mobile number was accepted");
await selfPage.locator("#care-phone").fill("01712345678");
await selfPage.locator(".care-phone-form button[type=submit]").click();
check((await selfPage.locator("[data-care-feedback]").textContent())?.includes("01712345678"), "Saving the mobile number was not confirmed");
await selfPage.close();

const wrongIdPage = await open("/care?patient=JVH-DEMO-00000000&source=self");
check(await wrongIdPage.locator("#care-lookup-value").isVisible(), "An unknown patient ID did not fall back to the care lookup");
await wrongIdPage.locator("#care-lookup-value").fill("01712345678");
await wrongIdPage.locator(".care-lookup-form button[type=submit]").click();
await wrongIdPage.locator("[data-patient-id]").waitFor({ state: "visible" });
check((await wrongIdPage.locator("[data-patient-id]").textContent())?.trim() === selfPatientId, "Reopening care by mobile number opened the wrong record");
check(wrongIdPage.url().includes(selfPatientId ?? "nope"), "Reopening by mobile number did not restore a shareable care link");
await wrongIdPage.close();

// `My Care` in the navigation must work without any link parameters.
const navCarePage = await open("/care");
check((await navCarePage.locator("[data-patient-id]").textContent())?.trim() === selfPatientId, "Self-use My Care did not reopen the person's own record");
await navCarePage.locator('[data-action="clear-care"]').click();
await navCarePage.locator("#care-lookup-value").waitFor({ state: "visible" });
await navCarePage.locator("#care-lookup-value").fill(selfPatientId ?? "");
await navCarePage.locator(".care-lookup-form button[type=submit]").click();
check(await navCarePage.locator(".care-lookup-form .care-form-error").isVisible(), "Cleared browser care copy reopened while the backend was unavailable");
await navCarePage.close();

// --- Pharmacy-assisted path ------------------------------------------------------
const assistedPage = await open("/screen?source=pharmacy&pharmacy=DEMO-KHL-RAHMAN");
const assistedPatientId = await screenAndOpenCare(assistedPage, { referral: "continue" });
check((await assistedPage.locator(".care-identity-card").textContent())?.includes("রহমান ফার্মেসি"), "The assisted care session does not name the helping pharmacy");
check((await summaryText(assistedPage, "recommendation")).includes("আনুষ্ঠানিক মূল্যায়নের পরামর্শ"), "The assisted person does not get the same recommendation");
check((await assistedPage.locator('[data-action="continue-referral"]').count()) === 1, "The assisted person cannot continue to referral");
await assistedPage.locator('[data-action="check-referral"]').click();
check((await assistedPage.locator("[data-care-feedback]").textContent())?.includes("বর্তমান রেফারেল অবস্থা"), "Assisted check-up support does not answer referral status");
await noOverflow(assistedPage, "Mobile assisted My Care");

// The same persisted follow-up workflow is available during a pharmacy-assisted
// session. Use the person's direct "I could not attend" action and the OTHER
// path, which must be honest that real human outreach is still mocked.
mockedFollowUp = {
  referralId: "JVH-KHU-00992",
  referralStatus: "PENDING",
  status: null,
  barrier: null,
  nextAction: null,
  createdAt: null,
};
await assistedPage.evaluate((patientId) => {
  const key = `jvh-care-v1:${patientId}`;
  const record = JSON.parse(sessionStorage.getItem(key) ?? "null");
  if (!record) throw new Error("assisted care record missing");
  record.referralStatus = "PENDING";
  record.referral = {
    referralId: "JVH-KHU-00992",
    accessToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    status: "PENDING",
    tbCenterId: record.selectedCentreId,
    centreName: "Khulna Medical College Hospital (KMCH)",
    centreArea: "Sonadanga",
    centreDistrict: "Khulna",
    serviceType: "Microscopy",
    createdAt: "2026-09-15T18:10:00.000Z",
    rewardCreated: true,
  };
  record.updatedAt = new Date().toISOString();
  sessionStorage.setItem(key, JSON.stringify(record));
}, assistedPatientId);
await assistedPage.reload({ waitUntil: "networkidle" });
await assistedPage.getByRole("button", { name: "বাংলা" }).click();
await assistedPage.locator('[data-action="missed-visit"]').click();
await assistedPage.locator("[data-followup-question]").waitFor({ state: "visible" });
await assistedPage.locator('input[name="followup-barrier"][value="OTHER"]').check();
await assistedPage.locator('[data-followup-question] button[type="submit"]').click();
check((await assistedPage.locator("[data-followup-action]").textContent())?.includes("মানবিক সহায়তার জন্য চিহ্নিত"), "Assisted OTHER barrier was not marked for human support");
check((await assistedPage.locator("[data-followup-action]").textContent())?.includes("কোনো বাস্তব সহায়তা দলকে"), "Prototype human-support limitation is not disclosed");
await noOverflow(assistedPage, "Mobile assisted follow-up");

const assistedCareLink = `/care?patient=${assistedPatientId}&source=pharmacy&pharmacy=DEMO-KHL-RAHMAN`;

// A different pharmacy must not open this person's care, even on the same device.
await assistedPage.goto(new URL(`/care?patient=${assistedPatientId}&source=pharmacy&pharmacy=DEMO-KHL-CITY`, baseUrl).toString(), { waitUntil: "networkidle" });
check(await assistedPage.locator("#care-lookup-value").isVisible(), "Another pharmacy could open an assisted care record");

// The same pharmacy session keeps the care information available.
await assistedPage.goto(new URL(assistedCareLink, baseUrl).toString(), { waitUntil: "networkidle" });
await assistedPage.getByRole("button", { name: "বাংলা" }).click();
await assistedPage.locator("[data-patient-id]").waitFor({ state: "visible" });
check((await assistedPage.locator("[data-patient-id]").textContent())?.trim() === assistedPatientId, "Care information is not available during the pharmacy session");
check((await summaryText(assistedPage, "referral")).includes("ফলো-আপ প্রয়োজন"), "The assisted follow-up status was lost inside the pharmacy session");
check(await assistedPage.locator("[data-followup-action]").isVisible(), "The assisted next action was lost inside the pharmacy session");

// `My Care` without link parameters must still work inside the pharmacy session.
await assistedPage.goto(new URL("/care", baseUrl).toString(), { waitUntil: "networkidle" });
await assistedPage.locator("[data-patient-id]").waitFor({ state: "visible" });
check((await assistedPage.locator("[data-patient-id]").textContent())?.trim() === assistedPatientId, "The pharmacy session could not reopen care without link parameters");

// The next person on the shared device must not see the previous session.
const nextPersonPage = await open(assistedCareLink);
check(await nextPersonPage.locator("#care-lookup-value").isVisible(), "A new session on the shared device could still open the previous person's care");
const nextPersonDefaultCare = await open("/care");
check(await nextPersonDefaultCare.locator("[data-patient-id]").count() === 0, "A new session on the shared device opened somebody else's care automatically");
await nextPersonPage.close();
await nextPersonDefaultCare.close();

// Self-use care in this browser must not leak into the pharmacy session either.
check(!(await assistedPage.locator(".care-identity-card").textContent())?.includes("JVH-DEMO-0000"), "Pharmacy-assisted care mixed up patient records");

await assistedPage.locator('[data-action="clear-care"]').click();
await assistedPage.locator("#care-lookup-value").waitFor({ state: "visible" });
check(!(await assistedPage.locator("[data-patient-id]").count()), "Ending the pharmacy session did not clear the care information");
await assistedPage.close();

// --- Urgent outcome must stay visible on the companion ---------------------------
const urgentPage = await open("/screen?source=self");
await screenAndOpenCare(urgentPage, { coughDays: "0", yesAnswers: ["bloodInSputum"], referral: "not-now" });
check(await urgentPage.locator(".care-emergency-card").isVisible(), "The urgent safety guidance is missing on My Care");
check((await urgentPage.locator(".care-emergency-card").textContent())?.includes("৯৯৯"), "The urgent guidance does not give the Bangladesh emergency number");
check((await summaryText(urgentPage, "referral")).includes("রেফারেল তৈরি হয়নি"), "Declining a referral was not respected on My Care");
check((await urgentPage.locator('[data-action="continue-referral"]').count()) === 1, "An urgent case cannot choose a TB referral later");
await urgentPage.getByRole("button", { name: "English" }).click();
check(await urgentPage.getByText(/call Bangladesh National Emergency Service 999/i).first().isVisible(), "English urgent guidance is missing on My Care");
check(await urgentPage.getByText(/does not replace emergency care/i).first().isVisible(), "My Care does not separate a TB referral from emergency care");
await urgentPage.close();

// --- Continue-screening outcome must not offer a referral ------------------------
const continuePage = await open("/screen?source=self");
await screenAndOpenCare(continuePage, { coughDays: "3", referral: "continue" });
check((await summaryText(continuePage, "referral")).includes("রেফারেল তৈরি হয়নি"), "A referral was offered without a fixed referral criterion");
check((await continuePage.locator('[data-action="continue-referral"]').count()) === 0, "Continue to referral is offered when no criterion is met");
check((await continuePage.locator('[data-action="missed-visit"]').count()) === 0, "A missed-visit action is offered without a referral");
await continuePage.locator('[data-action="explain-next"]').click();
check((await continuePage.locator("[data-care-feedback]").textContent())?.includes("উপসর্গ"), "Ask what to do next gives no guidance for a continue-screening result");
await continuePage.close();

// --- Larger screens ---------------------------------------------------------------
for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "computer", width: 1280, height: 900 }]) {
  const deviceContext = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await installScreeningBackend(deviceContext);
  await installCareUnavailableBackend(deviceContext);
  await installReferralUnavailableBackend(deviceContext);
  const devicePage = await open("/screen?source=self", deviceContext);
  await screenAndOpenCare(devicePage);
  check(await devicePage.locator("[data-next-action]").isVisible(), `The next action is not visible on a ${viewport.name}`);
  await noOverflow(devicePage, `My Care on a ${viewport.name}`);
  await deviceContext.close();
}

await context.close();
await browser.close();

for (const runtimeError of runtimeErrors) failures.push(`Browser runtime error: ${runtimeError}`);

if (failures.length) {
  console.error("Care-companion check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Self-use and pharmacy-assisted care companions passed.");
  console.log("Screening status, recommendation, referral status, TB centre, next action, and follow-up message passed.");
  console.log("Check-up actions, centre selection, reopening by ID or number, session clearing, and mobile layout passed.");
}
