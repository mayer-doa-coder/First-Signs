import { chromium } from "playwright-core";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createWav({ amplitude = 0.25, durationSeconds = 1, sampleRate = 16_000 } = {}) {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * amplitude * 32767);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const expectedQrHost = process.env.EXPECTED_QR_HOST;
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const fakeAudioPath = join(tmpdir(), "jvh-browser-test-audio.wav");
writeFileSync(fakeAudioPath, createWav({ durationSeconds: 3 }));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${fakeAudioPath}`,
  ],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/api/screenings", async (route) => {
  const input = route.request().postDataJSON();
  await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ screening: { screeningId: input.screeningId, created: true, screeningRewardCreated: input.sourceType === "PHARMACY" } }) });
});
await context.route("**/api/care", async (route) => {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "TEST_CARE_BACKEND_UNAVAILABLE" }),
  });
});
await context.route("**/api/referrals*", async (route) => {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "TEST_REFERRAL_BACKEND_UNAVAILABLE" }),
  });
});
await context.route("**/api/audio/analyze", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      available: true,
      model: "GOOGLE_HEAR",
      modelVersion: "1.0.0",
      classifierVersion: "HEAR-COUGH-PRESENCE-TEST",
      embeddingCreated: true,
      coughDetected: true,
      signal: "COUGH_LIKE_SIGNAL_PRESENT",
    }),
  });
});
const failures = [];
const runtimeErrors = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function watchRuntime(page) {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 503")) runtimeErrors.push(message.text());
  });
}

async function open(path) {
  const page = await context.newPage();
  watchRuntime(page);
  const response = await page.goto(new URL(path, baseUrl).toString(), {
    waitUntil: "networkidle",
  });
  check(response?.status() === 200, `${path} returned HTTP ${response?.status()}`);
  await page.getByRole("button", { name: "বাংলা" }).click();
  return page;
}

async function completeScreeningStep(
  page,
  referralValue,
  {
    coughDays = "14",
    yesAnswers = [],
    expectedOutcome = "FORMAL_TB_EVALUATION_RECOMMENDED",
    audioMode = "skip",
  } = {},
) {
  await page.getByRole("button", { name: "বাংলা" }).click();
  const concernStage = page.locator('[data-screening-stage="concern"]');
  if (await concernStage.isVisible()) {
    await concernStage.locator(".pathway-card").first().click();
  }
  const consentStage = page.locator('[data-screening-stage="consent"]');
  const consentButton = consentStage.locator(".button-primary");
  check(await consentButton.isEnabled(), "Consent action is not available");
  await consentButton.click();

  const questionsStage = page.locator('[data-screening-stage="questions"]');
  check(await page.locator(".entry-context").isVisible(), "Entry context disappeared after consent");
  const finishAnswers = questionsStage.locator('button[type="submit"]');
  check(await finishAnswers.isDisabled(), "Incomplete symptom answers could be submitted");
  await questionsStage.locator('input[name="age-band"][value="ADULT"]').check();
  check((await questionsStage.locator("#cough-days").count()) === 1, "Cough-duration question is missing");
  await questionsStage.locator("#cough-days").fill("-1");
  check(await finishAnswers.isDisabled(), "A negative cough duration enabled submission");
  await questionsStage.locator("#cough-days").fill(coughDays);
  const yesNoGroups = ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"];
  for (const group of yesNoGroups) {
    const choices = questionsStage.locator(`input[name="${group}"]`);
    check((await choices.count()) === 2, `${group} does not have exactly yes/no choices`);
    const answer = yesAnswers.includes(group) ? "yes" : "no";
    await questionsStage.locator(`input[name="${group}"][value="${answer}"]`).check();
  }
  check(await finishAnswers.isDisabled(), "Symptom answers continued without a broad-area choice");
  check((await questionsStage.locator('input[name="area"]').count()) === 8, "The eight nationwide division choices are not available");
  check((await questionsStage.locator('input[type="text"][name="address"]').count()) === 0, "Screening asks for an exact address");
  check((await questionsStage.locator('input[name="latitude"], input[name="longitude"]').count()) === 0, "Screening asks for GPS coordinates");
  await questionsStage.locator('input[name="area"][value="Khulna"]').check();
  check(!(await finishAnswers.isDisabled()), "Complete symptom answers could not be submitted");
  await finishAnswers.click();

  const audioStage = page.locator('[data-screening-stage="audio"]');
  check(await audioStage.isVisible(), "Cough-audio step was not shown after the questions");
  check((await audioStage.locator('input[name="coughAudio"][type="file"][accept="audio/*"]').count()) === 1, "Audio upload input is missing");
  check((await audioStage.locator('input[name="deviceCoughAudio"][type="file"][accept="audio/*"][capture="user"]').count()) === 1, "Native device-recorder fallback is missing or has the wrong capture mode");
  if (audioMode === "native-insecure") {
    await audioStage.locator('[data-direct-recording="needs-https"]').waitFor({ state: "visible" });
    check((await audioStage.getByRole("button", { name: /রেকর্ডিং শুরু করুন|Start recording/ }).count()) === 0, "Insecure HTTP offered a browser microphone action that cannot work");
    check(await audioStage.getByText(/HTTP লিঙ্কে ব্রাউজার সরাসরি মাইক খুলতে পারে না/).isVisible(), "Insecure HTTP guidance is missing");
    check(await audioStage.getByText("এই ফোনে রেকর্ড করুন", { exact: true }).isVisible(), "Native phone recording is not the primary insecure-context action");
    check((await audioStage.getByRole("progressbar", { name: /Microphone sound level/ }).count()) === 0, "An inactive sound meter was shown when browser capture was unavailable");
  } else {
    await audioStage.locator('[data-direct-recording]:not([data-direct-recording="checking"])').waitFor({ state: "visible" });
    const directCaptureState = await audioStage.locator("[data-direct-recording]").getAttribute("data-direct-recording");
    if (directCaptureState === "available") {
      check(await audioStage.getByRole("button", { name: /রেকর্ডিং শুরু করুন|Start recording/ }).isVisible(), "Browser recording action is missing");
      check(await audioStage.getByText("শব্দের মাত্রা", { exact: true }).isVisible(), "The sound meter has no visible Bangla label");
      check((await audioStage.getByRole("progressbar", { name: /Microphone sound level/ }).count()) === 1, "The accessible sound meter is missing");
    } else {
      check(!["record", "denied", "pending", "timeout"].includes(audioMode), `The ${audioMode} test unexpectedly ran without direct microphone support`);
      check(await audioStage.getByText("এই ফোনে রেকর্ড করুন", { exact: true }).isVisible(), "Native phone recording was unavailable on an insecure entry URL");
    }
  }
  const audioStageSize = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(audioStageSize.scrollWidth <= audioStageSize.clientWidth + 1, "The mobile cough-audio step overflows horizontally");

  if (audioMode === "native-insecure") {
    const nativeInput = audioStage.locator('input[name="deviceCoughAudio"]');
    const nativeCheck = audioStage.getByText("অডিওর মান ও কাশির সংকেত যাচাই করা হচ্ছে...", { exact: true }).waitFor({ state: "visible" });
    await nativeInput.setInputFiles({ name: "phone-recording.wav", mimeType: "audio/wav", buffer: createWav({ durationSeconds: 3 }) });
    await nativeCheck;
    await audioStage.getByText("পরীক্ষামূলক অ্যাকুস্টিক ফলাফল", { exact: true }).waitFor({ state: "visible" });
    check((await audioStage.locator("[data-audio-player] audio").count()) === 1, "Native phone recording was not accepted for playback");
    await audioStage.getByRole("button", { name: "ফলাফল নিয়ে এগিয়ে যান" }).click();
  } else if (audioMode === "upload") {
    await page.getByRole("button", { name: "en" }).click();
    const audioInput = audioStage.locator('input[name="coughAudio"]');
    await audioInput.setInputFiles({ name: "not-audio.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") });
    check(await audioStage.getByText("Choose an audio file only.", { exact: true }).isVisible(), "Non-audio upload was not rejected");

    const quietCheck = audioStage.getByText("Checking audio quality and cough signal...", { exact: true }).waitFor({ state: "visible" });
    await audioInput.setInputFiles({ name: "silent.wav", mimeType: "audio/wav", buffer: createWav({ amplitude: 0 }) });
    await quietCheck;
    await audioStage.getByText(/silent or too quiet/i).waitFor({ state: "visible" });

    const audibleCheck = audioStage.getByText("Checking audio quality and cough signal...", { exact: true }).waitFor({ state: "visible" });
    await audioInput.setInputFiles({ name: "audible.wav", mimeType: "audio/wav", buffer: createWav({ durationSeconds: 36.6 }) });
    await audibleCheck;
    await audioStage.getByText("Experimental acoustic result", { exact: true }).waitFor({ state: "visible" });
    check(await audioStage.getByText("Supporting experimental HeAR signal", { exact: true }).isVisible(), "The acoustic output is not labelled as secondary supporting information");
    check(await audioStage.getByText(/This does not diagnose TB and cannot change the fixed symptom-based safety result/).isVisible(), "The acoustic output does not explain its supporting-only, non-diagnostic role");
    check(!(await audioStage.getByText(/chance of TB/i).count()), "The acoustic output contains a prohibited TB probability claim");
    const audioPlayer = audioStage.locator("[data-audio-player]");
    const playbackProgress = audioPlayer.getByRole("progressbar", { name: /Audio playback progress/ });
    check((await audioPlayer.locator("audio").count()) === 1, "Uploaded audio has no playback source");
    const playbackDuration = Number(await playbackProgress.getAttribute("aria-valuemax"));
    check(Math.abs(playbackDuration - 36.6) < 0.2, `Custom player duration is inaccurate (${playbackDuration}s)`);
    await audioPlayer.getByRole("button", { name: /Play audio/ }).click();
    await page.waitForTimeout(3_000);
    const playbackTime = Number(await playbackProgress.getAttribute("aria-valuenow"));
    check(playbackTime >= 2 && playbackTime <= 5, `Custom player elapsed time is inaccurate after 3 seconds (${playbackTime}s)`);
    check(playbackTime / playbackDuration < 0.15, "Custom player progress incorrectly appears near completion");
    const resultStageSize = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    check(resultStageSize.scrollWidth <= resultStageSize.clientWidth + 1, "The custom audio player overflows the mobile viewport");
    await audioPlayer.getByRole("button", { name: /Pause audio/ }).click();
    check(await audioStage.getByText("Cough-like signal found", { exact: true }).isVisible(), "The real acoustic response was not rendered");
    check(await audioStage.getByText("1.0.0 · HEAR-COUGH-PRESENCE-TEST", { exact: true }).isVisible(), "The HeAR and classifier versions are missing");
    await audioStage.getByRole("button", { name: "Continue with result" }).click();
    await page.getByRole("button", { name: "বাংলা" }).click();
  } else if (audioMode === "record") {
    await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).click();
    await audioStage.getByText("মাইক চালু—রেকর্ডিং চলছে", { exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const meter = document.querySelector('[data-screening-stage="audio"] .audio-level span');
      return meter instanceof HTMLElement && Number.parseFloat(meter.style.width) > 0;
    });
    const recordingLayoutIsSeparated = await audioStage.evaluate((stage) => {
      const status = stage.querySelector(".recording-status")?.getBoundingClientRect();
      const heading = stage.querySelector(".audio-level-heading")?.getBoundingClientRect();
      return Boolean(status && heading && status.bottom <= heading.top);
    });
    check(recordingLayoutIsSeparated, "Recording status overlaps the sound-meter heading");
    await page.waitForTimeout(1_000);
    const recordedCheck = audioStage.getByText("অডিওর মান ও কাশির সংকেত যাচাই করা হচ্ছে...", { exact: true }).waitFor({ state: "visible" });
    await audioStage.getByRole("button", { name: "রেকর্ডিং বন্ধ করুন" }).click();
    await recordedCheck;
    await audioStage.getByText("পরীক্ষামূলক অ্যাকুস্টিক ফলাফল", { exact: true }).waitFor({ state: "visible" });
    check((await audioStage.locator("[data-audio-player] audio").count()) === 1, "Recorded audio has no playback source");
    check(await audioStage.getByRole("button", { name: /অডিও চালান|Play audio/ }).isVisible(), "Recorded audio has no accessible playback action");
    await audioStage.getByRole("button", { name: "ফলাফল নিয়ে এগিয়ে যান" }).click();
  } else if (audioMode === "denied") {
    await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).click();
    await audioStage.getByText(/মাইক্রোফোনের অনুমতি বন্ধ আছে/).waitFor({ state: "visible" });
    check(!(await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).isDisabled()), "Recording could not be retried after permission was denied");
    await audioStage.getByRole("button", { name: "এখন অডিও দেব না" }).click();
  } else if (audioMode === "pending") {
    await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).click();
    await audioStage.getByRole("button", { name: "অপেক্ষা বন্ধ করুন" }).waitFor({ state: "visible" });
    await audioStage.getByRole("button", { name: "অপেক্ষা বন্ধ করুন" }).click();
    await audioStage.getByText(/মাইক্রোফোনের অনুরোধ বন্ধ করা হয়েছে/).waitFor({ state: "visible" });
    check(!(await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).isDisabled()), "A pending microphone request could not be cancelled and retried");
    await audioStage.getByRole("button", { name: "এখন অডিও দেব না" }).click();
  } else if (audioMode === "timeout") {
    await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).click();
    await audioStage.getByText(/নিজে থেকে বন্ধ হবে/).waitFor({ state: "visible" });
    await audioStage.getByText(/মাইক্রোফোনের অনুমতির উত্তর পাওয়া যায়নি/).waitFor({ state: "visible", timeout: 15_000 });
    check(!(await audioStage.getByRole("button", { name: "রেকর্ডিং শুরু করুন" }).isDisabled()), "A timed-out microphone request could not be retried");
    await audioStage.getByRole("button", { name: "এখন অডিও দেব না" }).click();
  } else {
    await audioStage.getByRole("button", { name: "এখন অডিও দেব না" }).click();
  }

  const referralStage = page.locator('[data-screening-stage="referral"]');
  const expectedOutcomeLabel = expectedOutcome === "CONTINUE_SCREENING"
    ? "সেবার তথ্য"
    : expectedOutcome === "URGENT_MEDICAL_EVALUATION"
      ? "জরুরি চিকিৎসা মূল্যায়ন"
      : "পেশাদার মূল্যায়নের পরামর্শ";
  check(
    (await referralStage.textContent())?.includes(expectedOutcomeLabel),
    `Expected safety outcome ${expectedOutcome} was not shown`,
  );
  check(await page.locator(".entry-context").isVisible(), "Entry context disappeared during referral choice");
  const confirmChoice = referralStage.locator(referralValue === "continue" ? ".button-primary" : ".button-secondary");
  check(await confirmChoice.isEnabled(), "Referral action is not available");
  await confirmChoice.click();
  await page.locator('[data-screening-stage="complete"]').waitFor({ state: "visible" });
  check(await page.locator(".entry-context").isVisible(), "Entry context disappeared after completion");
}

const homePage = await open("/");
check(
  (await homePage.locator('a[href="/screen?source=self"]').count()) > 0,
  "Self-use entry link is missing",
);
check(
  (await homePage.locator('a[href^="/screen?source=pharmacy&pharmacy="]').count()) > 0,
  "Pharmacy-assisted entry link is missing",
);

const homeQrImages = homePage.locator(".pharmacy-qr-card img[data-qr-value]");
await homeQrImages.first().waitFor({ state: "visible" });
check(
  await homeQrImages.count() === 3,
  `Expected 3 example pharmacy QR codes on the homepage, found ${await homeQrImages.count()}`,
);

const directoryPage = await open("/pharmacies");
const qrImages = directoryPage.locator(".pharmacy-qr-card img[data-qr-value]");
await qrImages.first().waitFor({ state: "visible" });
const qrCount = await qrImages.count();
check(qrCount > 0, "No pharmacy QR codes were generated");
check(qrCount === 10, `Expected QR codes for all 10 demo pharmacies in the directory, found ${qrCount}`);

const firstQrValues = [];
const seenPharmacyIds = new Set();

function localTestUrl(externalUrl) {
  const parsed = new URL(externalUrl);
  return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, baseUrl).toString();
}

for (let index = 0; index < qrCount; index += 1) {
  const image = qrImages.nth(index);
  const card = image.locator("xpath=ancestor::*[contains(@class, 'pharmacy-qr-card')]");
  const pharmacyId = (await card.locator(".pharmacy-id").textContent())?.trim();
  const qrValue = await image.getAttribute("data-qr-value");
  const source = await image.getAttribute("src");

  check(Boolean(pharmacyId), `QR ${index + 1} has no visible pharmacy ID`);
  check(Boolean(qrValue), `QR ${index + 1} has no encoded URL`);
  check(Boolean(source?.startsWith("data:image/png;base64,")), `QR ${index + 1} is not a PNG data URL`);

  if (!pharmacyId || !qrValue || !source) continue;

  const parsedUrl = new URL(qrValue);
  if (expectedQrHost) check(parsedUrl.hostname === expectedQrHost, `${pharmacyId} QR does not use the expected mobile-reachable host`);
  check(parsedUrl.searchParams.get("source") === "pharmacy", `${pharmacyId} QR source is not pharmacy`);
  check(parsedUrl.searchParams.get("pharmacy") === pharmacyId, `${pharmacyId} QR does not retain its pharmacy ID`);
  check(!seenPharmacyIds.has(pharmacyId), `Duplicate pharmacy ID: ${pharmacyId}`);
  seenPharmacyIds.add(pharmacyId);

  const png = PNG.sync.read(Buffer.from(source.split(",")[1], "base64"));
  const pixels = new Uint8ClampedArray(
    png.data.buffer,
    png.data.byteOffset,
    png.data.byteLength,
  );
  const decoded = jsQR(pixels, png.width, png.height);
  check(Boolean(decoded), `${pharmacyId} QR could not be decoded`);
  check(decoded?.data === qrValue, `${pharmacyId} QR decoded to a different URL`);

  const scanPage = await open(localTestUrl(qrValue));
  const scanContext = await scanPage.locator(".entry-context").textContent();
  check(scanContext?.includes(pharmacyId), `${pharmacyId} was not restored after scanning its QR`);
  await scanPage.close();

  firstQrValues.push(qrValue);
}

await directoryPage.reload({ waitUntil: "networkidle" });
const reloadedImages = directoryPage.locator(".pharmacy-qr-card img[data-qr-value]");
await reloadedImages.first().waitFor({ state: "visible" });
const reloadedQrValues = await reloadedImages.evaluateAll((images) =>
  images.map((image) => image.getAttribute("data-qr-value")),
);
check(
  JSON.stringify(reloadedQrValues) === JSON.stringify(firstQrValues),
  "Pharmacy QR URLs changed after reloading the directory",
);
await directoryPage.close();

await homePage.getByRole("button", { name: "en" }).click();
check(
  await homePage.getByRole("link", { name: /Check from home/i }).first().isVisible(),
  "English self-use entry is not accessible",
);
check(
  await homePage.getByRole("link", { name: /Pharmacy-assisted check/i }).first().isVisible(),
  "English pharmacy-assisted entry is not accessible",
);
check(
  await homePage.getByRole("link", { name: /View all pharmacies/i }).isVisible(),
  "The full pharmacy directory link is not accessible",
);

const dimensions = await homePage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
check(
  dimensions.scrollWidth <= dimensions.clientWidth + 1,
  `Mobile landing page overflows horizontally (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px)`,
);
await homePage.close();

const selfPage = await open("/screen?source=self");
const selfContext = await selfPage.locator(".entry-context").textContent();
check(selfContext?.includes("আপনি নিজের ডিভাইস থেকে স্ক্রিনিং করছেন।"), "Self-use entry message was not restored");
check(!selfContext?.includes("PHARMACY_"), "Self-use entry incorrectly contains a pharmacy ID");
await selfPage.getByRole("button", { name: "en" }).click();
check(
  await selfPage.getByText("You are checking from your own device.", { exact: true }).isVisible(),
  "English self-use entry message is missing",
);
await selfPage.getByRole("button", { name: "বাংলা" }).click();
await completeScreeningStep(selfPage, "continue", { audioMode: "upload" });
await selfPage.getByRole("button", { name: "en" }).click();
check(
  !(await selfPage.getByText(/you have an? .*chance of TB/i).count()),
  "The completed screening contains a prohibited TB probability claim",
);
await selfPage.close();

const continuePage = await open("/screen?source=self");
await completeScreeningStep(continuePage, "not-now", {
  coughDays: "13",
  expectedOutcome: "CONTINUE_SCREENING",
});
check(
  (await continuePage.locator('[data-screening-stage="complete"]').textContent())?.includes("অসুস্থতা নেই প্রমাণ হয় না"),
  "Continue-screening result gives no clear non-reassurance message",
);
await continuePage.close();

const urgentPage = await open("/screen?source=self");
await completeScreeningStep(urgentPage, "continue", {
  coughDays: "0",
  yesAnswers: ["bloodInSputum"],
  expectedOutcome: "URGENT_MEDICAL_EVALUATION",
  audioMode: "record",
});
await urgentPage.getByRole("button", { name: "en" }).click();
check(
  await urgentPage.getByText(/call Bangladesh National Emergency Service 999/i).isVisible(),
  "English urgent result does not provide Bangladesh emergency guidance",
);
check(
  await urgentPage.getByText(/does not replace emergency care/i).isVisible(),
  "Urgent result does not distinguish a TB referral from emergency care",
);
await urgentPage.close();

const deniedMicrophonePage = await context.newPage();
watchRuntime(deniedMicrophonePage);
await deniedMicrophonePage.addInitScript(() => {
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: () => Promise.reject(new DOMException("Permission denied for test", "NotAllowedError")),
  });
});
const deniedResponse = await deniedMicrophonePage.goto(new URL("/screen?source=self", baseUrl).toString(), { waitUntil: "networkidle" });
check(deniedResponse?.status() === 200, `Microphone-denied screen returned HTTP ${deniedResponse?.status()}`);
await completeScreeningStep(deniedMicrophonePage, "not-now", { audioMode: "denied" });
await deniedMicrophonePage.close();

const pendingMicrophonePage = await context.newPage();
watchRuntime(pendingMicrophonePage);
await pendingMicrophonePage.addInitScript(() => {
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: () => new Promise(() => {}),
  });
});
const pendingResponse = await pendingMicrophonePage.goto(new URL("/screen?source=self", baseUrl).toString(), { waitUntil: "networkidle" });
check(pendingResponse?.status() === 200, `Microphone-pending screen returned HTTP ${pendingResponse?.status()}`);
await completeScreeningStep(pendingMicrophonePage, "not-now", { audioMode: "pending" });
await pendingMicrophonePage.close();

const timedOutMicrophonePage = await context.newPage();
watchRuntime(timedOutMicrophonePage);
await timedOutMicrophonePage.addInitScript(() => {
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    configurable: true,
    value: () => new Promise(() => {}),
  });
});
const timedOutResponse = await timedOutMicrophonePage.goto(new URL("/screen?source=self", baseUrl).toString(), { waitUntil: "networkidle" });
check(timedOutResponse?.status() === 200, `Microphone-timeout screen returned HTTP ${timedOutResponse?.status()}`);
await completeScreeningStep(timedOutMicrophonePage, "not-now", { audioMode: "timeout" });
await timedOutMicrophonePage.close();

const insecureMobilePage = await context.newPage();
watchRuntime(insecureMobilePage);
await insecureMobilePage.addInitScript(() => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
});
const insecureResponse = await insecureMobilePage.goto(new URL("/screen?source=self", baseUrl).toString(), { waitUntil: "networkidle" });
check(insecureResponse?.status() === 200, `Insecure-context mobile test returned HTTP ${insecureResponse?.status()}`);
await completeScreeningStep(insecureMobilePage, "not-now", { audioMode: "native-insecure" });
await insecureMobilePage.close();

const assistedPage = await open(localTestUrl(firstQrValues[0]));
check((await assistedPage.locator('input[type="tel"]').count()) === 0, "Pharmacy-assisted screening incorrectly requires a phone number");
await assistedPage.getByRole("button", { name: "en" }).click();
check(
  await assistedPage.getByText("This screening is being assisted by Rahman Pharmacy.", { exact: true }).isVisible(),
  "English pharmacy-assisted entry message is missing or lost its pharmacy name",
);
await assistedPage.getByRole("button", { name: "বাংলা" }).click();
await completeScreeningStep(assistedPage, "not-now");
const assistedComplete = assistedPage.locator('[data-screening-stage="complete"]');
await assistedComplete.locator('button[type="button"]').click();
const resetConcern = assistedPage.locator('[data-screening-stage="concern"]');
check(await resetConcern.isVisible(), "Shared-device answers could not be cleared");
await resetConcern.locator(".pathway-card").first().click();
await assistedPage.locator('[data-screening-stage="consent"] .button-primary').click();
check(
  (await assistedPage.locator('[data-screening-stage="questions"] input[name="area"]:checked').count()) === 0,
  "Broad-area choice remained after clearing the shared-device session",
);
await assistedPage.getByRole("button", { name: "en" }).click();
await assistedPage.close();

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "computer", width: 1280, height: 900 },
]) {
  const deviceContext = await browser.newContext({ viewport });
  const devicePage = await deviceContext.newPage();
  watchRuntime(devicePage);
  const response = await devicePage.goto(localTestUrl(firstQrValues[0]), { waitUntil: "networkidle" });
  check(response?.status() === 200, `Pharmacy-assisted ${viewport.name} view returned HTTP ${response?.status()}`);
  check(await devicePage.locator('[data-screening-stage="concern"]').isVisible(), `Concern selection is not visible on a pharmacy ${viewport.name}`);
  const size = await devicePage.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(size.scrollWidth <= size.clientWidth + 1, `Pharmacy ${viewport.name} view overflows horizontally`);
  await deviceContext.close();
}

for (const invalidPath of [
  "/screen?source=pharmacy",
  "/screen?source=pharmacy&pharmacy=UNKNOWN",
]) {
  const invalidPage = await open(invalidPath);
  check(
    (await invalidPage.locator(".entry-error").count()) === 1,
    `${invalidPath} did not show a safe invalid-entry state`,
  );
  check(
    (await invalidPage.locator(".entry-context").count()) === 0,
    `${invalidPath} was incorrectly accepted as a valid pharmacy entry`,
  );
  await invalidPage.close();
}

await context.close();
await browser.close();
unlinkSync(fakeAudioPath);

for (const runtimeError of runtimeErrors) {
  failures.push(`Browser runtime error: ${runtimeError}`);
}

if (failures.length) {
  console.error("Entry-path check failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${qrCount} persistent pharmacy QR codes.`);
  console.log("Consent, audio recording/upload/quality failures, all three safety outcomes, referral choice, and shared-device clearing passed.");
  console.log("Self-use, pharmacy-assisted, invalid-link, English, and mobile checks passed.");
}
