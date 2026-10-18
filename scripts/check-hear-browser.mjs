import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

function wavSample() {
  const rate = 16_000, frames = rate, bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index += 1) bytes.writeInt16LE(Math.round(Math.sin(index / 15) * 8_000), 44 + index * 2);
  return { name: "cough.wav", mimeType: "audio/wav", buffer: bytes };
}

async function reachAudio(page) {
  await page.goto(`${baseUrl}/screen?source=self`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor({ state: "visible" });
  await page.waitForLoadState("load");
  const consent = page.locator('[data-screening-stage="consent"]'); await consent.locator('input[type="checkbox"]').check(); await consent.locator('button[type="button"]').click();
  const questions = page.locator('[data-screening-stage="questions"]'); await questions.locator("#cough-days").fill("14");
  for (const name of ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"]) await questions.locator(`input[name="${name}"][value="no"]`).check();
  await questions.locator('input[name="area"][value="Khulna"]').check(); await questions.locator('button[type="submit"]').click();
  return page.locator('[data-screening-stage="audio"]');
}

const sample = wavSample();
const analysis = { available: true, model: "GOOGLE_HEAR", modelVersion: "1.0.0", classifierVersion: "HEAR-COUGH-PRESENCE-V1", embeddingCreated: true, coughDetected: true, signal: "COUGH_LIKE_SIGNAL_PRESENT", triage: { band: "ELEVATED_ACOUSTIC_CONCERN", modelVersion: "TBSCREEN-HEAR-TRIAGE-TEST", inputMode: "AUDIO_PLUS_SCREENING_ANSWERS" } };
try {
  const page = await context.newPage(); await page.route("**/api/audio/analyze", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(analysis) }));
  const audio = await reachAudio(page); await audio.locator('input[name="coughAudio"]').setInputFiles(sample);
  await audio.getByText("Experimental acoustic result", { exact: true }).waitFor({ timeout: 30_000 });
  if (!await audio.getByText("Elevated concern", { exact: true }).isVisible()) throw new Error("English research concern band was not rendered");
  if (await audio.getByText(/TB probability|chance of TB/i).count()) throw new Error("The acoustic UI made a prohibited probability claim");
  await page.getByRole("button", { name: "বাংলা" }).click();
  if (!await audio.getByText("বর্ধিত উদ্বেগ", { exact: true }).isVisible()) throw new Error("Bangla research concern band was not rendered");
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw new Error("The acoustic result overflows a 390px mobile viewport");
  const fallback = await context.newPage(); await fallback.route("**/api/audio/analyze", route => route.abort("failed"));
  const fallbackAudio = await reachAudio(fallback); await fallbackAudio.locator('input[name="coughAudio"]').setInputFiles(sample);
  await fallbackAudio.getByText("Symptom-based fallback active", { exact: true }).waitFor({ timeout: 30_000 });
  console.log("HeAR UI contract, bilingual concern bands, fallback, and mobile layout passed without retaining a CoughVID sample.");
} finally { await browser.close(); }
