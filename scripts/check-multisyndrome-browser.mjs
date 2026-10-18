import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];

function check(condition, message) { if (!condition) failures.push(message); }

const pathways = [
  { index: 0, id: "RESPIRATORY_TB", answer: "coughDays" },
  { index: 1, id: "FEVER_MOSQUITO", answer: "currentFever" },
  { index: 2, id: "DIARRHOEA_DEHYDRATION", answer: "frequentLooseStool" },
  { index: 3, id: "SKIN_NERVE_LEPROSY", answer: "numbPatch" },
  { index: 4, id: "CHILD_BREATHING", answer: "coughOrDifficultBreathing" },
];

for (const language of ["en", "bn"]) {
  for (const pathway of pathways) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("**/api/signals", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ accepted: true }) }));
    await context.route("**/api/screenings", async (route) => {
      const input = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ screening: { screeningId: input.screeningId, created: true, screeningRewardCreated: false, rewardEligible: true, rewardStatus: null, rewardWarning: null, possibleReusedAudio: false, activityRequiresReview: false } }) });
    });
    await context.route("**/api/referrals", async (route) => {
      const input = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ referral: { referralId: "JVH-KHU-99999", accessToken: "123e4567-e89b-42d3-a456-426614174000", status: "PENDING", tbCenterId: input.facilityId, facilityId: input.facilityId, pathwayId: input.pathwayId, centreName: "Test Government Facility", centreArea: "Dhaka", centreDistrict: "Dhaka", serviceType: "Evaluation", createdAt: new Date().toISOString(), rewardCreated: false, rewardEligible: false, rewardStatus: null, rewardWarning: null, possibleReusedAudio: false, activityRequiresReview: false } }) });
    });

    const page = await context.newPage();
    const response = await page.goto(`${baseUrl}/screen?source=self`, { waitUntil: "networkidle" });
    check(response?.status() === 200, `${language}/${pathway.id}: page did not return 200`);
    if (language === "bn") await page.getByRole("button", { name: "বাংলা" }).click();
    check(await page.locator("html").getAttribute("lang") === language, `${language}/${pathway.id}: document language did not switch`);
    await page.locator(".pathway-card").nth(pathway.index).click();
    await page.locator('[data-screening-stage="consent"] .button-primary').click();
    await page.locator('input[name="age-band"][value="AGE_5_TO_17"]').check();
    if (pathway.id === "RESPIRATORY_TB") await page.locator("#cough-days").fill("14");
    const questionNames = await page.locator('[data-screening-stage="questions"] .question-block input[type="radio"]').evaluateAll((inputs) => [...new Set(inputs.map((input) => input.name).filter((name) => !["age-band", "area"].includes(name))) ]);
    for (const name of questionNames) await page.locator(`input[name="${name}"][value="no"]`).check();
    if (pathway.answer !== "coughDays") await page.locator(`input[name="${pathway.answer}"][value="yes"]`).check();
    await page.locator('input[name="area"][value="Dhaka"]').check();
    await page.locator('[data-screening-stage="questions"] button[type="submit"]').click();
    if (pathway.id === "RESPIRATORY_TB") await page.locator('[data-screening-stage="audio"] .button-quiet').last().click();
    await page.locator('[data-screening-stage="referral"] .button-primary').click();
    await page.locator('[data-screening-stage="complete"]').waitFor();
    check(await page.locator('[data-screening-stage="complete"]').isVisible(), `${language}/${pathway.id}: journey did not complete`);
    const sample = page.locator(`[lang="${language}"]`).first();
    const font = await sample.evaluate((node) => getComputedStyle(node).fontFamily);
    check(font.toLowerCase().includes(language === "bn" ? "noto sans bengali" : "merriweather"), `${language}/${pathway.id}: wrong font ${font}`);
    await context.close();
  }
}

await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("Multi-syndrome mobile smoke passed: 5 pathways × English/Bangla.");
