import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const imageUrl = "https://dailymed.nlm.nih.gov/dailymed/image.cfm?name=test.jpg&setid=00000000-0000-4000-8000-000000000000";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.route("**/api/medicines/products?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ products: [{
      setId: "00000000-0000-4000-8000-000000000000",
      labelTitle: "Amoxicillin test label",
      productName: "AMOXICILLIN CAPSULE",
      genericName: "AMOXICILLIN",
      activeIngredients: [{ name: "AMOXICILLIN", strength: "500 mg" }],
      ndcs: ["0000-0000"],
      packaging: ["test package"],
      imageUrls: [imageUrl],
      labelUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=00000000-0000-4000-8000-000000000000",
      publishedDate: null,
    }] }),
  }));
  await context.route("https://dailymed.nlm.nih.gov/dailymed/image.cfm?**", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  }));

  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/medicines`, { waitUntil: "networkidle" });
  if (response?.status() !== 200) throw new Error(`/medicines returned HTTP ${response?.status()}`);
  await page.locator("#medicine-query").fill("amoxicillin");
  const medicineCard = page.locator(".medicine-card").filter({ has: page.getByRole("heading", { name: "Amoxicillin", exact: true }) });
  if ((await medicineCard.count()) !== 1) throw new Error("Medicine search did not include the exact amoxicillin result");
  await medicineCard.scrollIntoViewIfNeeded();
  await page.getByText(/U\.S\. DailyMed label product/i).waitFor();
  if (!await page.locator(".verified-product-image").isVisible()) throw new Error("Verified DailyMed image was not rendered");
  if (!await page.getByText(/does not confirm Bangladesh availability/i).isVisible()) throw new Error("Bangladesh availability warning is missing");

  const noOverflow = async (label) => {
    const size = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (size.scrollWidth > size.clientWidth + 1) throw new Error(`${label} overflowed (${size.scrollWidth}px > ${size.clientWidth}px)`);
  };
  await noOverflow("English medicine corner");
  await page.getByRole("button", { name: "বাংলা" }).click();
  if (!await page.getByText("মেডিসিন কর্নার", { exact: true }).isVisible()) throw new Error("Bangla medicine heading is missing");
  await noOverflow("Bangla medicine corner");

  await context.close();
  console.log("Medicine search, verified-photo disclosure, safety copy, bilingual rendering, and mobile width passed.");
} finally {
  await browser.close();
}
