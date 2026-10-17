import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3017";
const manifestPath = ".artifacts/datasets/coughvid/prepared/manifest.csv";
const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
const columns = lines[0].split(",");
const pathIndex = columns.indexOf("path");
const labelIndex = columns.indexOf("label");
const positive = lines.slice(1).map((line) => line.split(",")).find((row) => row[labelIndex] === "1");
if (!positive) throw new Error("No positive HeAR verification sample was prepared");
const samplePath = positive[pathIndex];
const mimeByExtension = { ".wav": "audio/wav", ".ogg": "audio/ogg", ".webm": "audio/webm" };
const sample = {
  name: `cough${extname(samplePath)}`,
  mimeType: mimeByExtension[extname(samplePath).toLowerCase()] ?? "audio/mpeg",
  buffer: readFileSync(samplePath),
};

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

async function reachAudio(page) {
  await page.goto(`${baseUrl}/screen?source=self`, { waitUntil: "networkidle" });
  const consent = page.locator('[data-screening-stage="consent"]');
  await consent.locator('input[type="checkbox"]').check();
  await consent.locator('button[type="button"]').click();
  const questions = page.locator('[data-screening-stage="questions"]');
  await questions.locator("#cough-days").fill("14");
  for (const name of ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"]) {
    await questions.locator(`input[name="${name}"][value="no"]`).check();
  }
  await questions.locator('input[name="area"][value="Sonadanga"]').check();
  await questions.locator('button[type="submit"]').click();
  return page.locator('[data-screening-stage="audio"]');
}

try {
  const realPage = await context.newPage();
  const realAudio = await reachAudio(realPage);
  await realAudio.locator('input[name="coughAudio"]').setInputFiles(sample);
  await realAudio.getByText("পরীক্ষামূলক অ্যাকুস্টিক ফলাফল", { exact: true }).waitFor({ timeout: 60_000 });
  if (!await realAudio.getByText("কাশির মতো সংকেত পাওয়া গেছে", { exact: true }).isVisible()) {
    throw new Error("The real HeAR cough-like signal was not rendered");
  }
  if (!await realAudio.getByText("1.0.0 · HEAR-COUGH-PRESENCE-V1", { exact: true }).isVisible()) {
    throw new Error("The real model versions were not rendered");
  }
  if (await realAudio.getByText(/chance of TB|TB probability/i).count()) {
    throw new Error("The acoustic result made a prohibited TB-probability claim");
  }
  const overflow = await realPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error("The HeAR result overflows a 390px mobile viewport");

  const fallbackPage = await context.newPage();
  await fallbackPage.route("**/api/audio/analyze", (route) => route.abort("failed"));
  const fallbackAudio = await reachAudio(fallbackPage);
  await fallbackAudio.locator('input[name="coughAudio"]').setInputFiles(sample);
  await fallbackAudio.getByText("উপসর্গভিত্তিক বিকল্প চালু", { exact: true }).waitFor({ timeout: 30_000 });
  if (!await fallbackAudio.getByText(/অ্যাকুস্টিক প্রক্রিয়াকরণ সম্পন্ন হয়নি/).isVisible()) {
    throw new Error("The symptom-only fallback explanation was not rendered");
  }

  console.log("Real HeAR browser inference and processing-failure fallback passed at 390x844.");
} finally {
  await browser.close();
}
