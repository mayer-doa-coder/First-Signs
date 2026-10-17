import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const routes = ["/", "/screen", "/care", "/referral", "/verify", "/pharmacy", "/dashboard", "/community"];
const viewports = [
  { name: "small-mobile", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "wide-desktop", width: 1920, height: 1080 },
];

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
await mkdir(".artifacts", { recursive: true });

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });

  for (const route of routes) {
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "networkidle" });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const routeName = route === "/" ? "home" : route.slice(1);
    await page.screenshot({ path: `.artifacts/${routeName}-${viewport.name}.png` });

    if (response?.status() !== 200) failures.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    if (dimensions.scrollWidth > dimensions.clientWidth + 1) {
      failures.push(`${viewport.name} ${route}: horizontal overflow ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`);
    }
    if (runtimeErrors.length) failures.push(`${viewport.name} ${route}: ${runtimeErrors.join(" | ")}`);

    const defaultState = await page.evaluate(() => ({
      documentLanguage: document.documentElement.lang,
      activeLanguage: document.querySelector('.language-option[aria-pressed="true"] span')?.getAttribute("lang"),
    }));
    if (defaultState.documentLanguage !== "en" || defaultState.activeLanguage !== "en") {
      failures.push(`${viewport.name} ${route}: English is not the default language`);
    }
    const englishState = await page.evaluate(() => ({
      documentLanguage: document.documentElement.lang,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const englishHeadingVisible = await page.locator('h1 [lang="en"]').isVisible();
    if (!englishHeadingVisible || englishState.documentLanguage !== "en") {
      failures.push(`${viewport.name} ${route}: English content is not available`);
    }
    if (englishState.scrollWidth > englishState.clientWidth + 1) {
      failures.push(`${viewport.name} ${route}: English horizontal overflow ${englishState.scrollWidth}px > ${englishState.clientWidth}px`);
    }

    await page.getByRole("button", { name: "বাংলা" }).click();
    const banglaState = await page.evaluate(() => ({
      documentLanguage: document.documentElement.lang,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const banglaHeadingVisible = await page.locator('h1 [lang="bn"]').isVisible();
    if (!banglaHeadingVisible || banglaState.documentLanguage !== "bn") {
      failures.push(`${viewport.name} ${route}: Bangla content is not available`);
    }
    if (banglaState.scrollWidth > banglaState.clientWidth + 1) {
      failures.push(`${viewport.name} ${route}: Bangla horizontal overflow ${banglaState.scrollWidth}px > ${banglaState.clientWidth}px`);
    }

    console.log(`PASS ${viewport.name.padEnd(7)} ${route.padEnd(11)} ${dimensions.clientWidth}x${viewport.height}`);
    await page.close();
  }

  await context.close();
}

const languageContext = await browser.newContext({ viewport: viewports[0] });
const languagePage = await languageContext.newPage();
await languagePage.goto(new URL("/", baseUrl).toString(), { waitUntil: "networkidle" });

const defaultLanguage = await languagePage.locator('.language-option[aria-pressed="true"] span').getAttribute("lang");
const englishFont = await languagePage.locator('h1 [lang="en"]').evaluate((element) => getComputedStyle(element).fontFamily);
const defaultDocumentLanguage = await languagePage.evaluate(() => document.documentElement.lang);
await languagePage.getByRole("button", { name: "বাংলা" }).click();
const banglaFont = await languagePage.locator('h1 [lang="bn"]').evaluate((element) => getComputedStyle(element).fontFamily);
const currentDocumentLanguage = await languagePage.evaluate(() => document.documentElement.lang);

console.log(`FONT bn ${banglaFont}`);
console.log(`FONT en ${englishFont}`);

if (defaultLanguage !== "en") failures.push(`Default language is ${defaultLanguage}, expected en`);
if (defaultDocumentLanguage !== "en") failures.push("Initial document language is not English");
if (currentDocumentLanguage !== "bn") failures.push("Bangla switch did not update the document language");
if (!/Noto(?:_| )Sans(?:_| )Bengali/i.test(banglaFont)) failures.push(`Bangla font mismatch: ${banglaFont}`);
if (!/Merriweather/i.test(englishFont)) failures.push(`English font mismatch: ${englishFont}`);

await languageContext.close();
await browser.close();

if (failures.length) {
  console.error("\nUI CHECK FAILURES");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nAll route, viewport, runtime, language, and font checks passed.");
}
