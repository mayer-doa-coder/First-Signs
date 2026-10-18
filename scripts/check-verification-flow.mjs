/**
 * Part 10 — TB centre verification.
 *
 * Unlike the Part 9 suite, this one deliberately runs against the real referral
 * backend: Step 34's one-time code, single completion time, and single
 * completion reward are transactional database guarantees, so mocking them
 * would test nothing. Each run therefore creates a few demo referral rows.
 */
import QRCode from "qrcode";
import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
const runtimeErrors = [];
const createdTestRecords = [];
const staffPin = process.env.TB_CENTRE_STAFF_PIN;
if (!staffPin) throw new Error("TB_CENTRE_STAFF_PIN is required for the verification workflow test");

function check(condition, message) {
  if (!condition) failures.push(message);
}

function nfc(value) {
  return value == null ? value : value.normalize("NFC");
}

// Looking up a referral that does not exist is part of the test, and the
// browser always logs that 404 fetch as a console error. Only those deliberate
// lookups are excused; every other console error still fails the run.
let expectingNotFound = false;

function watchRuntime(page) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (expectingNotFound && message.text().includes("status of 404")) return;
    runtimeErrors.push(message.text());
  });
}

async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(size.scrollWidth <= size.clientWidth + 1, `${label} overflows horizontally (${size.scrollWidth}px > ${size.clientWidth}px)`);
}

function randomHex(byteCount) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteCount)), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Creates a real referral through the same API the screening flow uses. */
async function createReferral({ sourceType, pharmacyId, tbCenterId = "NTP-KHL-KMCH" } = {}) {
  const patientId = `JVH-DEMO-${randomHex(4)}`;
  const body = {
    screeningId: `JVH-SCR-${randomHex(16)}`,
    patientId,
    sourceType,
    ...(pharmacyId ? { pharmacyId } : {}),
    areaName: "Sonadanga",
    areaLatitude: 22.8167,
    areaLongitude: 89.55,
    symptomAnswers: { coughDays: 14, fever: false, nightSweats: false, weightLoss: false, bloodInSputum: false, tbExposure: false },
    audioStatus: "skipped",
    screeningResult: "FORMAL_TB_EVALUATION_RECOMMENDED",
    tbCenterId,
  };
  const response = await fetch(new URL("/api/referrals", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.referral) {
    throw new Error(`Could not create a ${sourceType} referral: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  const created = { ...payload.referral, patientId, screeningId: body.screeningId };
  createdTestRecords.push({ patientId, screeningId: body.screeningId, referralId: payload.referral.referralId });
  return created;
}

async function confirmViaApi(lookup, tbCenterId = "NTP-KHL-KMCH") {
  const response = await fetch(new URL("/api/referrals/verify", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "x-jvh-tb-centre-pin": staffPin },
    body: JSON.stringify({ ...lookup, tbCenterId }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function lookupInUi(page, value) {
  await page.locator("#tb-centre-staff-pin").fill(staffPin);
  await page.locator("#referral-id").fill(value);
  await page.locator('.verify-search-card button[type="submit"]').click();
}

/**
 * Waits for the result card to show a specific referral. A previous lookup's
 * card can still be on screen, so waiting only for visibility would assert
 * against stale content.
 */
async function waitForResult(page, referralId) {
  await page.waitForFunction(
    (expected) => document.querySelector("[data-verification-result] h2")?.textContent?.trim() === expected,
    referralId,
    { timeout: 15_000 },
  );
}

// --- Step 33: find a referral by ID, see existence, used state, intended centre ---
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
watchRuntime(page);

const pharmacyReferral = await createReferral({ sourceType: "PHARMACY", pharmacyId: "DEMO-KHL-RAHMAN" });
check(pharmacyReferral.status === "PENDING", "A new pharmacy referral did not start as PENDING");

const unauthorisedLookup = await fetch(new URL(`/api/referrals/verify?referralId=${pharmacyReferral.referralId}`, baseUrl));
check(unauthorisedLookup.status === 401, "Referral lookup succeeded without the TB-centre staff PIN");
const wrongPinConfirmation = await fetch(new URL("/api/referrals/verify", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json", "x-jvh-tb-centre-pin": "definitely-wrong" },
  body: JSON.stringify({ referralId: pharmacyReferral.referralId, tbCenterId: pharmacyReferral.tbCenterId }),
});
check(wrongPinConfirmation.status === 401, "Referral completion succeeded with an incorrect TB-centre staff PIN");

const verifyResponse = await page.goto(new URL("/verify", baseUrl).toString(), { waitUntil: "networkidle" });
check(verifyResponse?.status() === 200, `/verify returned HTTP ${verifyResponse?.status()}`);
check(await page.locator("#referral-id").isVisible(), "The referral ID field is missing");
check(await page.locator("#tb-centre-staff-pin").isVisible(), "The TB-centre staff PIN field is missing");
check(await page.getByRole("button", { name: /ক্যামেরা দিয়ে স্ক্যান|Scan with camera/ }).isVisible(), "The QR camera action is missing");
await noOverflow(page, "Mobile verify page");

// An unknown-but-well-formed referral ID must report "not found", not an error state.
expectingNotFound = true;
await lookupInUi(page, "JVH-KHU-99999");
await page.locator(".verify-error").waitFor({ state: "visible" });
check(
  nfc(await page.locator(".verify-error").textContent())?.includes("was not found"),
  "An unknown referral ID did not report that it was not found",
);
check((await page.locator("[data-verification-result]").count()) === 0, "An unknown referral still rendered a result card");

// A malformed value must be rejected locally without a lookup.
await lookupInUi(page, "NOT-A-REFERRAL");
await page.locator(".verify-error").waitFor({ state: "visible" });
check(
  nfc(await page.locator(".verify-error").textContent())?.includes("Enter a valid referral ID"),
  "A malformed referral value was not rejected with guidance",
);

expectingNotFound = false;

// The real referral: exists, not yet used, intended centre shown.
await lookupInUi(page, pharmacyReferral.referralId);
await waitForResult(page, pharmacyReferral.referralId);
const resultText = () => page.locator("[data-verification-result]").textContent().then(nfc);
check((await resultText())?.includes(pharmacyReferral.referralId), "The result card does not show the referral ID");
check((await resultText())?.includes("Pending"), "A pending referral is not shown as pending");
check((await resultText())?.includes("Khulna Medical College Hospital"), "The intended TB centre is not shown");
check((await resultText())?.includes("Microscopy"), "The centre's listed service is not shown");
check(
  (await page.locator("[data-verification-result] dd").filter({ hasText: /^No$/ }).count()) > 0,
  "The result card does not report that the code has not been used yet",
);
check(
  (await page.locator("[data-confirm-evaluation]").count()) === 1,
  "The confirm action is missing for a pending referral",
);
await noOverflow(page, "Mobile verification result");

// The verification view must never expose patient identity or clinical detail.
check(!(await resultText())?.includes(pharmacyReferral.patientId), "The verification view exposed the patient ID");
check(
  !/01[3-9]\d{8}/.test((await resultText()) ?? ""),
  "The verification view exposed a phone number",
);
check(
  !(await resultText())?.match(/JVH-SCR-|coughDays|উপসর্গের উত্তর/),
  "The verification view exposed screening or symptom detail",
);

// --- Step 34: confirm formal evaluation ---
await page.locator("[data-confirm-evaluation]").click();
await page.locator(".verification-confirmed").waitFor({ state: "visible" });
check(
  (await resultText())?.includes("Formal evaluation attendance confirmed"),
  "Confirming did not show the attendance-confirmed message",
);
check((await resultText())?.includes("Completed"), "The referral is not shown as completed after confirmation");
check(
  (await page.locator("[data-verification-result] dd").filter({ hasText: /^Yes$/ }).count()) > 0,
  "The confirmed referral is not marked as used",
);
check((await page.locator("[data-confirm-evaluation]").count()) === 0, "The confirm action is still offered after use");
// The confirm button unmounts on success, so focus must be moved deliberately
// instead of falling back to the document body.
check(
  await page.evaluate(() => document.activeElement?.classList.contains("verification-confirmed") === true),
  "Confirming dropped keyboard focus instead of moving it to the confirmation",
);
check(
  (await resultText())?.includes("not a TB diagnosis or test result"),
  "The confirmation does not state that it is not a diagnosis or test result",
);

// Re-looking up the same referral must report the used, one-time state.
await lookupInUi(page, pharmacyReferral.referralId);
await waitForResult(page, pharmacyReferral.referralId);
await page.locator(".verification-confirmed").waitFor({ state: "visible" });
check((await page.locator("[data-confirm-evaluation]").count()) === 0, "A used referral can be confirmed again from the UI");

// Step 34 reward rules, checked against the real transactional backend.
const pharmacyRepeat = await confirmViaApi({ referralId: pharmacyReferral.referralId });
check(pharmacyRepeat.body?.referral?.alreadyUsed === true, "Re-confirming a used referral did not report it as already used");
check(
  pharmacyRepeat.body?.referral?.completionRewardCreated === false,
  "Re-confirming a used referral created a second completion reward",
);

const pharmacyFresh = await createReferral({ sourceType: "PHARMACY", pharmacyId: "DEMO-KHL-CITY" });
const pharmacyFirst = await confirmViaApi({ referralId: pharmacyFresh.referralId });
check(pharmacyFirst.body?.referral?.status === "COMPLETED", "A pharmacy referral was not completed");
check(
  pharmacyFirst.body?.referral?.completionRewardCreated === true,
  "A pharmacy-assisted referral did not create the completion reward",
);
check(Boolean(pharmacyFirst.body?.referral?.completedAt), "A completed referral has no completion time");

const selfReferral = await createReferral({ sourceType: "SELF" });
const selfConfirm = await confirmViaApi({ token: selfReferral.accessToken });
check(selfConfirm.body?.referral?.status === "COMPLETED", "A self-use referral could not be completed");
check(
  selfConfirm.body?.referral?.completionRewardCreated === false,
  "A self-use referral created a pharmacy completion reward",
);

// The intended centre must match: a different centre cannot consume the code.
const otherCentreReferral = await createReferral({ sourceType: "SELF" });
const wrongCentre = await confirmViaApi({ referralId: otherCentreReferral.referralId }, "NTP-KHL-RUPSHA");
check(wrongCentre.status >= 400, "A different TB centre was allowed to complete the referral");
const stillPending = await fetch(new URL(`/api/referrals/verify?referralId=${otherCentreReferral.referralId}`, baseUrl), {
  headers: { "x-jvh-tb-centre-pin": staffPin },
});
check(
  (await stillPending.json())?.referral?.status === "PENDING",
  "A rejected wrong-centre confirmation still changed the referral",
);

// Concurrent confirmations must produce one completion and one reward.
const raceReferral = await createReferral({ sourceType: "PHARMACY", pharmacyId: "DEMO-KHL-SHAPLA" });
const raceResults = await Promise.all(
  Array.from({ length: 5 }, () => confirmViaApi({ referralId: raceReferral.referralId })),
);
check(
  raceResults.filter((result) => result.body?.referral?.completionRewardCreated === true).length === 1,
  "Concurrent confirmations did not create exactly one completion reward",
);
check(
  new Set(raceResults.map((result) => result.body?.referral?.completedAt)).size === 1,
  "Concurrent confirmations produced more than one completion time",
);

// --- Step 33 QR path: a referral QR image resolves to the same referral ---
const qrReferral = await createReferral({ sourceType: "SELF" });
const qrValue = new URL(`/referral?token=${qrReferral.accessToken}`, baseUrl).toString();
const qrPng = await QRCode.toBuffer(qrValue, { type: "png", width: 480, margin: 2 });
await page.locator(".verify-scan-actions input[type=file]").setInputFiles({ name: "referral-qr.png", mimeType: "image/png", buffer: qrPng });
await waitForResult(page, qrReferral.referralId);
check((await resultText())?.includes(qrReferral.referralId), "Scanning a referral QR image did not open that referral");
check(
  (await page.locator("#referral-id").inputValue()) === qrReferral.referralId,
  "A scanned QR did not fill in the readable referral ID",
);

// A QR that is not a referral QR must be reported without a lookup.
const foreignQr = await QRCode.toBuffer("https://example.org/not-a-referral", { type: "png", width: 480, margin: 2 });
await page.locator(".verify-scan-actions input[type=file]").setInputFiles({ name: "other-qr.png", mimeType: "image/png", buffer: foreignQr });
await page.locator(".verify-warning").first().waitFor({ state: "visible" });
check(
  nfc(await page.locator(".verify-warning").first().textContent())?.includes("not a valid referral QR"),
  "A non-referral QR image was not reported clearly",
);

// --- Bangla parity on the verification workspace ---
await lookupInUi(page, pharmacyReferral.referralId);
await waitForResult(page, pharmacyReferral.referralId);
await page.locator(".verification-confirmed").waitFor({ state: "visible" });
await page.getByRole("button", { name: "বাংলা" }).click();
check(await page.getByText("আনুষ্ঠানিক মূল্যায়নে উপস্থিতি নিশ্চিত হয়েছে।").first().isVisible(), "Bangla confirmation message is missing");
check(await page.getByText("নির্ধারিত যক্ষ্মা সেবাকেন্দ্র").first().isVisible(), "Bangla intended-centre label is missing");
check(
  await page.getByText(/যক্ষ্মা রোগ নির্ণয় বা পরীক্ষার ফল নয়/i).first().isVisible(),
  "Bangla non-diagnosis wording is missing on the verification page",
);
await noOverflow(page, "Bangla mobile verification result");
await page.close();

// --- Step 35: the patient's companion shows the confirmation ---
const carePage = await context.newPage();
watchRuntime(carePage);
const careReferral = await createReferral({ sourceType: "SELF" });

// Seed the record the screening flow would have saved, still showing PENDING.
await carePage.goto(new URL("/care", baseUrl).toString(), { waitUntil: "networkidle" });
await carePage.evaluate(({ referral, patientId }) => {
  const record = {
    version: 1,
    patientId,
    source: "self",
    area: "Sonadanga",
    screeningOutcome: "FORMAL_TB_EVALUATION_RECOMMENDED",
    symptomAnswers: { coughDays: 14, fever: false, nightSweats: false, weightLoss: false, bloodInSputum: false, tbExposure: false },
    audioChoice: "skipped",
    referralStatus: "PENDING",
    selectedCentreId: referral.tbCenterId,
    referral,
    followUpNeeded: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`jvh-care-v1:${patientId}`, JSON.stringify(record));
  localStorage.setItem("jvh-care-active-v1", patientId);
}, { referral: careReferral, patientId: careReferral.patientId });

await carePage.reload({ waitUntil: "networkidle" });
await carePage.locator("[data-patient-id]").waitFor({ state: "visible" });
check(
  (await carePage.locator("[data-attendance-confirmed]").count()) === 0,
  "My Care claimed attendance was confirmed before the centre confirmed it",
);

// The TB centre confirms, then the companion must reflect it when reopened.
const careConfirm = await confirmViaApi({ referralId: careReferral.referralId });
check(careConfirm.body?.referral?.status === "COMPLETED", "The care referral could not be completed");

await carePage.reload({ waitUntil: "networkidle" });
await carePage.locator("[data-attendance-confirmed]").waitFor({ state: "visible", timeout: 15_000 });
const attendanceText = nfc(await carePage.locator("[data-attendance-confirmed]").textContent());
check(
  attendanceText?.includes("Formal evaluation attendance confirmed"),
  "My Care does not show the Step 35 attendance-confirmed message",
);
check(
  attendanceText?.includes("not a TB diagnosis or test result"),
  "My Care presents attendance confirmation without the non-diagnosis explanation",
);
check(
  attendanceText?.match(/GeneXpert|microscopy|X-ray/i),
  "My Care does not explain what formal evaluation at the centre may involve",
);
check(
  attendanceText?.includes("sputum"),
  "My Care does not tell the person a sputum sample is usually requested",
);
check(
  attendanceText?.includes("get your result"),
  "My Care does not tell the person to return for the result",
);
// Cost must be hedged: the NTP's own strategic plan records user fees for
// chest X-ray, so the app may not promise that every test is free.
check(
  attendanceText?.includes("provided free") && attendanceText?.includes("may charge a fee"),
  "My Care does not state both that programme services are free and that some tests may still charge a fee",
);
check(
  nfc(await carePage.locator('[data-summary="referral"]').textContent())?.includes("Completed"),
  "The care summary does not show the completed referral status",
);
check(
  (await carePage.locator('[data-action="missed-visit"]').count()) === 0,
  "A completed referral still offers the missed-visit action",
);
await noOverflow(carePage, "Mobile My Care after verification");

await carePage.locator('[data-action="check-referral"]').click();
await carePage.locator("[data-care-feedback]").waitFor({ state: "visible" });
check(
  nfc(await carePage.locator("[data-care-feedback]").textContent())?.includes("Formal evaluation attendance confirmed"),
  "Checking referral status after verification does not report the confirmation",
);

await carePage.getByRole("button", { name: "বাংলা" }).click();
check(
  await carePage.getByText("আনুষ্ঠানিক মূল্যায়নে উপস্থিতি নিশ্চিত হয়েছে।").first().isVisible(),
  "Bangla Step 35 wording is missing on My Care",
);
await carePage.close();

// --- Larger screens ---
for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "computer", width: 1280, height: 900 }]) {
  const deviceContext = await browser.newContext({ viewport });
  const devicePage = await deviceContext.newPage();
  watchRuntime(devicePage);
  await devicePage.goto(new URL("/verify", baseUrl).toString(), { waitUntil: "networkidle" });
  await lookupInUi(devicePage, pharmacyReferral.referralId);
  await waitForResult(devicePage, pharmacyReferral.referralId);
  await noOverflow(devicePage, `Verification on a ${viewport.name}`);
  await deviceContext.close();
}

await context.close();
await browser.close();

console.log(`TEST_FIXTURES=${JSON.stringify(createdTestRecords)}`);

for (const runtimeError of runtimeErrors) failures.push(`Browser runtime error: ${runtimeError}`);

if (failures.length) {
  console.error("TB-centre verification check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Referral lookup by ID and by QR image passed, including not-found and non-referral QR handling.");
  console.log("Confirmation set COMPLETED once, saved the completion time, and kept the code single-use under concurrency.");
  console.log("Pharmacy completion reward created, self-use reward correctly withheld, wrong-centre confirmation refused.");
  console.log("My Care showed the attendance confirmation with its non-diagnosis explanation in both languages.");
}
