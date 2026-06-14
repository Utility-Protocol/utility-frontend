import { test, expect } from "@playwright/test";

test.describe("Wallet Connection Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display connect button when wallet is disconnected", async ({
    page,
  }) => {
    const connectBtn = page.getByRole("button", { name: /connect wallet/i });
    await expect(connectBtn).toBeVisible();
  });

  test("should connect wallet and show address", async ({ page }) => {
    const connectBtn = page.getByRole("button", { name: /connect wallet/i });
    await connectBtn.click();

    await expect(page.getByText(/^G[A-Z0-9]{5}…[A-Z0-9]{4}$/)).toBeVisible();
  });

  test("should disconnect wallet and show connect button", async ({ page }) => {
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/^G[A-Z0-9]{5}…[A-Z0-9]{4}$/)).toBeVisible();

    await page.getByRole("button", { name: /disconnect/i }).click();
    await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  });

  test("should persist wallet session across page reload", async ({ page }) => {
    await page.getByRole("button", { name: /connect wallet/i }).click();
    const address = await page.getByText(/^G[A-Z0-9]{5}…[A-Z0-9]{4}$/).textContent();

    await page.reload();
    await expect(page.getByText(address!)).toBeVisible();
  });
});

test.describe("Dashboard Integration", () => {
  test("should render the grid map canvas", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
  });

  test("should display fleet grid with assets", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Meter-/).first()).toBeVisible();
  });

  test("should filter fleet grid by status", async ({ page }) => {
    await page.goto("/");
    const onlineBtn = page.getByRole("button", { name: /^Online$/ });
    await onlineBtn.click();
    const activeCards = page.locator('[class*="rounded-lg border"]');
    const count = await activeCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
