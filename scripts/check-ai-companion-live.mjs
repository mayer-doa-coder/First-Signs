import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const failures = [];
const runtimeErrors = [];
const aiResponses = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function careRecord(patientId, outcome = "FORMAL_TB_EVALUATION_RECOMMENDED") {
  return {
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
    screeningId: `JVH-SCR-${patientId.slice(-8).toLowerCase().padEnd(32, "a")}`,
    audioChoice: "skipped",
    referralStatus: "FOLLOW_UP_NEEDED",
    selectedCentreId: "NTP-KHL-KMCH",
    referral: {
      referralId: "JVH-KHU-00881",
      accessToken: "88888888-8888-4888-8888-888888888881",
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
      referralId: "JVH-KHU-00881",
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
}

const formalRecord = careRecord("JVH-DEMO-A1100001");
const urgentRecord = careRecord("JVH-DEMO-A1100002", "URGENT_MEDICAL_EVALUATION");

await context.addInitScript(({ records }) => {
  for (const record of records) {
    localStorage.setItem(`jvh-care-v1:${record.patientId}`, JSON.stringify(record));
  }
}, { records: [formalRecord, urgentRecord] });

await context.route("**/api/care", (route) => route.fulfill({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "TEST_CARE_UNAVAILABLE" }),
}));
await context.route("**/api/referrals?*", (route) => route.fulfill({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "TEST_REFERRAL_UNAVAILABLE" }),
}));
await context.route("**/api/referrals/follow-up*", async (route) => {
  if (route.request().method() === "PATCH") {
    const { barrier } = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        followUp: {
          ...formalRecord.followUp,
          status: "ACTION_READY",
          barrier,
          nextAction: barrier === "WORK_SCHEDULE" ? "PLAN_SUITABLE_TIME" : "HUMAN_SUPPORT",
        },
      }),
    });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ followUp: formalRecord.followUp }) });
});

context.on("response", (response) => {
  if (new URL(response.url()).pathname === "/api/companion") aiResponses.push(response.status());
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
await page.locator("#followup-free-text").fill("আমার অফিস থেকে ছুটি দেয়নি, তাই যেতে পারিনি।");
await page.locator('[data-action="interpret-barrier"]').click();
await page.locator("[data-ai-barrier-result]").waitFor({ state: "visible", timeout: 40_000 });
check(await page.locator('input[name="followup-barrier"][value="WORK_SCHEDULE"]').isChecked(), "Live Gemini did not classify the work-leave answer as WORK_SCHEDULE");
check((await page.locator("[data-followup-action]").count()) === 0, "The live AI suggestion was saved without user confirmation");
check(!(await page.locator("body").textContent()).match(/যক্ষ্মা নিশ্চিত|TB is confirmed|chance of TB/i), "Live AI displayed a diagnosis or probability claim");

await page.locator('[data-followup-question] button[type="submit"]').click();
await page.locator("[data-followup-action]").waitFor({ state: "visible" });
await page.locator('[data-action="explain-next"]').click();
await page.locator("[data-care-feedback]").filter({ hasText: "AI সহায়কের সহজ ব্যাখ্যা" }).waitFor({ state: "visible", timeout: 40_000 });
check((await page.locator("[data-care-feedback]").textContent())?.includes("অপরিবর্তিত"), "Live AI explanation omitted the fixed-outcome boundary");
check((await page.locator("[data-care-feedback] [lang=bn]").evaluate((element) => getComputedStyle(element).fontFamily)).includes("Noto Sans Bengali"), "Live Bangla AI output does not use Noto Sans Bengali");
await page.getByRole("button", { name: "English" }).click();
check((await page.locator("[data-care-feedback]").textContent())?.includes("fixed screening outcome remains unchanged"), "Live English AI explanation omitted the fixed-outcome boundary");
check((await page.locator("[data-care-feedback] [lang=en]").evaluate((element) => getComputedStyle(element).fontFamily)).includes("Merriweather"), "Live English AI output does not use Merriweather");
check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), "Live AI companion overflows at 390px mobile width");
await page.close();

const requestsBeforeUrgent = aiResponses.length;
const urgentPage = await open(urgentRecord.patientId);
await urgentPage.locator('[data-action="explain-next"]').click();
await urgentPage.locator("[data-care-feedback]").waitFor({ state: "visible" });
check(aiResponses.length === requestsBeforeUrgent, "Urgent guidance was sent to Gemini");
check((await urgentPage.locator("[data-care-feedback]").textContent())?.includes("৯৯৯"), "Urgent fixed guidance was not preserved");
await urgentPage.close();

await context.close();
await browser.close();

for (const error of runtimeErrors) failures.push(`Browser runtime error: ${error}`);
check(aiResponses.length === 2 && aiResponses.every((status) => status === 200), `Expected two successful live AI responses; received ${aiResponses.join(", ") || "none"}`);

if (failures.length) {
  console.error("Live AI companion check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Live Gemini barrier classification and next-step explanation passed through the website UI.");
  console.log("Explicit confirmation, fixed safety boundaries, urgent bypass, fonts, and mobile width passed.");
}
