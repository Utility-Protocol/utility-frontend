import type { ViewportSize } from "@playwright/test";

/**
 * Viewport breakpoints for visual regression tests.
 * Matches common device profiles used by field operators.
 */
export const VIEWPORTS: Record<string, ViewportSize> = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 },
} as const;

/**
 * Global default maxDiffPixelRatio.
 * 0.001 = 0.1% of total pixels may differ before the test fails.
 */
export const DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.001;

/**
 * Per-route threshold overrides.
 * Components like animated charts or live-data panels are granted
 * a slightly higher tolerance because rendering is non-deterministic.
 */
export const ROUTE_THRESHOLD_OVERRIDES: Record<string, number> = {
  "/": 0.001,
};

/**
 * Per-component threshold overrides keyed by a descriptive name
 * that matches the test title suffix used in visual.spec.ts.
 */
export const COMPONENT_THRESHOLD_OVERRIDES: Record<string, number> = {
  "grid-map": 0.002, // canvas-based rendering has slight AA variance
  "live-data": 0.003, // live telemetry may render timestamps
  "fleet-grid": 0.0015,
  "tariff-editor": 0.001,
};

/**
 * PixelMatch comparison settings.
 * threshold = 0.1 → ignore colour differences below 10/255 per channel.
 */
export const PIXELMATCH_OPTIONS = {
  threshold: 0.1,
  alpha: 0.1,
  diffColor: [255, 0, 255] as [number, number, number], // magenta
  includeAA: false,
} as const;

/**
 * Directory where baseline images live.
 * Organised as: tests/visual/baselines/<route>/<viewport>/
 */
export const BASELINE_DIR = "tests/visual/baselines";

/**
 * Directory for actual (current-run) screenshots.
 */
export const RESULTS_DIR = "tests/visual/results";

/**
 * Directory for diff images.
 */
export const DIFF_DIR = "tests/visual/diffs";

/**
 * Routes (pages) to capture during visual regression runs.
 *
 * NOTE: This app is currently a single-page application served from /.
 * As additional routes are added (/dashboard, /map, /tariffs, /settings,
 * /profile) they should be appended here so visual coverage grows with
 * the codebase.
 */
export const ROUTES: string[] = ["/"];
