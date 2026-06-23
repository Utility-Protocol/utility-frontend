import { test, expect } from "@playwright/test";

test.describe("Locale switching", () => {
  test("switches to es-MX and renders localized strings", async ({ page }) => {
    await page.goto("/");

    // set locale in localStorage and reload
    await page.evaluate(() => localStorage.setItem("locale", "es-MX"));
    await page.reload();

    // wait for some localized content to appear
    await page.waitForTimeout(500);

    // take screenshot of the main page
    await page.screenshot({ path: "screenshots/locale-es-MX.png", fullPage: true });

    // ensure that a known Spanish string appears
    await expect(page.locator("text=Idioma")).toBeVisible();

    // ensure no raw i18n keys appear (heuristic: no square-bracketed keys)
    const body = await page.textContent("body");
    expect(body).not.toContain("[");
    expect(body).not.toContain("i18n:");
  });
});
