import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function dashboard(pharmacyId, completed = 1) {
  return {
    pharmacyId,
    pharmacyName: "Rahman Pharmacy",
    pharmacyArea: "Sonadanga, Khulna",
    integrityScore: null,
    assistedScreenings: 5,
    referralsCreated: 2,
    referralsCompleted: completed,
    completionRate: completed * 50,
    simulatedEarnings: null,
    earningsConfigured: false,
    validScreeningCredits: 5,
    appropriateReferralCredits: 2,
    verifiedCompletionCredits: completed,
    qualityBonusCredits: 0,
    heldCredits: 0,
    duplicateRewardWarnings: 1,
    reusedAudioWarnings: 1,
    activityRequiresReview: true,
    lastActivityAt: "2026-09-15T08:00:00.000Z",
  };
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let requestCount = 0;
const requestedPharmacies = [];
await context.route("**/api/pharmacies/dashboard**", async (route) => {
  requestCount += 1;
  const pharmacyId = new URL(route.request().url()).searchParams.get("pharmacyId");
  requestedPharmacies.push(pharmacyId);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ dashboard: dashboard(pharmacyId, requestCount > 1 ? 2 : 1) }),
  });
});

const page = await context.newPage();
page.setDefaultTimeout(10_000);
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
const response = await page.goto(new URL("/pharmacy?pharmacy=DEMO-KHL-RAHMAN", baseUrl).toString(), { waitUntil: "domcontentloaded" });
check(response?.status() === 200, `/pharmacy returned HTTP ${response?.status()}`);
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator('[data-pharmacy-dashboard="DEMO-KHL-RAHMAN"] .metric-card').first().waitFor();

const metricValues = await page.locator(".metric-value").allTextContents();
check(metricValues[0] === "5", "Assisted-screening total is not live aggregate data");
check(metricValues[1] === "2", "Referral-created total is incorrect");
check(metricValues[2] === "1", "Initial completed-referral total is incorrect");
check((await page.locator(".reward-event-list").textContent())?.includes("5"), "Valid-screening credit count is missing");
check((await page.locator(".reward-card").textContent())?.includes("৳ —"), "Undefined reward amounts were presented as invented earnings");
check((await page.locator(".reward-card").textContent())?.includes("স্কোরের নিয়ম এখনো নির্ধারিত হয়নি"), "Undefined integrity score was not explained");
check((await page.locator("[data-patient-id], .patient-id-card").count()) === 0, "Dashboard exposed a patient field");
check(await page.getByText("কার্যক্রম পর্যালোচনা প্রয়োজন", { exact: true }).isVisible(), "Active pharmacy-volume warning is missing");
check(await page.getByText("পুরস্কারের যোগ্য নয় — সাম্প্রতিক স্ক্রিনিং ইতিমধ্যে আছে।", { exact: true }).isVisible(), "Duplicate-reward message is missing");
check((await page.getByRole("link", { name: /রেফারেল যাচাই খুলুন|Open referral verification/ }).count()) === 0, "Pharmacy dashboard still links directly to centre verification");

const refreshButton = page.locator(".pharmacy-dashboard-toolbar button");
await refreshButton.waitFor();
await refreshButton.click();
await page.waitForFunction(() => document.querySelectorAll(".metric-value")[2]?.textContent === "2");
const refreshedValues = await page.locator(".metric-value").allTextContents();
check(refreshedValues[2] === "2", "Completed referral count did not update after refresh");
check(refreshedValues[3] === "100.0%", "Completion rate did not update with completion count");
check((await page.locator(".reward-event-list").textContent())?.includes("স্বাধীনভাবে যাচাইকৃত উপস্থিতি"), "Verified-completion credit is missing");

await page.getByRole("button", { name: "en", exact: true }).click();
check(await page.getByText("Illustrative prototype incentive").isVisible(), "English incentive label is unavailable");
check(await page.getByText(/never linked to a positive TB result/i).isVisible(), "English reward safety message is missing");
check(await page.getByText("Activity requires review", { exact: true }).isVisible(), "English volume-review warning is unavailable");

await page.locator("#pharmacy-dashboard-select").selectOption("DEMO-KHL-CITY");
await page.locator('[data-pharmacy-dashboard="DEMO-KHL-CITY"] .metric-card').first().waitFor();
check(requestedPharmacies.includes("DEMO-KHL-CITY"), "Pharmacy selector did not scope the dashboard request");

const size = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
check(size.scrollWidth <= size.clientWidth + 1, `Mobile dashboard overflows horizontally (${size.scrollWidth}px > ${size.clientWidth}px)`);
check(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join("; ")}`);

const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await errorContext.route("**/api/pharmacies/dashboard**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "TEST_UNAVAILABLE" }) }));
const errorPage = await errorContext.newPage();
errorPage.setDefaultTimeout(10_000);
await errorPage.goto(new URL("/pharmacy", baseUrl).toString(), { waitUntil: "domcontentloaded" });
await errorPage.locator(".dashboard-error-card").waitFor();
check(await errorPage.locator(".dashboard-error-card").isVisible(), "Dashboard failure state is not visible");

await errorContext.close();
await context.close();
await browser.close();

if (failures.length) {
  console.error("Pharmacy-dashboard check failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Pharmacy dashboard passed live-update, reward, isolation, language, failure, and mobile checks.");
}
