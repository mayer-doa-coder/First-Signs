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
  if (!await guestPage.getByRole("button", { name: "Continue with email" }).isVisible()) throw new Error("The sign-up action is missing");
  await guest.close();

  const member = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await member.route("**/api/account", (route) => {
    if (route.request().method() === "DELETE") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ deleted: true }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: { email: "demo@example.com", name: "Demo User", phone: "", patientId: null }, roles: [] }) });
  });
  await member.route("**/api/reminders", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ reminders: [] }) }));
  const memberPage = await member.newPage();
  await memberPage.goto(`${baseUrl}/account`, { waitUntil: "domcontentloaded" });
  await memberPage.getByText("Demo User", { exact: true }).waitFor();
  await memberPage.getByRole("button", { name: "Delete account" }).click();
  await memberPage.getByLabel("Type DELETE to confirm").fill("DELETE");
  if (!await memberPage.getByRole("button", { name: "Delete permanently" }).isEnabled()) throw new Error("The account deletion confirmation did not enable");
  const width = await memberPage.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (width.scroll > width.client + 1) throw new Error("Account controls overflow on mobile");
  await member.close();
  console.log("Account sign-up, login, signed-in controls, delete confirmation, and mobile layout passed.");
} finally {
  await browser.close();
}
