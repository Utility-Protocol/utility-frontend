import { test, expect } from "@playwright/test";

test.describe("Locale switching", () => {
  test("switches to es-MX and sets correct lang attribute", async ({ page }) => {
    await page.goto("/");

    // set locale in localStorage and reload
    await page.evaluate(() => localStorage.setItem("locale", "es-MX"));
    await page.reload();

    // wait for I18nProvider to apply locale
    await page.waitForFunction(
      () => document.documentElement.lang === "es-MX",
      { timeout: 5000 }
    );

    // verify lang attribute is set correctly
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("es-MX");

    // verify LTR direction for es-MX
    const dir = await page.getAttribute("html", "dir");
    expect(dir).toBe("ltr");

    await page.screenshot({ path: "screenshots/locale-es-MX.png", fullPage: true });
  });

  test("sets RTL direction for ar-SA", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() => localStorage.setItem("locale", "ar-SA"));
    await page.reload();

    await page.waitForFunction(
      () => document.documentElement.dir === "rtl",
      { timeout: 5000 }
    );

    const dir = await page.getAttribute("html", "dir");
    expect(dir).toBe("rtl");

    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("ar-SA");
  });
});
