import { chromium, request as playwrightRequest } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const testSubmissionId = "18000000-0000-4000-8000-00000000b018";
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const api = await playwrightRequest.newContext({ baseURL: baseUrl });
const liveSummary = await api.get("/api/community");
check(liveSummary.status() === 200, `Community summary API returned HTTP ${liveSummary.status()}`);
const liveSummaryBody = await liveSummary.json();
check(typeof liveSummaryBody.summary?.totalResponses === "number", "Community summary API did not return an aggregate count");
check(!JSON.stringify(liveSummaryBody).match(/patient|phone|audio|address/i), "Community summary API exposed a sensitive field");
for (const [label, data] of [
  ["health-status category", { submissionId: "18000000-0000-4000-8000-00000000c018", category: "TB_POSITIVE" }],
  ["malformed UUID", { submissionId: "not-a-uuid", category: "WORK" }],
  ["extra/private field", { submissionId: "18000000-0000-4000-8000-00000000c018", category: "WORK", phone: "01700000000" }],
]) {
  const invalid = await api.post("/api/community", { data });
  check(invalid.status() === 400, `${label} was not rejected with HTTP 400`);
}
await api.dispose();

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript((submissionId) => {
  window.sessionStorage.setItem("jvh-community-submission-id", submissionId);
}, testSubmissionId);
let feedbackCreated = false;
await context.route("**/api/community", async (route) => {
  const request = route.request();
  const counts = {
    WORK: feedbackCreated ? 5 : 4,
    DISTANCE: 3,
    FEAR: 2,
    STIGMA: 1,
    LACK_OF_INFORMATION: 1,
    TRANSPORT: 0,
  };
  if (request.method() === "POST") {
    const input = request.postDataJSON();
    const created = !feedbackCreated && input.submissionId === testSubmissionId;
    feedbackCreated = true;
    await route.fulfill({
      status: created ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify({ created, summary: { totalResponses: 12, counts } }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ summary: { totalResponses: 11, counts } }),
  });
});

const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(30_000);
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));

const response = await page.goto(new URL("/community", baseUrl).toString(), { waitUntil: "domcontentloaded" });
check(response?.status() === 200, `/community returned HTTP ${response?.status()}`);
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("[data-community-engagement]").waitFor();
await page.waitForFunction(() => document.querySelector(".support-card strong")?.textContent !== "—");

check(await page.getByText("সমস্যা থেকে সমাধানের পথে", { exact: true }).isVisible(), "Bangla problem-and-solution section is missing");
check(await page.getByRole("link", { name: "ডেমো শুরু করুন" }).isVisible(), "Demo entry button is missing");
check((await page.locator('input[name="communityBarrier"]').count()) === 6, "The feedback form does not contain exactly six safe categories");
check((await page.locator("textarea").count()) === 0, "Community feedback unexpectedly accepts free text");
check((await page.getByText("অন্যান্য", { exact: true }).count()) === 0, "Undocumented Other category is present");
check(await page.getByText("নিজের বা অন্য কারও যক্ষ্মা অবস্থা জানাবেন না। শুধু একটি সাধারণ বাধা বেছে নিন।", { exact: true }).isVisible(), "TB-status privacy warning is missing");

const submitButton = page.getByRole("button", { name: "মতামত পাঠিয়ে সমর্থন জানান" });
check(await submitButton.isDisabled(), "Feedback can be submitted without selecting a category");
await page.getByRole("radio", { name: "কাজের সময়" }).check();
check(!(await submitButton.isDisabled()), "Feedback remains disabled after selecting a category");
await submitButton.click();
await page.getByText("ধন্যবাদ। আপনার নামবিহীন উত্তরটি মোট ফলাফলে যোগ হয়েছে।", { exact: true }).waitFor();
check(await page.getByRole("button", { name: "মতামত গ্রহণ করা হয়েছে" }).isDisabled(), "A completed form can be submitted repeatedly in the same session");
check((await page.locator('[role="progressbar"]').count()) === 6, "Aggregate feedback percentages are not shown for all categories");
check((await page.locator(".support-card").textContent())?.includes("যাচাইকৃত আলাদা মানুষের সংখ্যা নয়"), "Public count is not accurately qualified");

const retry = await page.evaluate(async ({ submissionId }) => {
  const response = await fetch("/api/community", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId, category: "DISTANCE" }),
  });
  return { status: response.status, body: await response.json() };
}, { submissionId: testSubmissionId });
check(retry.status === 200, `Idempotent API retry returned HTTP ${retry.status}`);
check(retry.body.created === false, "Idempotent API retry created a second response");

await page.getByRole("button", { name: "English" }).click();
check(await page.getByText("What usually prevents people from going for TB testing?", { exact: true }).isVisible(), "English feedback question is unavailable");
check(await page.getByText("Thank you. Your anonymous response has been added to the totals.", { exact: true }).isVisible(), "English success state is unavailable");
const banglaFont = await page.locator('[lang="bn"]').first().evaluate((element) => getComputedStyle(element).fontFamily);
const englishFont = await page.locator('[lang="en"]').first().evaluate((element) => getComputedStyle(element).fontFamily);
check(banglaFont.includes("Noto Sans Bengali"), `Bangla community font is incorrect: ${banglaFont}`);
check(englishFont.includes("Merriweather"), `English community font is incorrect: ${englishFont}`);

const mobileSize = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
check(mobileSize.scrollWidth <= mobileSize.clientWidth + 1, `Mobile community page overflows (${mobileSize.scrollWidth}px > ${mobileSize.clientWidth}px)`);
await page.setViewportSize({ width: 1440, height: 900 });
const desktopSize = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
check(desktopSize.scrollWidth <= desktopSize.clientWidth + 1, `Desktop community page overflows (${desktopSize.scrollWidth}px > ${desktopSize.clientWidth}px)`);
check(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join("; ")}`);

const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await errorContext.route("**/api/community", (route) => route.fulfill({
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "TEST_UNAVAILABLE" }),
}));
const errorPage = await errorContext.newPage();
await errorPage.goto(new URL("/community", baseUrl).toString(), { waitUntil: "domcontentloaded" });
await errorPage.getByRole("button", { name: "বাংলা" }).click();
await errorPage.locator(".community-error").waitFor();
check(await errorPage.getByText("এখন মতামতের তথ্য পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।", { exact: true }).isVisible(), "Bangla database-unavailable state is missing");
await errorPage.getByRole("button", { name: "English" }).click();
check(await errorPage.getByText("Community feedback is unavailable right now. Please try again later.", { exact: true }).isVisible(), "English database-unavailable state is missing");

const emptyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await emptyContext.route("**/api/community", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    summary: {
      totalResponses: 0,
      counts: { WORK: 0, DISTANCE: 0, FEAR: 0, STIGMA: 0, LACK_OF_INFORMATION: 0, TRANSPORT: 0 },
    },
  }),
}));
const emptyPage = await emptyContext.newPage();
await emptyPage.goto(new URL("/community", baseUrl).toString(), { waitUntil: "domcontentloaded" });
await emptyPage.getByRole("button", { name: "বাংলা" }).click();
await emptyPage.getByText("এখনো কোনো মতামত জমা পড়েনি। প্রথম নামবিহীন উত্তরটি দিন।", { exact: true }).waitFor();

await emptyContext.close();
await errorContext.close();
await context.close();
await browser.close();

if (failures.length) {
  console.error("Community-engagement check failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Community engagement passed live summary/validation API checks and UI submission, idempotency, privacy, aggregate, bilingual, failure-state, and responsive checks.");
}
