import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const expectedQrHost = process.env.EXPECTED_QR_HOST;
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
const runtimeErrors = [];
const created = new Map();
const createRequests = [];
let referralNumber = 124;

function check(condition, message) {
  if (!condition) failures.push(message);
}

function watchRuntime(page) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
}

async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(size.scrollWidth <= size.clientWidth + 1, `${label} overflows horizontally (${size.scrollWidth}px > ${size.clientWidth}px)`);
}

async function noActionPanelOverlap(page, label) {
  const layout = await page.locator(".referral-help").evaluate((panel) => {
    const items = [...panel.querySelectorAll(".number-list li")];
    const button = panel.querySelector("a.button");
    const note = panel.querySelector(".referral-safety-note");
    const itemRects = items.map((item) => item.getBoundingClientRect());
    const textRects = items.map((item) => item.querySelector("[lang]")?.getBoundingClientRect());
    const buttonRect = button?.getBoundingClientRect();
    const noteRect = note?.getBoundingClientRect();

    return {
      textFitsItems: itemRects.every((item, index) => {
        const text = textRects[index];
        return Boolean(text && text.width > 80 && text.bottom <= item.bottom + 1);
      }),
      itemsDoNotOverlap: itemRects.every((item, index) => index === 0 || item.top >= itemRects[index - 1].bottom - 1),
      buttonAfterList: Boolean(buttonRect && itemRects.at(-1) && buttonRect.top >= itemRects.at(-1).bottom - 1),
      noteAfterButton: Boolean(noteRect && buttonRect && noteRect.top >= buttonRect.bottom - 1),
    };
  });

  check(layout.textFitsItems, `${label} action text does not fit its list rows`);
  check(layout.itemsDoNotOverlap, `${label} action rows overlap`);
  check(layout.buttonAfterList, `${label} action button overlaps the numbered list`);
  check(layout.noteAfterButton, `${label} safety note overlaps the action button`);
}

function referralFor(input) {
  const token = randomUUID();
  const referral = {
    referralId: `JVH-KHU-${String(referralNumber++).padStart(5, "0")}`,
    accessToken: token,
    status: "PENDING",
    tbCenterId: input.tbCenterId,
    centreName: "Ad din Akij Medical College Hospital (AAMCHK)",
    centreArea: "Dighalia",
    centreDistrict: "Khulna",
    serviceType: "Microscopy",
    createdAt: "2026-09-12T10:00:00.000Z",
    rewardCreated: input.sourceType === "PHARMACY",
  };
  created.set(token, referral);
  return referral;
}

async function installReferralBackend(context) {
  await context.route("**/api/screenings", async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ screening: { screeningId: input.screeningId, created: true, screeningRewardCreated: input.sourceType === "PHARMACY" } }) });
  });
  await context.route("**/api/referrals*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const input = request.postDataJSON();
      createRequests.push(input);
      const prior = [...created.values()].find((item) => item.screeningId === input.screeningId);
      const referral = prior ?? referralFor(input);
      referral.screeningId = input.screeningId;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ referral }) });
      return;
    }

    const token = new URL(request.url()).searchParams.get("token");
    const referral = token ? created.get(token) : undefined;
    await route.fulfill({
      status: referral ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(referral ? { referral } : { error: "REFERRAL_NOT_FOUND" }),
    });
  });
}

async function completeScreening(page, entryPath) {
  const response = await page.goto(new URL(entryPath, baseUrl).toString(), { waitUntil: "networkidle" });
  check(response?.status() === 200, `${entryPath} returned HTTP ${response?.status()}`);
  await page.getByRole("button", { name: "বাংলা" }).click();

  const consent = page.locator('[data-screening-stage="consent"]');
  await consent.locator('input[type="checkbox"]').check();
  await consent.locator('button[type="button"]').click();

  const questions = page.locator('[data-screening-stage="questions"]');
  await questions.locator("#cough-days").fill("14");
  for (const name of ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"]) {
    await questions.locator(`input[name="${name}"][value="no"]`).check();
  }
  await questions.locator('input[name="area"][value="Khulna"]').check();
  await questions.locator('button[type="submit"]').click();
  await page.locator('[data-screening-stage="audio"]').getByRole("button", { name: "এখন অডিও দেব না" }).click();

  const choice = page.locator('[data-screening-stage="referral"]');
  await choice.locator('input[value="continue"]').check();
  await choice.locator('button[type="submit"]').click();
  await page.locator('[data-screening-stage="complete"]').waitFor({ state: "visible" });
  return page.locator('[data-screening-stage="complete"]');
}

async function decodeQr(image) {
  const src = await image.getAttribute("src");
  if (!src?.startsWith("data:image/png;base64,")) return null;
  const png = PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await installReferralBackend(context);

// Self-use: one real-looking record, no reward, and a QR that reopens only the limited referral view.
const selfPage = await context.newPage();
watchRuntime(selfPage);
const selfComplete = await completeScreening(selfPage, "/screen?source=self");
check((await selfComplete.textContent())?.includes("PENDING"), "Self-use referral was not created with PENDING status");
check(createRequests[0]?.sourceType === "SELF", "Self-use referral payload did not retain SELF source");
check(createRequests[0]?.pharmacyId === undefined, "Self-use referral payload included a pharmacy");
check(created.values().next().value?.rewardCreated === false, "Self-use referral created a pharmacy reward");

await selfComplete.getByRole("link", { name: "রেফারেল ও কিউআর দেখুন" }).click();
await selfPage.locator("[data-referral-id]").waitFor({ state: "visible" });
check((await selfPage.locator("[data-referral-id]").textContent()) === "JVH-KHU-00124", "Referral ID is missing or malformed");
const ticketText = await selfPage.locator(".referral-ticket-live").textContent();
check(ticketText?.includes("আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল"), "Referral centre name is missing");
check(ticketText?.includes("দিঘলিয়া"), "Referral centre location is missing");
check(ticketText?.includes("মাইক্রোস্কপি"), "Referral service type is missing");
check(ticketText?.includes("PENDING"), "Referral current status is missing");
check(!ticketText?.includes("JVH-DEMO-"), "Patient ID leaked onto the referral ticket");

const qrImage = selfPage.locator("img[data-qr-value]");
await qrImage.waitFor({ state: "visible" });
const qrValue = await qrImage.getAttribute("data-qr-value");
const decodedQr = await decodeQr(qrImage);
check(decodedQr === qrValue, "Referral QR pixels do not decode to their declared URL");
check(new URL(qrValue).pathname === "/referral", "Referral QR opens the wrong page");
if (expectedQrHost) check(new URL(qrValue).hostname === expectedQrHost, "Referral QR does not use the expected mobile-reachable host");
check(Boolean(new URL(qrValue).searchParams.get("token")?.match(/^[0-9a-f-]{36}$/i)), "Referral QR has no opaque access token");
check(!qrValue.includes("JVH-DEMO"), "Referral QR leaks a patient ID");
await noOverflow(selfPage, "Mobile referral page");
await noActionPanelOverlap(selfPage, "Mobile referral page");

await selfPage.setViewportSize({ width: 1440, height: 1000 });
await noOverflow(selfPage, "Desktop referral page");
await noActionPanelOverlap(selfPage, "Desktop referral page");

await selfPage.getByRole("button", { name: "English" }).click();
check(await selfPage.getByText("Referral for formal TB evaluation").isVisible(), "English referral heading is missing");
check((await selfPage.locator("html").getAttribute("lang")) === "en", "English language state was not applied globally");
await selfPage.close();

// Pharmacy-assisted: same clinical outcome and centre, but reward eligibility is retained.
const assistedPage = await context.newPage();
watchRuntime(assistedPage);
const assistedComplete = await completeScreening(assistedPage, "/screen?source=pharmacy&pharmacy=DEMO-KHL-RAHMAN");
check(
  (await assistedComplete.locator("[data-safety-outcome]").getAttribute("data-safety-outcome")) === "FORMAL_TB_EVALUATION_RECOMMENDED",
  "Pharmacy path changed the clinical outcome",
);
const assistedRequest = createRequests.at(-1);
check(assistedRequest?.sourceType === "PHARMACY", "Assisted referral payload did not retain PHARMACY source");
check(assistedRequest?.pharmacyId === "DEMO-KHL-RAHMAN", "Assisted referral did not retain the canonical pharmacy ID");
const assistedReferral = [...created.values()].at(-1);
check(assistedReferral?.rewardCreated === true, "Pharmacy-assisted referral did not create reward eligibility");
await assistedComplete.getByRole("link", { name: "রেফারেল ও কিউআর দেখুন" }).click();
await assistedPage.locator("[data-referral-id]").waitFor({ state: "visible" });
await noOverflow(assistedPage, "Mobile assisted referral page");
await assistedPage.close();

// Invalid QR/token failure path.
const invalidPage = await context.newPage();
watchRuntime(invalidPage);
await invalidPage.goto(new URL("/referral?token=not-a-token", baseUrl).toString(), { waitUntil: "networkidle" });
await invalidPage.getByRole("heading", { name: "This referral link is invalid" }).waitFor({ state: "visible" });
check(await invalidPage.getByRole("heading", { name: "This referral link is invalid" }).isVisible(), "Invalid referral token did not show a clear English error by default");
await noOverflow(invalidPage, "Invalid referral page");
await invalidPage.close();

// The real route rejects malformed requests before attempting Supabase.
const invalidApiResponse = await fetch(new URL("/api/referrals", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sourceType: "SELF" }),
});
check(invalidApiResponse.status === 400, `Malformed referral request returned HTTP ${invalidApiResponse.status}, expected 400`);

await context.close();
await browser.close();

for (const runtimeError of runtimeErrors) failures.push(`Browser runtime error: ${runtimeError}`);

if (failures.length) {
  console.error("Referral-flow check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Self-use and pharmacy-assisted referral creation passed.");
  console.log("Referral ID, PENDING status, centre details, bilingual UI, and mobile layout passed.");
  console.log("Referral QR decoded to an opaque-token URL without patient data.");
  console.log("SELF reward exclusion and PHARMACY reward eligibility passed.");
}
