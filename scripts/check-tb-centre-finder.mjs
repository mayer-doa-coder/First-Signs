import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/api/screenings", async (route) => {
  const input = route.request().postDataJSON();
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ screening: { screeningId: input.screeningId, created: true, screeningRewardCreated: false } }) });
});
// This suite isolates centre selection from persisted-care retrieval. The
// dedicated care-persistence suite exercises a successful backend restore.
await context.route("**/api/care", async (route) => {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "CARE_BACKEND_UNAVAILABLE" }),
  });
});
const failures = [];
const runtimeErrors = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

// Bengali conjuncts can be typed as different (but visually identical) Unicode
// sequences; normalize before comparing so that never causes a false failure.
function nfc(value) {
  return value == null ? value : value.normalize("NFC");
}

/** Polls in Node (not the browser) so `nfc()` normalization can be used while waiting. */
async function waitForCondition(predicate, { timeout = 5_000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Timed out waiting for condition");
}

function watchRuntime(page) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 503")) {
      const location = message.location().url;
      runtimeErrors.push(location ? `${message.text()} (${location})` : message.text());
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

async function screenToCare(page, { coughDays = "20", area = "Dhaka" } = {}) {
  const consentStage = page.locator('[data-screening-stage="consent"]');
  await consentStage.locator('input[type="checkbox"]').check();
  await consentStage.locator('button[type="button"]').click();

  const questionsStage = page.locator('[data-screening-stage="questions"]');
  await questionsStage.locator("#cough-days").fill(coughDays);
  for (const group of ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"]) {
    await questionsStage.locator(`input[name="${group}"][value="no"]`).check();
  }
  await questionsStage.locator(`input[name="area"][value="${area}"]`).check();
  await questionsStage.locator('button[type="submit"]').click();

  await page.locator('[data-screening-stage="audio"]').getByRole("button", { name: "এখন অডিও দেব না" }).click();

  const referralStage = page.locator('[data-screening-stage="referral"]');
  await referralStage.locator('input[name="referral-choice"][value="not-now"]').check();
  await referralStage.locator('button[type="submit"]').click();

  const completeStage = page.locator('[data-screening-stage="complete"]');
  await completeStage.waitFor({ state: "visible" });
  await completeStage.getByRole("link", { name: /আমার সেবা|সেবার তথ্য দেখুন/ }).click();
  await page.locator("[data-patient-id]").waitFor({ state: "visible" });
}

// Expected nearest centre per broad area, computed independently from the
// same seeded coordinates (see the migration + lib/broad-areas.ts sources).
const expectedNearest = {
  Dhaka: "জাতীয় বক্ষব্যাধি ইনস্টিটিউট ও হাসপাতাল",
  Chattogram: "চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল",
  Rajshahi: "রাজশাহী মেডিকেল কলেজ হাসপাতাল",
  Khulna: "আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল",
  Barishal: "শের-ই-বাংলা মেডিকেল কলেজ হাসপাতাল",
  Sylhet: "এম এ জি ওসমানী মেডিকেল কলেজ হাসপাতাল",
  Rangpur: "রংপুর মেডিকেল কলেজ হাসপাতাল",
  Mymensingh: "ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল",
};

// --- Step 28: nearest centre is found automatically for every broad area ---
for (const [area, expectedCentreName] of Object.entries(expectedNearest)) {
  const page = await open("/screen?source=self");
  await screenToCare(page, { area });
  const summaryText = nfc(await page.locator('[data-summary="centre"]').textContent()) ?? "";
  check(
    summaryText.includes(nfc(expectedCentreName)),
    `${area}: expected nearest centre "${expectedCentreName}" but summary was "${summaryText.trim()}"`,
  );
  await page.close();
}

// --- Step 28/29: the care panel shows the map, ranked list, and required info ---
const page = await open("/screen?source=self");
await screenToCare(page, { area: "Khulna" });

await page.locator('[data-action="view-centre"]').click();
await page.locator("#care-centre-panel").waitFor({ state: "visible" });

// The map itself: user's broad area + recommended centre + name + service type.
const mapCanvas = page.locator(".centre-map-canvas");
await mapCanvas.waitFor({ state: "visible" });
await page.waitForFunction(
  () => !document.querySelector(".centre-map-fallback"),
  { timeout: 15_000 },
).catch(() => {});
const mapLoaded = (await page.locator(".centre-map-fallback").count()) === 0;
check(mapLoaded, "The interactive map did not report a ready state within the timeout");
await noOverflow(page, "Mobile TB-centre map");

check(
  nfc(await page.locator(".selected-centre-details").textContent())?.includes(nfc("আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল")),
  "Recommended centre name is not shown as text (Step 29 requirement)",
);
check(
  nfc(await page.locator(".selected-centre-details").textContent())?.includes(nfc("মাইক্রোস্কপি")),
  "Recommended centre service type is not shown as text (Step 29 requirement)",
);
check(
  nfc(await page.locator(".selected-centre-details").textContent())?.includes(nfc("সবচেয়ে কাছের কেন্দ্র")),
  "The recommended centre is not labelled as the nearest one",
);

// Google Maps directions link — always present regardless of map JS state.
const directionsLink = page.locator(".centre-map-footer a", { hasText: /Google|দিকনির্দেশ/ });
const directionsHref = await directionsLink.getAttribute("href");
check(Boolean(directionsHref?.startsWith("https://www.google.com/maps/dir/")), "Google Maps directions link is missing or malformed");
check(directionsHref?.includes("origin=22.8456") ?? false, "Directions link does not use the division's coarse coordinates as origin");
check(directionsHref?.includes("destination=22.8414") ?? false, "Directions link does not point to the recommended centre's coordinates");
check(await directionsLink.getAttribute("target") === "_blank", "Directions link does not open in a new tab");

// Ranked shortlist (Step 28 fallback: nearest, then 2nd/3rd nearest).
const rankOptions = page.locator(".centre-rank-option");
check((await rankOptions.count()) === 6, `Expected 6 ranked centre options, found ${await rankOptions.count()}`);
check(
  nfc(await rankOptions.nth(0).textContent())?.includes(nfc("আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল")),
  "The first ranked option is not the nearest centre",
);
check(
  await rankOptions.nth(0).evaluate((el) => el.className.includes("centre-rank-option-selected")),
  "The nearest (currently selected) option is not visually marked as selected",
);

// Choosing the 2nd-nearest option from the ranked shortlist (the explicit
// "if not found/available, choose the 2nd shortest" fallback path).
const secondNearestText = nfc(await rankOptions.nth(1).locator("strong").textContent());
await rankOptions.nth(1).click();
await waitForCondition(async () =>
  nfc(await page.locator('[data-summary="centre"]').textContent())?.includes(secondNearestText ?? "__never__"),
);
check(
  nfc(await page.locator('[data-summary="centre"]').textContent())?.includes(secondNearestText ?? "__never__"),
  "Selecting the second-nearest centre from the ranked list did not update the care summary",
);
check(
  nfc(await page.locator(".selected-centre-details").textContent())?.includes(nfc("নিজে বেছে নেওয়া কেন্দ্র")),
  "A manually chosen (non-nearest) centre is not labelled as the person's own choice",
);

// The dropdown lists centres ordered by distance and stays in sync.
const selectOptions = await page.locator("#care-centre option").allTextContents();
check(selectOptions[1]?.includes(nfc("আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল")), "The full list is not ordered with the nearest centre first");
check((await page.locator("#care-centre").inputValue()) !== "", "The select lost its value after choosing from the ranked list");

// Selecting a third option via the plain <select> still updates everything consistently.
await page.locator("#care-centre").selectOption("NTP-KHL-RUPSHA");
await waitForCondition(async () =>
  nfc(await page.locator('[data-summary="centre"]').textContent())?.includes(nfc("রূপসা")),
);
check(
  nfc(await page.locator(".selected-centre-details").textContent())?.includes(nfc("নিজে বেছে নেওয়া কেন্দ্র")),
  "Selecting a distant centre via the dropdown does not show the 'your own choice' label",
);

await noOverflow(page, "Mobile TB-centre panel after reselecting");
await page.close();

// --- English parity ---
const englishPage = await open("/screen?source=self");
await screenToCare(englishPage, { area: "Khulna" });
await englishPage.locator('[data-action="view-centre"]').click();
await englishPage.locator("#care-centre-panel").waitFor({ state: "visible" });
await englishPage.getByRole("button", { name: "English" }).click();
check(
  await englishPage.getByText("Nearest centre to this broad area").isVisible(),
  "English 'nearest centre' label is missing",
);
check(
  await englishPage.getByText("Open directions in Google Maps").isVisible(),
  "English Google Maps directions label is missing",
);
check(
  nfc(await englishPage.locator(".centre-rank-list").textContent())?.includes("km"),
  "English ranked list does not show distances in km",
);
await noOverflow(englishPage, "English mobile TB-centre panel");
await englishPage.close();

// --- Privacy: never an exact address/GPS, and the map note says so ---
const privacyPage = await open("/screen?source=self");
await screenToCare(privacyPage, { area: "Rajshahi" });
await privacyPage.locator('[data-action="view-centre"]').click();
await privacyPage.locator("#care-centre-panel").waitFor({ state: "visible" });
check(
  await privacyPage.getByText("সঠিক GPS ব্যবহার করা হয়নি").isVisible(),
  "The centre panel does not state that no exact GPS is used",
);
check(
  nfc(await privacyPage.locator(".centre-selection-note").textContent())?.includes(nfc("ব্যক্তির সঠিক অবস্থান ব্যবহার করে না")),
  "The distance note does not clarify it never uses the person's exact location",
);
await privacyPage.close();

await context.close();
await browser.close();

for (const runtimeError of runtimeErrors) failures.push(`Browser runtime error: ${runtimeError}`);

if (failures.length) {
  console.error("TB-centre-finder check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Nearest-centre auto-selection passed for all eight Bangladesh divisions.");
  console.log("Interactive map, Google Maps directions link, ranked shortlist, and second-nearest fallback passed.");
  console.log("English parity, privacy wording, and mobile layout passed.");
}
