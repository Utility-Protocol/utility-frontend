import type { Page, ViewportSize } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { RESULTS_DIR } from "../config";

/**
 * CSS snippet injected into the page before every screenshot to freeze
 * CSS animations & transitions so deterministic images are captured.
 */
const FREEZE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition: none !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}
`;

/**
 * CSS selectors for DOM elements that contain non-deterministic content
 * (live timestamps, date pickers, etc.).  Playwright will mask these
 * elements with a solid colour so pixel comparison ignores them.
 */
const DYNAMIC_SELECTORS = [
  // Footer copyright year differs across runs on 1 Jan
  "footer",
  // Any element displaying the current time
  "[data-testid='live-timestamp']",
  // Spinner / skeleton placeholders that may resolve at different speeds
  "[data-testid='loading-skeleton']",
  // Animating pulse overlays
  ".animate-pulse",
];

/**
 * Capture a single full-page screenshot for a given route + viewport.
 *
 * @returns Absolute path to the written PNG file.
 */
export async function takeScreenshot(
  page: Page,
  route: string,
  viewportName: string,
  viewport: ViewportSize
): Promise<string> {
  // Resize the viewport and wait for layout to settle
  await page.setViewportSize(viewport);
  await page.goto(route, { waitUntil: "networkidle" });

  // Freeze animations so pixels are deterministic
  await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });

  // Wait a tick so the style takes effect
  await page.waitForTimeout(500);

  // Sanitise the route string for use as a file-system name
  const routeSlug = route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/\//g, "-");

  // Ensure the results directory exists
  const dir = path.join(RESULTS_DIR, routeSlug, viewportName);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${routeSlug}.png`);

  await page.screenshot({
    path: filePath,
    fullPage: true,
    mask: DYNAMIC_SELECTORS.map((sel) => page.locator(sel)),
    maskColor: "#000000",
  });

  return filePath;
}
