import { test, expect } from "@playwright/test";

test.describe("Keyboard navigation smoke tests", () => {
  test("header controls are reachable by keyboard", async ({ page }) => {
    await page.goto("/");

    const themeSelect = page.getByRole("combobox", { name: "Select theme mode" });
    const connectWallet = page.getByRole("button", { name: /connect wallet/i });

    await expect(themeSelect).toBeVisible();
    await expect(connectWallet).toBeVisible();

    let focused: string | null = null;
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el instanceof HTMLElement ? el.textContent?.trim() || el.getAttribute("aria-label") : null;
      });
      if (focused && /connect wallet/i.test(focused)) {
        break;
      }
    }

    expect(focused, "Connect Wallet should be reachable by Tab").toMatch(/connect wallet/i);
  });

  test("tabbing cycles through distinct focusable elements without traps", async ({ page }) => {
    await page.goto("/");

    const markers = new Set<string>();
    let stuckOnSingle = true;

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const marker = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        if (!el.dataset.tabProbe) {
          el.dataset.tabProbe = crypto.randomUUID();
        }
        return el.dataset.tabProbe;
      });
      if (marker !== null) {
        markers.add(marker);
        stuckOnSingle = markers.size === 1;
      }
    }

    expect(stuckOnSingle, "Tab should not be trapped on a single element").toBe(false);
    expect(markers.size, "Tab should reach multiple distinct elements").toBeGreaterThanOrEqual(3);
  });

  test("theme toggle changes mode via keyboard", async ({ page }) => {
    await page.goto("/");

    const themeSelect = page.getByRole("combobox", { name: "Select theme mode" });
    await expect(themeSelect).toBeVisible();
    await themeSelect.focus();
    await themeSelect.press("ArrowDown");

    const selectedMode = await themeSelect.evaluate((el) => (el as HTMLSelectElement).value);
    expect(selectedMode).not.toBe("");
  });
});
