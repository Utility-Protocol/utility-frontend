import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { compare } from "./utils/compare";
import type { CompareResult } from "./utils/compare";
import { takeScreenshot as capture } from "./utils/screenshot";
import {
  VIEWPORTS,
  ROUTES,
  BASELINE_DIR,
  DIFF_DIR,
  ROUTE_THRESHOLD_OVERRIDES,
  COMPONENT_THRESHOLD_OVERRIDES,
  DEFAULT_MAX_DIFF_PIXEL_RATIO,
} from "./config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleResult(
  result: CompareResult,
  maxDiffRatio: number,
  skipMsg?: string
): void {
  if (result.error?.startsWith("Missing baseline:")) {
    test.skip(true, skipMsg ?? `Baseline missing: run \`npm run visual:update-baselines\` to seed.`);
    return;
  }

  if (result.diffPath && fs.existsSync(result.diffPath)) {
    test.info().attach("diff", { path: result.diffPath, contentType: "image/png" });
  }

  expect(result.error, result.error ?? "").toBeNull();
  expect(
    result.diffRatio,
    `Diff ratio ${(result.diffRatio * 100).toFixed(2)}% > max ${(maxDiffRatio * 100).toFixed(2)}% (${result.diffPixels}/${result.totalPixels} pixels)`
  ).toBeLessThanOrEqual(maxDiffRatio);
}

// ---------------------------------------------------------------------------
// Per-route visual regression tests (full-page screenshots)
// ---------------------------------------------------------------------------

for (const route of ROUTES) {
  const routeSlug = route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/\//g, "-");
  const maxDiffRatio = ROUTE_THRESHOLD_OVERRIDES[route] ?? DEFAULT_MAX_DIFF_PIXEL_RATIO;

  test.describe(`Route: ${route}`, () => {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`full-page screenshot — ${viewportName}`, async ({ page }) => {
        const actualPath = await capture(page, route, viewportName, viewport);

        const baselinePath = path.join(BASELINE_DIR, routeSlug, viewportName, `${routeSlug}.png`);
        const diffPath = path.join(DIFF_DIR, routeSlug, viewportName, `${routeSlug}.png`);

        const result: CompareResult = compare(baselinePath, actualPath, diffPath, maxDiffRatio);

        test.info().attach("screenshot", { path: actualPath, contentType: "image/png" });
        handleResult(result, maxDiffRatio);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Per-component visual regression tests
//
// Each component test resizes the viewport, navigates to /, waits for the
// component to render, then screenshots ONLY the component's DOM element
// using `page.locator(…).screenshot()` so baselines capture the component
// in isolation rather than the whole page.
// ---------------------------------------------------------------------------

/** Resize viewport, navigate to route, freeze animations, wait for element. */
async function setupComponentTest(
  page: import("@playwright/test").Page,
  route: string,
  viewport: import("@playwright/test").ViewportSize,
  selector: string
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(route, { waitUntil: "networkidle" });
  // Freeze animations for deterministic screenshots
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  });
  await page.waitForTimeout(500);
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 10_000 });
}

/**
 * Take a component-only screenshot, compare against its baseline, and
 * assert the diff ratio is within bounds.
 */
async function testComponent(
  route: string,
  componentName: string,
  componentSelector: string,
  viewportName: string,
  viewport: import("@playwright/test").ViewportSize,
  page: import("@playwright/test").Page
): Promise<void> {
  const maxDiffRatio =
    COMPONENT_THRESHOLD_OVERRIDES[componentName] ?? DEFAULT_MAX_DIFF_PIXEL_RATIO;

  await setupComponentTest(page, route, viewport, componentSelector);

  // Prepare directory paths
  const resultsDir = path.join("tests", "visual", "results", "components", componentName, viewportName);
  fs.mkdirSync(resultsDir, { recursive: true });
  const actualPath = path.join(resultsDir, `${componentName}.png`);

  const baselinePath = path.join(BASELINE_DIR, "components", componentName, viewportName, `${componentName}.png`);
  const diffPath = path.join(DIFF_DIR, "components", componentName, viewportName, `${componentName}.png`);

  // Screenshot only the component element
  const locator = page.locator(componentSelector).first();
  await locator.screenshot({ path: actualPath });

  test.info().attach("screenshot", { path: actualPath, contentType: "image/png" });

  const result: CompareResult = compare(baselinePath, actualPath, diffPath, maxDiffRatio);
  handleResult(
    result,
    maxDiffRatio,
    `Baseline missing for ${componentName} ${viewportName}.`
  );
}

// -- GridMap (canvas-based) --------------------------------------------------

test.describe("Component: grid-map", () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`canvas rendering — ${viewportName}`, async ({ page }) => {
      await testComponent("/", "grid-map", "canvas", viewportName, viewport, page);
    });
  }
});

// -- FleetGrid (device cards) ------------------------------------------------

test.describe("Component: fleet-grid", () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`device cards — ${viewportName}`, async ({ page }) => {
      await testComponent(
        "/",
        "fleet-grid",
        "section:has(h2:text('Fleet Overview'))",
        viewportName,
        viewport,
        page
      );
    });
  }
});

// -- LiveDataView (telemetry panel) ------------------------------------------

test.describe("Component: live-data", () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`live telemetry panel — ${viewportName}`, async ({ page }) => {
      await testComponent(
        "/",
        "live-data",
        "section:has(h2:text('Live Telemetry'))",
        viewportName,
        viewport,
        page
      );
    });
  }
});

// -- TariffEditor ------------------------------------------------------------

test.describe("Component: tariff-editor", () => {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`tariff configuration — ${viewportName}`, async ({ page }) => {
      await testComponent(
        "/",
        "tariff-editor",
        "section:has(h2:text('Tariff Configuration'))",
        viewportName,
        viewport,
        page
      );
    });
  }
});
