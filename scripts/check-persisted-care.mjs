import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];
const runtimeErrors = [];
let careRequests = 0;
let expectingNotFound = false;

function check(condition, message) {
  if (!condition) failures.push(message);
}

page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (expectingNotFound && message.text().includes("status of 404")) return;
  runtimeErrors.push(message.text());
});

const patientId = "JVH-DEMO-A1B2C3D4";
const persistedCare = {
  version: 1,
  patientId,
  source: "self",
  area: "Sonadanga",
  screeningOutcome: "FORMAL_TB_EVALUATION_RECOMMENDED",
  symptomAnswers: {
    coughDays: 14,
    fever: false,
    nightSweats: false,
    weightLoss: false,
    bloodInSputum: false,
    tbExposure: false,
  },
  screeningId: "JVH-SCR-0123456789ABCDEF0123456789ABCDEF",
  audioChoice: "skipped",
  referralStatus: "NOT_REQUESTED",
  selectedCentreId: "NTP-KHL-KMCH",
  followUpNeeded: false,
  createdAt: "2026-10-11T08:00:00.000Z",
  updatedAt: "2026-10-11T08:00:00.000Z",
};

await page.route("**/api/care", async (route) => {
  careRequests += 1;
  const body = route.request().postDataJSON();
  if (body?.patientId !== patientId) {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "CARE_NOT_FOUND" }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ care: persistedCare }) });
});

await page.goto(`${baseUrl}/care?patient=${patientId}&source=self`, { waitUntil: "networkidle" });
check(careRequests === 1, "A fresh care page did not request the persisted backend record");
check((await page.locator('[data-summary="recommendation"] strong').textContent())?.includes("Formal evaluation"), "Persisted English-default care status did not render");
check(await page.evaluate((id) => Boolean(localStorage.getItem(`jvh-care-v1:${id}`)), patientId), "Persisted care was not cached for offline fallback");

await page.reload({ waitUntil: "networkidle" });
check(careRequests === 2, "Reload used stale browser state without refreshing the persisted backend record");

await page.getByRole("button", { name: "বাংলা" }).click();
check((await page.locator('[data-summary="recommendation"] strong').textContent())?.includes("আনুষ্ঠানিক"), "Persisted Bangla care status did not render");
await page.getByRole("button", { name: "English" }).click();
const layout = await page.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
check(layout.scrollWidth <= layout.clientWidth + 1, "Persisted care page overflows at 390px");

expectingNotFound = true;
const notFoundResponse = await page.goto(`${baseUrl}/definitely-not-a-route`, { waitUntil: "networkidle" });
expectingNotFound = false;
check(notFoundResponse?.status() === 404, "Unknown route did not retain HTTP 404 status");
check((await page.locator("main").textContent())?.includes("There is no page at this address"), "Custom English not-found page did not render");
const englishNotFoundFont = await page.locator('main h1 [lang="en"]').evaluate((element) => getComputedStyle(element).fontFamily);
check(englishNotFoundFont.includes("Merriweather"), `English not-found content used the wrong font: ${englishNotFoundFont}`);
await page.getByRole("button", { name: "বাংলা" }).click();
check((await page.locator("main").textContent())?.includes("এই ঠিকানায় কোনো পৃষ্ঠা নেই"), "Custom Bangla not-found page did not render");
const banglaNotFoundFont = await page.locator('main h1 [lang="bn"]').evaluate((element) => getComputedStyle(element).fontFamily);
check(banglaNotFoundFont.includes("Noto Sans Bengali"), `Bangla not-found content used the wrong font: ${banglaNotFoundFont}`);

await browser.close();

if (runtimeErrors.length) failures.push(...runtimeErrors.map((error) => `Runtime error: ${error}`));
if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Persisted care refresh, cross-session restore, bilingual rendering, mobile layout, and custom not-found typography passed.");
