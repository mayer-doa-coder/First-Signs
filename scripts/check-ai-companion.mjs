import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const failures = [];
const runtimeErrors = [];
const aiRequests = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function careRecord(patientId, outcome = "FORMAL_TB_EVALUATION_RECOMMENDED") {
  const suffix = patientId.slice(-8).toLowerCase().padEnd(32, "a");
  const referralId = patientId.endsWith("02") ? "JVH-KHU-00802" : "JVH-KHU-00801";
  const accessToken = patientId.endsWith("02")
    ? "22222222-2222-4222-8222-222222222222"
    : "11111111-1111-4111-8111-111111111111";
  const record = {
    version: 1,
    patientId,
    source: "self",
    area: "Sonadanga",
    screeningOutcome: outcome,
    symptomAnswers: {
      coughDays: outcome === "URGENT_MEDICAL_EVALUATION" ? 3 : 14,
      fever: false,
      nightSweats: false,
      weightLoss: false,
      bloodInSputum: outcome === "URGENT_MEDICAL_EVALUATION",
      tbExposure: false,
    },
    screeningId: `JVH-SCR-${suffix}`,
    audioChoice: "skipped",
    referralStatus: "FOLLOW_UP_NEEDED",
    selectedCentreId: "NTP-KHL-KMCH",
    referral: {
      referralId,
      accessToken,
      status: "FOLLOW_UP",
      tbCenterId: "NTP-KHL-KMCH",
      centreName: "Khulna Medical College Hospital (KMCH)",
      centreArea: "Sonadanga",
      centreDistrict: "Khulna",
      serviceType: "Microscopy",
      createdAt: "2026-10-14T08:00:00.000Z",
      rewardCreated: false,
      rewardEligible: false,
      rewardStatus: null,
      rewardWarning: null,
      possibleReusedAudio: false,
      activityRequiresReview: false,
    },
    followUp: {
      referralId,
      referralStatus: "FOLLOW_UP",
      status: "AWAITING_BARRIER",
      barrier: null,
      nextAction: null,
      createdAt: "2026-10-14T09:00:00.000Z",
    },
    followUpNeeded: true,
    createdAt: "2026-10-14T07:00:00.000Z",
    updatedAt: "2026-10-14T09:00:00.000Z",
  };
  return record;
}

const formalRecord = careRecord("JVH-DEMO-A1000001");
const unavailableRecord = careRecord("JVH-DEMO-A1000002");
const urgentRecord = careRecord("JVH-DEMO-A1000003", "URGENT_MEDICAL_EVALUATION");

await context.addInitScript(({ records }) => {
  for (const record of records) {
    localStorage.setItem(`jvh-care-v1:${record.patientId}`, JSON.stringify(record));
  }
}, { records: [formalRecord, unavailableRecord, urgentRecord] });

await context.route("**/api/care", async (route) => {
  await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "TEST_CARE_UNAVAILABLE" }) });
});

await context.route("**/api/referrals/follow-up*", async (route) => {
  const patientRecord = route.request().url().includes("22222222") ? unavailableRecord : formalRecord;
  if (route.request().method() === "PATCH") {
    const { barrier } = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        followUp: {
          ...patientRecord.followUp,
          status: "ACTION_READY",
          barrier,
          nextAction: barrier === "WORK_SCHEDULE" ? "PLAN_SUITABLE_TIME" : "HUMAN_SUPPORT",
        },
      }),
    });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ followUp: patientRecord.followUp }) });
});

await context.route("**/api/referrals?*", async (route) => {
  await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "TEST_REFERRAL_UNAVAILABLE" }) });
});

await context.route("**/api/companion", async (route) => {
  const input = route.request().postDataJSON();
  aiRequests.push(input);
  if (input.text?.includes("offline")) {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "AI_NOT_CONFIGURED" }) });
    return;
  }
  const result = input.action === "CLASSIFY_BARRIER"
    ? {
        action: "CLASSIFY_BARRIER",
        barrier: "WORK_SCHEDULE",
        explanation: { bn: "কাজ থেকে ছুটি না পাওয়া কাজের সময়ের বাধা।", en: "Not receiving leave from work is a work-schedule barrier." },
      }
    : {
        action: "EXPLAIN_NEXT_STEP",
        explanation: { bn: "আপনার সুবিধাজনক দিন ঠিক করে রেফারেল কিউআর সঙ্গে নিন।", en: "Choose a practical day and take the referral QR with you." },
      };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result }) });
});

function watch(page) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 503")) runtimeErrors.push(message.text());
  });
}

async function open(patientId) {
  const page = await context.newPage();
  watch(page);
  const response = await page.goto(`${baseUrl}/care?patient=${patientId}&source=self`, { waitUntil: "networkidle" });
  check(response?.status() === 200, `Care route returned HTTP ${response?.status()}`);
  await page.getByRole("button", { name: "বাংলা" }).click();
  await page.locator("[data-patient-id]").waitFor({ state: "visible" });
  return page;
}

const page = await open(formalRecord.patientId);
await page.locator("#followup-free-text").fill("অফিস থেকে ছুটি পাইনি");
await page.locator('[data-action="interpret-barrier"]').click();
await page.locator("[data-ai-barrier-result]").waitFor({ state: "visible" });
check(await page.locator('input[name="followup-barrier"][value="WORK_SCHEDULE"]').isChecked(), "AI did not select WORK_SCHEDULE");
check((await page.locator("[data-ai-barrier-result]").textContent())?.includes("পরামর্শ দিয়েছে"), "AI suggestion is not clearly labelled");
check((await page.locator("[data-ai-barrier-result] [lang=bn]").evaluate((element) => getComputedStyle(element).fontFamily)).includes("Noto Sans Bengali"), "Bangla AI result does not use Noto Sans Bengali");
check((await page.locator("[data-followup-action]").count()) === 0, "AI suggestion saved a barrier without user confirmation");
check((await page.locator('[data-summary="recommendation"]').textContent())?.includes("নির্দিষ্ট নিরাপত্তা নিয়মে নির্ধারিত"), "AI changed the fixed safety result");

await page.locator('[data-followup-question] button[type="submit"]').click();
await page.locator("[data-followup-action]").waitFor({ state: "visible" });
check((await page.locator("[data-followup-action]").textContent())?.includes("যেতে পারবেন এমন দিন"), "Confirmed AI category did not use the fixed next-action mapping");

await page.locator('[data-action="explain-next"]').click();
await page.locator("[data-care-feedback]").getByText(/AI সহায়কের সহজ ব্যাখ্যা/).waitFor({ state: "visible" });
check((await page.locator("[data-care-feedback]").textContent())?.includes("AI সহায়কের সহজ ব্যাখ্যা"), "AI next-step explanation was not labelled");
check((await page.locator("[data-care-feedback]").textContent())?.includes("অপরিবর্তিত"), "AI explanation omitted the fixed-outcome boundary");
await page.getByRole("button", { name: "English" }).click();
check((await page.locator("[data-care-feedback]").textContent())?.includes("fixed screening outcome remains unchanged"), "English AI safety boundary is missing");
check((await page.locator("[data-care-feedback] [lang=en]").evaluate((element) => getComputedStyle(element).fontFamily)).includes("Merriweather"), "English AI result does not use Merriweather");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
check(!overflow, "AI companion overflows at 390px mobile width");
await page.close();

const unavailablePage = await open(unavailableRecord.patientId);
await unavailablePage.locator("#followup-free-text").fill("offline response");
await unavailablePage.locator('[data-action="interpret-barrier"]').click();
await unavailablePage.locator("[data-ai-barrier-result]").waitFor({ state: "visible" });
check((await unavailablePage.locator("[data-ai-barrier-result]").textContent())?.includes("নিজে বেছে নিন"), "AI failure did not preserve the manual fallback");
check(await unavailablePage.locator('input[name="followup-barrier"][value="OTHER"]').isEnabled(), "Manual barrier options were disabled after AI failure");
await unavailablePage.close();

const urgentPage = await open(urgentRecord.patientId);
const requestsBeforeUrgent = aiRequests.length;
await urgentPage.locator('[data-action="explain-next"]').click();
await urgentPage.locator("[data-care-feedback]").waitFor({ state: "visible" });
check(aiRequests.length === requestsBeforeUrgent, "Urgent guidance was sent to AI");
check((await urgentPage.locator("[data-care-feedback]").textContent())?.includes("৯৯৯"), "Urgent fixed guidance was not preserved");
await urgentPage.close();

await context.close();
await browser.close();

for (const error of runtimeErrors) failures.push(`Browser runtime error: ${error}`);
if (failures.length) {
  console.error("AI companion check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("AI barrier classification, explicit confirmation, next-step explanation, and manual fallback passed.");
  console.log("Urgent fixed guidance bypassed AI; Bangla, English, and mobile checks passed.");
}
