import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const dashboard = {
  totalScreenings: 12,
  selfUseScreenings: 7,
  pharmacyAssistedScreenings: 5,
  formalReferrals: 6,
  completedReferrals: 3,
  completionRate: 50,
  fraudAlerts: { duplicateRewardWarnings: 2, reusedAudioWarnings: 1, pharmaciesRequiringReview: 1, heldRewardCount: 3 },
  demoWindowStart: "2026-10-02T06:00:00.000Z",
  demoWindowEnd: "2026-10-09T06:00:00.000Z",
  demoSeededScreenings: 21,
  areas: [
    { areaId: "Sonadanga", uniqueUsersScreened: 4, uniqueUsersRecommended: 2, referralCount: 2, completionCount: 1, independentReferredUsers: 2, hotspotLevel: "NORMAL" },
    { areaId: "Khalishpur", uniqueUsersScreened: 6, uniqueUsersRecommended: 4, referralCount: 4, completionCount: 2, independentReferredUsers: 4, hotspotLevel: "WATCH" },
    { areaId: "Daulatpur", uniqueUsersScreened: 8, uniqueUsersRecommended: 6, referralCount: 7, completionCount: 3, independentReferredUsers: 5, hotspotLevel: "RED" },
  ],
};

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let requestCount = 0;
await context.route("**/api/dashboard", async (route) => {
  requestCount += 1;
  const result = requestCount > 1
    ? { ...dashboard, completedReferrals: 4, completionRate: 66.7 }
    : dashboard;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ dashboard: result }),
  });
});

const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(30_000);
const runtimeErrors = [];
const externalRequests = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.origin !== new URL(baseUrl).origin) externalRequests.push(request.url());
});
const response = await page.goto(new URL("/dashboard", baseUrl).toString(), { waitUntil: "domcontentloaded" });
check(response?.status() === 200, `/dashboard returned HTTP ${response?.status()}`);
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("[data-government-dashboard] .metric-card").first().waitFor();

let values = await page.locator(".metric-value").allTextContents();
check(values.join("|") === "১২|৭|৫|৬|৩|৫০.০%", `Bangla totals are incorrect: ${values.join("|")}`);
const funnel = page.locator(".referral-funnel");
check(await funnel.getByText("স্ক্রিনিং", { exact: true }).isVisible(), "Screened funnel stage is missing");
check(await funnel.getByText("রেফারেল", { exact: true }).isVisible(), "Referred funnel stage is missing");
check(await funnel.getByText("সম্পন্ন", { exact: true }).isVisible(), "Completed funnel stage is missing");
check((await page.locator(".referral-funnel").getAttribute("aria-label")) === "স্ক্রিনিং ১২, রেফারেল ৬, সম্পন্ন ৩", "Funnel accessibility summary is incorrect");
check((await page.locator(".privacy-banner").textContent())?.includes("ফোন নম্বর"), "Privacy notice does not exclude private patient information");
check((await page.locator("[data-patient-id], .patient-id-card, audio").count()) === 0, "Government dashboard exposed a patient or audio field");
check((await page.locator(".government-fraud-card").textContent())?.includes("সম্ভাব্য পুনর্ব্যবহৃত অডিও"), "Anonymous fraud-review summary is missing");
check(!(await page.locator(".government-fraud-card").textContent())?.match(/JVH-DEMO-|DEMO-KHL-|[0-9a-f]{64}/), "Government review summary exposed an identifier or audio hash");
check(await page.getByText("পর্যালোচনার নিয়ম", { exact: true }).isVisible(), "Bangla aggregate review rule is missing");
check(await page.getByText("সম্ভাব্য টিবি-সংক্রান্ত স্ক্রিনিং কার্যক্রম বেশি — তদন্ত করুন", { exact: true }).isVisible(), "Red investigation signal is missing or incorrectly worded");
check(await page.getByText("এলাকাটি পর্যালোচনা করুন", { exact: true }).isVisible(), "Red-area action panel is missing");
check(await page.getByText("মোবাইল স্ক্রিনিং/পরীক্ষা বিবেচনা করুন", { exact: true }).isVisible(), "Mobile screening action is missing");
check((await page.locator(".government-map-privacy-note").textContent())?.includes("৩ জনের কম"), "Map privacy suppression floor is not explained");
check((await page.locator(".dashboard-demo-seed-note").textContent())?.includes("২১টি কৃত্রিম স্ক্রিনিং"), "Prepared demo records are not explicitly labelled");
check((await page.locator(".hotspot-area-button").count()) === 3, "Area selector does not contain the expected privacy-safe areas");
check(await page.locator("[data-local-government-map]").isVisible(), "Local broad-area map is not visible");
check(await page.locator(".government-map-real").isVisible(), "The real MapLibre government map surface is missing");
check(externalRequests.every((url) => url.startsWith("https://tiles.openfreemap.org/")), `Dashboard made unexpected external requests: ${externalRequests.join(", ")}`);
check((await page.locator("text=Confirmed TB outbreak").count()) === 0, "Dashboard uses prohibited confirmed-outbreak wording");
const banglaFont = await page.locator("#page-title span").evaluate((element) => getComputedStyle(element).fontFamily);
check(banglaFont.includes("Noto Sans Bengali"), `Bangla dashboard font is incorrect: ${banglaFont}`);

await page.locator(".hotspot-area-button").nth(1).click();
check((await page.locator(".red-area-actions").count()) === 0, "Red action panel remained visible for a watch area");
await page.locator(".hotspot-area-button").nth(2).click();
check(await page.locator(".red-area-actions").isVisible(), "Selecting a red map area did not show the action panel");

await page.locator(".government-dashboard-toolbar button").click();
await page.waitForFunction(() => document.querySelectorAll(".metric-value")[4]?.textContent === "৪");
values = await page.locator(".metric-value").allTextContents();
check(values[4] === "৪" && values[5] === "৬৬.৭%", "Manual refresh did not update completed totals and rate");

await page.getByRole("button", { name: "en", exact: true }).click();
values = await page.locator(".metric-value").allTextContents();
check(values.join("|") === "12|7|5|6|4|66.7%", `English totals are incorrect: ${values.join("|")}`);
check(await page.getByText("Anonymous programme overview").isVisible(), "English dashboard title is unavailable");
check((await page.locator(".referral-funnel").getAttribute("aria-label")) === "Screened 12, referred 6, completed 4", "English funnel accessibility summary is incorrect");
check(await page.getByText("High potential-TB screening activity — investigate", { exact: true }).isVisible(), "English red investigation signal is missing");
check(await page.getByText("Review need for additional TB service capacity", { exact: true }).isVisible(), "English capacity-review action is missing");
check((await page.locator(".dashboard-demo-seed-note").textContent())?.includes("21 synthetic screening records"), "English demo-data label is missing");
const englishFont = await page.locator("#page-title span").evaluate((element) => getComputedStyle(element).fontFamily);
check(englishFont.includes("Merriweather"), `English dashboard font is incorrect: ${englishFont}`);

const size = await page.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
check(size.scrollWidth <= size.clientWidth + 1, `Mobile dashboard overflows horizontally (${size.scrollWidth}px > ${size.clientWidth}px)`);
check(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join("; ")}`);

await page.setViewportSize({ width: 1440, height: 900 });
const desktopSize = await page.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
check(desktopSize.scrollWidth <= desktopSize.clientWidth + 1, `Desktop dashboard overflows horizontally (${desktopSize.scrollWidth}px > ${desktopSize.clientWidth}px)`);

const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await errorContext.route("**/api/dashboard", (route) => route.fulfill({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "TEST_UNAVAILABLE" }),
}));
const errorPage = await errorContext.newPage();
errorPage.setDefaultTimeout(30_000);
errorPage.setDefaultNavigationTimeout(30_000);
await errorPage.goto(new URL("/dashboard", baseUrl).toString(), { waitUntil: "domcontentloaded" });
await errorPage.locator(".dashboard-error-card").waitFor();
check(await errorPage.locator(".dashboard-error-card").isVisible(), "Dashboard failure state is not visible");
await errorPage.getByRole("button", { name: "en", exact: true }).click();
check(await errorPage.getByText("Public-health totals could not be loaded").isVisible(), "English failure state is unavailable");

await errorContext.close();
await context.close();
await browser.close();

if (failures.length) {
  console.error("Government-dashboard check failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Government dashboard passed aggregate, funnel, hotspot map, privacy, actions, refresh, language, failure, and responsive checks.");
}
