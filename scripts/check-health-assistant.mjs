import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.route("**/api/health-assistant", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ signedIn: false, messages: [] }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        answer: "A cough lasting two weeks or more should receive formal TB evaluation. This is health education, not a diagnosis.",
        citations: [{ title: "WHO tuberculosis fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/tuberculosis" }],
      }),
    });
  });

  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/assistant`, { waitUntil: "networkidle" });
  if (response?.status() !== 200) throw new Error(`/assistant returned HTTP ${response?.status()}`);
  if (!await page.getByText("TB and health companion", { exact: true }).isVisible()) throw new Error("English assistant heading is missing");

  await page.locator("#health-question").fill("When should a cough receive formal evaluation?");
  await page.getByRole("button", { name: "Ask" }).click();
  await page.getByText(/two weeks or more/i).waitFor();
  if (!await page.getByRole("link", { name: "WHO tuberculosis fact sheet" }).isVisible()) throw new Error("Assistant citation is missing");
  if (!await page.getByRole("button", { name: "Record voice" }).isVisible()) throw new Error("Voice action is missing");
  if (!await page.locator('input[type="file"][accept*="image/jpeg"][accept*="audio/wav"]').isVisible()) throw new Error("Assistant media input is missing");

  const noOverflow = async (label) => {
    const size = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (size.scrollWidth > size.clientWidth + 1) throw new Error(`${label} overflowed (${size.scrollWidth}px > ${size.clientWidth}px)`);
  };
  await noOverflow("English assistant");
  const englishFont = await page.locator('[lang="en"]').first().evaluate((node) => getComputedStyle(node).fontFamily);
  if (!englishFont.includes("Merriweather")) throw new Error(`English font mismatch: ${englishFont}`);

  await page.getByRole("button", { name: "বাংলা" }).click();
  if (!await page.getByText("যক্ষ্মা ও স্বাস্থ্য সহায়ক", { exact: true }).isVisible()) throw new Error("Bangla assistant heading is missing");
  await noOverflow("Bangla assistant");
  const banglaFont = await page.getByText("যক্ষ্মা ও স্বাস্থ্য সহায়ক", { exact: true }).evaluate((node) => getComputedStyle(node).fontFamily);
  if (!banglaFont.includes("Noto Sans Bengali")) throw new Error(`Bangla font mismatch: ${banglaFont}`);

  const invalid = new FormData();
  invalid.set("language", "en");
  invalid.set("message", "Please inspect this attachment.");
  invalid.set("media", new File([new Uint8Array([1, 2, 3, 4])], "unsafe.exe", { type: "application/octet-stream" }));
  const invalidResponse = await fetch(`${baseUrl}/api/health-assistant`, { method: "POST", body: invalid });
  if (invalidResponse.status !== 400) throw new Error(`Invalid assistant media returned HTTP ${invalidResponse.status}`);

  await context.close();
  console.log("Health assistant bilingual chat, citations, voice/media controls, invalid-media rejection, fonts, and mobile width passed.");
} finally {
  await browser.close();
}
