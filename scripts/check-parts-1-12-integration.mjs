import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const pharmacyId = "DEMO-KHL-RAHMAN";
const staffPin = "PART14_INTEGRATION_TEST_PIN";
const recordDemoVideo = process.env.RECORD_DEMO_VIDEO === "1";
const centre = {
  id: "NTP-KHL-KMCH",
  name: "Khulna Medical College Hospital (KMCH)",
  area: "Sonadanga",
  district: "Khulna",
  serviceType: "Microscopy",
};

const state = {
  screenings: new Map(),
  referrals: new Map(),
  nextReferral: 1,
};
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function referralView(referral) {
  return {
    referralId: referral.referralId,
    accessToken: referral.accessToken,
    status: referral.status,
    tbCenterId: referral.tbCenterId,
    centreName: centre.name,
    centreArea: centre.area,
    centreDistrict: centre.district,
    serviceType: centre.serviceType,
    createdAt: referral.createdAt,
    rewardCreated: referral.sourceType === "PHARMACY",
  };
}

function verificationView(referral, extra = {}) {
  return {
    referralId: referral.referralId,
    status: referral.status,
    codeUsed: referral.codeUsed,
    tbCenterId: referral.tbCenterId,
    centreName: centre.name,
    centreArea: centre.area,
    centreDistrict: centre.district,
    serviceType: centre.serviceType,
    createdAt: referral.createdAt,
    completedAt: referral.completedAt,
    ...extra,
  };
}

function followUpView(referral) {
  return {
    referralId: referral.referralId,
    referralStatus: referral.status,
    status: referral.followUpStatus ?? null,
    barrier: referral.barrier ?? null,
    nextAction: referral.nextAction ?? null,
    createdAt: referral.followUpCreatedAt ?? null,
  };
}

function findReferral({ referralId, token }) {
  return [...state.referrals.values()].find((item) => (
    referralId ? item.referralId === referralId : item.accessToken === token
  ));
}

function dashboard() {
  const assistedScreenings = [...state.screenings.values()].filter((item) => item.sourceType === "PHARMACY" && item.pharmacyId === pharmacyId).length;
  const pharmacyReferrals = [...state.referrals.values()].filter((item) => item.sourceType === "PHARMACY" && item.pharmacyId === pharmacyId);
  const referralsCompleted = pharmacyReferrals.filter((item) => item.status === "COMPLETED").length;
  return {
    pharmacyId,
    pharmacyName: "Rahman Pharmacy",
    pharmacyArea: "Sonadanga, Khulna",
    integrityScore: null,
    assistedScreenings,
    referralsCreated: pharmacyReferrals.length,
    referralsCompleted,
    completionRate: pharmacyReferrals.length ? (referralsCompleted / pharmacyReferrals.length) * 100 : 0,
    simulatedEarnings: null,
    earningsConfigured: false,
    validScreeningCredits: assistedScreenings,
    appropriateReferralCredits: pharmacyReferrals.length,
    verifiedCompletionCredits: referralsCompleted,
    qualityBonusCredits: 0,
    heldCredits: 0,
    duplicateRewardWarnings: 0,
    reusedAudioWarnings: 0,
    activityRequiresReview: false,
    lastActivityAt: pharmacyReferrals.at(-1)?.completedAt ?? pharmacyReferrals.at(-1)?.createdAt ?? null,
  };
}

function governmentDashboard() {
  const liveDhakaReferrals = [...state.referrals.values()].filter((item) => item.areaName === "Dhaka").length;
  const dhakaReferrals = 4 + liveDhakaReferrals;
  const formalReferrals = 20 + state.referrals.size;
  const completedReferrals = [...state.referrals.values()].filter((item) => item.status === "COMPLETED").length;
  return {
    totalScreenings: 21 + state.screenings.size,
    selfUseScreenings: 11 + [...state.screenings.values()].filter((item) => item.sourceType === "SELF").length,
    pharmacyAssistedScreenings: 10 + [...state.screenings.values()].filter((item) => item.sourceType === "PHARMACY").length,
    formalReferrals,
    completedReferrals,
    completionRate: formalReferrals ? Number(((completedReferrals / formalReferrals) * 100).toFixed(1)) : 0,
    demoSeededScreenings: 21,
    demoWindowStart: "2026-10-10T00:00:00.000Z",
    demoWindowEnd: "2026-10-17T00:00:00.000Z",
    fraudAlerts: {
      duplicateRewardWarnings: 0,
      reusedAudioWarnings: 0,
      pharmaciesRequiringReview: 1,
      heldRewardCount: 1,
    },
    areas: [
      { areaId: "Boyra", uniqueUsersScreened: 3, uniqueUsersRecommended: 2, referralCount: 2, completionCount: 0, independentReferredUsers: 2, hotspotLevel: "NORMAL" },
      { areaId: "Khalishpur", uniqueUsersScreened: 4, uniqueUsersRecommended: 4, referralCount: 4, completionCount: 0, independentReferredUsers: 4, hotspotLevel: "WATCH" },
      { areaId: "Dhaka", uniqueUsersScreened: dhakaReferrals, uniqueUsersRecommended: dhakaReferrals, referralCount: dhakaReferrals, completionCount: 0, independentReferredUsers: dhakaReferrals, hotspotLevel: dhakaReferrals >= 5 ? "RED" : "WATCH" },
    ],
  };
}

async function demoPause(page, milliseconds = 650) {
  if (recordDemoVideo) await page.waitForTimeout(milliseconds);
}

async function json(route, status, body) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(context) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === "/api/care" && method === "POST") {
      const patientId = request.postDataJSON()?.patientId;
      const screening = [...state.screenings.values()].find((item) => item.patientId === patientId);
      if (!screening) return json(route, 404, { error: "CARE_NOT_FOUND" });
      const referral = [...state.referrals.values()].find((item) => item.screeningId === screening.screeningId);
      const followUp = referral ? followUpView(referral) : null;
      return json(route, 200, { care: {
        version: 1,
        patientId,
        source: screening.sourceType === "SELF" ? "self" : "pharmacy",
        ...(screening.pharmacyId ? { pharmacyId: screening.pharmacyId } : {}),
        area: screening.areaName,
        screeningOutcome: screening.screeningResult,
        symptomAnswers: screening.symptomAnswers,
        screeningId: screening.screeningId,
        audioChoice: screening.audioStatus,
        ...(screening.audioHash ? { audioHash: screening.audioHash } : {}),
        referralStatus: referral
          ? referral.status === "FOLLOW_UP" ? "FOLLOW_UP_NEEDED" : referral.status
          : "NOT_REQUESTED",
        ...(referral ? { selectedCentreId: referral.tbCenterId, referral: referralView(referral) } : {}),
        ...(followUp?.status ? { followUp } : {}),
        followUpNeeded: referral?.status === "FOLLOW_UP",
        createdAt: screening.createdAt ?? "2026-10-06T09:00:00.000Z",
        updatedAt: referral?.completedAt ?? referral?.createdAt ?? screening.createdAt ?? "2026-10-06T09:00:00.000Z",
      } });
    }

    if (url.pathname === "/api/screenings" && method === "POST") {
      const input = request.postDataJSON();
      const created = !state.screenings.has(input.screeningId);
      if (created) state.screenings.set(input.screeningId, input);
      return json(route, 201, { screening: {
        screeningId: input.screeningId,
        created,
        screeningRewardCreated: created && input.sourceType === "PHARMACY",
      } });
    }

    if (url.pathname === "/api/referrals" && method === "POST") {
      const input = request.postDataJSON();
      let referral = [...state.referrals.values()].find((item) => item.screeningId === input.screeningId);
      if (!referral) {
        const number = state.nextReferral++;
        const suffix = number.toString(16).padStart(12, "0");
        referral = {
          ...input,
          referralId: `JVH-KHU-${String(number).padStart(5, "0")}`,
          accessToken: `00000000-0000-4000-8000-${suffix}`,
          status: "PENDING",
          codeUsed: false,
          createdAt: "2026-10-06T10:00:00.000Z",
          completedAt: null,
        };
        state.referrals.set(referral.referralId, referral);
        if (!state.screenings.has(input.screeningId)) state.screenings.set(input.screeningId, input);
      }
      return json(route, 201, { referral: referralView(referral) });
    }

    if (url.pathname === "/api/referrals" && method === "GET") {
      const referral = findReferral({ token: url.searchParams.get("token") });
      return referral
        ? json(route, 200, { referral: referralView(referral) })
        : json(route, 404, { error: "REFERRAL_NOT_FOUND" });
    }

    if (url.pathname === "/api/referrals/follow-up") {
      const referral = findReferral({ token: url.searchParams.get("token") });
      if (!referral) return json(route, 404, { error: "REFERRAL_NOT_FOUND" });
      if (method === "POST") {
        if (referral.status !== "PENDING" && referral.status !== "FOLLOW_UP") {
          return json(route, 409, { error: "REFERRAL_NOT_PENDING" });
        }
        referral.status = "FOLLOW_UP";
        referral.followUpStatus ??= "AWAITING_BARRIER";
        referral.followUpCreatedAt ??= "2026-10-07T10:00:00.000Z";
      } else if (method === "PATCH") {
        const actionByBarrier = {
          WORK_SCHEDULE: "PLAN_SUITABLE_TIME",
          CENTRE_TOO_FAR: "SHOW_ANOTHER_CENTRE",
          FEAR: "EXPLAIN_EVALUATION",
          STIGMA: "PRIVACY_AND_SUPPORT",
          TRANSPORT_PROBLEM: "SEEK_TRANSPORT_SUPPORT",
          DID_NOT_UNDERSTAND: "EXPLAIN_WHY_EVALUATION_MATTERS",
          OTHER: "HUMAN_SUPPORT",
        };
        const barrier = request.postDataJSON().barrier;
        if (referral.status !== "FOLLOW_UP" || !actionByBarrier[barrier]) {
          return json(route, 409, { error: "FOLLOW_UP_BARRIER_SAVE_FAILED" });
        }
        referral.followUpStatus = "ACTION_READY";
        referral.barrier = barrier;
        referral.nextAction = actionByBarrier[barrier];
      }
      return json(route, 200, { followUp: followUpView(referral) });
    }

    if (url.pathname === "/api/referrals/verify") {
      if (request.headers()["x-jvh-tb-centre-pin"] !== staffPin) {
        return json(route, 401, { error: "TB_CENTRE_ACCESS_DENIED" });
      }
      const body = method === "POST" ? request.postDataJSON() : null;
      const lookup = body ?? Object.fromEntries(url.searchParams);
      const referral = findReferral({ referralId: lookup.referralId, token: lookup.token });
      if (!referral) return json(route, 404, { error: "REFERRAL_NOT_FOUND" });
      if (method === "POST") {
        if (lookup.tbCenterId !== referral.tbCenterId) return json(route, 409, { error: "REFERRAL_CONFIRM_FAILED" });
        const alreadyUsed = referral.codeUsed;
        if (!alreadyUsed) {
          referral.status = "COMPLETED";
          referral.codeUsed = true;
          referral.completedAt = "2026-10-07T11:00:00.000Z";
        }
        return json(route, 200, { referral: verificationView(referral, {
          alreadyUsed,
          completionRewardCreated: !alreadyUsed && referral.sourceType === "PHARMACY",
        }) });
      }
      return json(route, 200, { referral: verificationView(referral) });
    }

    if (url.pathname === "/api/pharmacies/dashboard" && method === "GET") {
      return url.searchParams.get("pharmacyId") === pharmacyId
        ? json(route, 200, { dashboard: dashboard() })
        : json(route, 404, { error: "PHARMACY_NOT_FOUND" });
    }

    if (url.pathname === "/api/dashboard" && method === "GET") {
      return json(route, 200, { dashboard: governmentDashboard() });
    }

    return json(route, 404, { error: "TEST_ROUTE_NOT_FOUND" });
  });
}

async function completeScreening(page, { sourceType, area = "Khulna" }) {
  const consent = page.locator('[data-screening-stage="consent"]');
  await demoPause(page);
  await consent.locator('input[type="checkbox"]').check();
  await consent.locator('button[type="button"]').click();
  const questions = page.locator('[data-screening-stage="questions"]');
  await questions.locator("#cough-days").fill("14");
  for (const name of ["fever", "nightSweats", "weightLoss", "bloodInSputum", "tbExposure"]) {
    await questions.locator(`input[name="${name}"][value="no"]`).check();
  }
  await questions.locator(`input[name="area"][value="${area}"]`).check();
  await demoPause(page);
  await questions.locator('button[type="submit"]').click();
  await demoPause(page);
  await page.locator('[data-screening-stage="audio"]').getByRole("button", { name: "এখন অডিও দেব না" }).click();
  const referralStage = page.locator('[data-screening-stage="referral"]');
  await referralStage.locator('input[name="referral-choice"][value="continue"]').check();
  await demoPause(page);
  await referralStage.locator('button[type="submit"]').click();
  const complete = page.locator('[data-screening-stage="complete"]');
  await complete.waitFor();
  const patientId = (await complete.locator("code").textContent())?.trim();
  check(/^JVH-DEMO-[A-F0-9]{8}$/.test(patientId ?? ""), `${sourceType} did not create a demo patient ID`);
  check((await complete.textContent())?.includes("PENDING"), `${sourceType} did not create a PENDING referral`);
  return { complete, patientId };
}

const browser = await chromium.launch({ executablePath, headless: true });
if (recordDemoVideo) await mkdir(".artifacts/part19-demo-video", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  ...(recordDemoVideo ? { recordVideo: { dir: ".artifacts/part19-demo-video", size: { width: 390, height: 844 } } } : {}),
});
await installApi(context);
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});

// Parts 1–6 and 8–9: pharmacy entry, common screening, fixed rule, centre and referral.
await page.goto(new URL(`/screen?source=pharmacy&pharmacy=${pharmacyId}`, baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
check((await page.locator(".entry-context").textContent())?.includes("রহমান ফার্মেসি"), "Pharmacy QR context was lost before screening");
const pharmacyFlow = await completeScreening(page, { sourceType: "PHARMACY" });
const pharmacyReferral = [...state.referrals.values()].find((item) => item.sourceType === "PHARMACY");
check(Boolean(pharmacyReferral), "Pharmacy referral did not reach the shared backend contract");
check(dashboard().validScreeningCredits === 1 && dashboard().appropriateReferralCredits === 1, "Pharmacy workflow credits were not separated");

await pharmacyFlow.complete.getByRole("link", { name: "রেফারেল ও কিউআর দেখুন" }).click();
  await page.locator("[data-referral-id]").waitFor();
  check((await page.locator("[data-referral-id]").textContent())?.includes(pharmacyReferral.referralId), "Referral page did not load the created referral");
check((await page.locator(".referral-qr-image").getAttribute("data-qr-value"))?.includes(pharmacyReferral.accessToken), "Referral QR does not contain the opaque token");

// Parts 7 and 12: the same assisted session enters follow-up and saves a barrier action.
await page.goto(new URL(`/care?patient=${pharmacyFlow.patientId}&source=pharmacy&pharmacy=${pharmacyId}`, baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator('[data-action="simulate-24-hours"]').click();
await page.locator("[data-followup-question]").waitFor();
await page.locator('input[name="followup-barrier"][value="TRANSPORT_PROBLEM"]').check();
await page.locator('[data-followup-question] button[type="submit"]').click();
await page.locator("[data-followup-action]").waitFor();
check((await page.locator("[data-followup-action]").textContent())?.includes("যাতায়াতের সহায়তা"), "Follow-up barrier did not produce its deterministic action");

// Part 10: independent centre verification completes the same FOLLOW_UP referral once.
await page.goto(new URL("/verify", baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("#tb-centre-staff-pin").fill(staffPin);
await page.locator("#referral-id").fill(pharmacyReferral.referralId);
await page.locator('.verify-search-card button[type="submit"]').click();
await page.locator("[data-verification-result]").waitFor();
await page.locator("[data-confirm-evaluation]").click();
await page.locator(".verification-confirmed").waitFor();
check(pharmacyReferral.status === "COMPLETED" && pharmacyReferral.codeUsed, "Verification did not complete and consume the referral");

// Parts 7, 10 and 11: care and pharmacy dashboard reflect that same completion.
await page.goto(new URL(`/care?patient=${pharmacyFlow.patientId}&source=pharmacy&pharmacy=${pharmacyId}`, baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("[data-attendance-confirmed]").waitFor();
check((await page.locator("[data-attendance-confirmed]").textContent())?.includes("রোগ নির্ণয়"), "Completed care state lost the non-diagnosis warning");
await page.goto(new URL(`/pharmacy?pharmacy=${pharmacyId}`, baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator(`[data-pharmacy-dashboard="${pharmacyId}"]`).waitFor();
const metrics = await page.locator(".metric-value").allTextContents();
check(metrics[0] === "1" && metrics[1] === "1" && metrics[2] === "1" && metrics[3] === "100.0%", "Pharmacy dashboard did not reflect the completed assisted referral");
check(dashboard().verifiedCompletionCredits === 1, "Independent completion credit did not update");

// Part 19 starts with the prepared map at WATCH for four independent users.
await page.goto(new URL("/dashboard", baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("[data-government-dashboard]").waitFor();
await page.getByRole("button", { name: /ঢাকা বিভাগ: নজরে রাখুন/ }).click();
check(await page.locator(".red-area-actions").count() === 0, "Dhaka was red before the fifth independent demo user");
check((await page.locator(".dashboard-demo-seed-note").textContent())?.includes("২১টি কৃত্রিম স্ক্রিনিং"), "Prepared map records are not labelled as demo data");
await demoPause(page, 900);

// Parts 2, 5, 9, 10 and 19: the fifth independent self-use referral turns Dhaka RED without creating pharmacy credit.
await page.goto(new URL("/screen?source=self", baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
const selfFlow = await completeScreening(page, { sourceType: "SELF", area: "Dhaka" });
const selfReferral = [...state.referrals.values()].find((item) => item.sourceType === "SELF");
check(Boolean(selfFlow.patientId) && Boolean(selfReferral), "Self-use path did not create its referral");
check(dashboard().assistedScreenings === 1 && dashboard().referralsCreated === 1, "Self-use activity leaked into pharmacy totals");
await page.goto(new URL("/verify", baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("#tb-centre-staff-pin").fill(staffPin);
await page.locator("#referral-id").fill(selfReferral.referralId);
await page.locator('.verify-search-card button[type="submit"]').click();
await page.locator("[data-confirm-evaluation]").click();
await page.locator(".verification-confirmed").waitFor();
check(dashboard().verifiedCompletionCredits === 1, "Self-use verification created a pharmacy completion reward");

await page.goto(new URL("/dashboard", baseUrl).toString(), { waitUntil: "networkidle" });
await page.getByRole("button", { name: "বাংলা" }).click();
await page.locator("[data-government-dashboard]").waitFor();
check(await page.getByText("সম্ভাব্য টিবি-সংক্রান্ত স্ক্রিনিং কার্যক্রম বেশি — তদন্ত করুন", { exact: true }).isVisible(), "The fifth independent referral did not show the red investigation signal");
check(await page.getByText("এলাকাটি পর্যালোচনা করুন", { exact: true }).isVisible(), "The red-area government action panel is missing");
check((await page.locator(".government-fraud-card").textContent())?.includes("পর্যালোচনায় রাখা পুরস্কার"), "Prepared fraud-review case is missing");
await demoPause(page, 1200);

const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
check(dimensions.scrollWidth <= dimensions.clientWidth + 1, "Integrated mobile flow overflows horizontally");
await page.getByRole("button", { name: "English" }).click();
check(await page.evaluate(() => document.documentElement.lang === "en"), "English switch did not update the document language");

await context.close();
await browser.close();
for (const error of runtimeErrors) failures.push(`Browser runtime error: ${error}`);

if (failures.length) {
  console.error("Parts 1–12 integration failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Parts 1–20 demo integration passed for pharmacy-assisted and self-use paths.");
  console.log("Referral, follow-up, verification, care refresh, pharmacy rewards, fraud review, and the watch-to-red hotspot transition stayed consistent.");
  if (recordDemoVideo) console.log("Demo video saved under .artifacts/part19-demo-video/.");
}
