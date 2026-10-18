import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

try {
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await guest.route("**/api/account", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "AUTH_REQUIRED" }) }));
  const guestPage = await guest.newPage();
  await guestPage.goto(`${baseUrl}/account?mode=signup`, { waitUntil: "domcontentloaded" });
  await guestPage.getByText("Create your account", { exact: true }).waitFor();
  if (await guestPage.locator(".page-hero").count()) throw new Error("The account hero is shown above the sign-up form");
  if (!await guestPage.getByLabel("Name", { exact: true }).isVisible()) throw new Error("The sign-up name field is missing");
  if (!await guestPage.getByLabel("Username", { exact: true }).isVisible()) throw new Error("The unique username field is missing");
  if (!await guestPage.getByLabel("Password", { exact: true }).isVisible()) throw new Error("The sign-up password field is missing");
  if (!await guestPage.getByRole("button", { name: "Create account" }).isVisible()) throw new Error("The sign-up action is missing");
  const mobileColumns = await guestPage.locator(".account-signup-form").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  if (mobileColumns !== 1) throw new Error("The sign-up form does not collapse to one column on mobile");
  await guestPage.goto(`${baseUrl}/account?mode=forgot`, { waitUntil: "domcontentloaded" });
  await guestPage.getByText("Reset your password", { exact: true }).waitFor();
  if (!await guestPage.getByLabel("Email", { exact: true }).isVisible()) throw new Error("The recovery email field is missing");
  if (!await guestPage.getByRole("button", { name: "Send code" }).isVisible()) throw new Error("The recovery-code action is missing");
  await guest.close();

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await desktop.route("**/api/account", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "AUTH_REQUIRED" }) }));
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(`${baseUrl}/account?mode=signup`, { waitUntil: "domcontentloaded" });
  await desktopPage.getByText("Create your account", { exact: true }).waitFor();
  const desktopColumns = await desktopPage.locator(".account-signup-form").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  if (desktopColumns !== 2) throw new Error("Sign-up fields are not arranged in two columns on desktop");
  if ((await desktopPage.locator(".account-signup-card").count()) !== 1) throw new Error("Sign-up was not kept in one compact card");
  await desktopPage.goto(`${baseUrl}/account?mode=login`, { waitUntil: "domcontentloaded" });
  await desktopPage.getByText("Welcome back", { exact: true }).waitFor();
  if ((await desktopPage.locator(".account-login-card").count()) !== 1) throw new Error("Login was not restored to its original single-card form");
  await desktop.close();

  const member = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await member.route("**/api/account", (route) => {
    if (route.request().method() === "DELETE") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ deleted: true }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: { email: "demo@example.com", username: "demo.user", name: "Demo User", phone: "", patientId: null }, roles: [], primaryRole: "PATIENT", workspaceHome: "/account" }) });
  });
  await member.route("**/api/reminders", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ reminders: [] }) }));
  const memberPage = await member.newPage();
  await memberPage.goto(`${baseUrl}/account`, { waitUntil: "domcontentloaded" });
  await memberPage.getByText("Demo User", { exact: true }).waitFor();
  if (!await memberPage.locator(".page-hero").isVisible()) throw new Error("The account hero did not return after sign-in");
  await memberPage.getByRole("button", { name: "Delete account" }).click();
  await memberPage.getByLabel("Type DELETE to confirm").fill("DELETE");
  if (!await memberPage.getByRole("button", { name: "Delete permanently" }).isEnabled()) throw new Error("The account deletion confirmation did not enable");
  const width = await memberPage.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (width.scroll > width.client + 1) throw new Error("Account controls overflow on mobile");
  await member.close();

  const government = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await government.route("**/api/account", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: { email: "public-health@example.gov.bd", username: "gov.viewer", name: "Public Health Viewer", phone: "", patientId: null }, roles: [{ role: "GOVERNMENT_VIEWER", pharmacy_id: null, tb_center_id: null }], primaryRole: "GOVERNMENT_VIEWER", workspaceHome: "/dashboard" }) }));
  const governmentPage = await government.newPage();
  await governmentPage.goto(`${baseUrl}/account`, { waitUntil: "domcontentloaded" });
  await governmentPage.getByText("Public Health Viewer", { exact: true }).waitFor();
  if (!await governmentPage.getByText("Public-health dashboard", { exact: true }).isVisible()) throw new Error("The government workspace is missing");
  if (await governmentPage.getByText("Patient tools", { exact: true }).count()) throw new Error("Patient tools leaked into the government role");
  await government.close();
  console.log("Account sign-up, recovery, patient controls, role isolation, delete confirmation, and mobile layout passed.");
} finally {
  await browser.close();
}
