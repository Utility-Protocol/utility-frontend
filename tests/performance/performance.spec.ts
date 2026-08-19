/**
 * Performance benchmark suite.
 *
 * Measures the critical paths declared in `performance/budgets.json` and
 * writes the raw latency samples to `performance-results/samples.json`,
 * keyed by budget `id` so the analyzer can compare them directly.
 *
 *   - API critical paths: round-trip latency of key API routes.
 *   - Page critical paths: TTFB and LCP for the main routes.
 *
 * The raw samples are consumed by `scripts/analyze-performance.ts`, which
 * applies budgets and the committed baseline and drives the CI gate. The
 * benchmark itself never asserts on timing — measurement and gating are kept
 * separate so flaky CI runners cannot fail the suite accidentally.
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const RESULTS_DIR = path.resolve(process.cwd(), "performance-results");
const SAMPLES_FILE = path.join(RESULTS_DIR, "samples.json");
const BUDGETS_FILE = path.resolve(process.cwd(), "performance", "budgets.json");

interface Budget {
  id: string;
  name: string;
  path: string;
  metric: "p99" | "p95" | "mean";
  budgetMs: number;
  regressionTolerancePercent?: number;
  minSampleCount?: number;
}

const API_SAMPLES = 30;
const PAGE_NAVIGATIONS = 5;
const API_ROUTE = /^\/api\//;

const samples: Record<string, number[]> = {};

function record(id: string, valueMs: number): void {
  (samples[id] ??= []).push(valueMs);
}

function loadBudgets(): Budget[] {
  const raw = fs.readFileSync(BUDGETS_FILE, "utf8");
  const parsed = JSON.parse(raw) as { budgets: Budget[] };
  return parsed.budgets;
}

function apiTargets(budgets: Budget[]): Budget[] {
  return budgets.filter((b) => API_ROUTE.test(b.path));
}

function pageTargets(budgets: Budget[]): Budget[] {
  return budgets.filter((b) => !API_ROUTE.test(b.path));
}

async function measureApiLatency(request: APIRequestContext, url: string, id: string): Promise<void> {
  const start = Date.now();
  const response = await request.get(url);
  const elapsed = Date.now() - start;
  expect(response.ok(), `API ${url} should respond OK`).toBeTruthy();
  await response.body();
  record(id, elapsed);
}

/**
 * Navigate once and capture TTFB + LCP, recording each into the budget ids
 * that target this page route.
 */
async function measurePageTiming(page: Page, url: string, budgets: Budget[]): Promise<void> {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const ttfb = nav ? nav.responseStart - nav.requestStart : 0;
    return { ttfb };
  });
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const entries = performance.getEntriesByType("largest-contentful-paint");
        if (entries.length > 0) {
          resolve(entries[entries.length - 1].startTime);
          return;
        }
        const observer = new PerformanceObserver((list) => {
          const latest = list.getEntries();
          if (latest.length > 0) {
            observer.disconnect();
            resolve(latest[latest.length - 1].startTime);
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 15_000);
      })
  );

  for (const budget of budgets) {
    if (budget.id.endsWith("-ttfb")) record(budget.id, timing.ttfb);
    if (budget.id.endsWith("-lcp")) record(budget.id, lcp);
  }
}

function writeSamples(): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(
    SAMPLES_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        samples,
      },
      null,
      2
    )
  );
  // eslint-disable-next-line no-console
  console.log(`✓ Performance samples written to ${SAMPLES_FILE}`);
}

test.describe("performance benchmark", () => {
  const budgets = loadBudgets();

  test("API critical paths", async ({ request }) => {
    for (const budget of apiTargets(budgets)) {
      for (let i = 0; i < API_SAMPLES; i++) {
        await measureApiLatency(request, budget.path, budget.id);
      }
    }
  });

  test("page critical paths", async ({ page }) => {
    const pageBudgets = pageTargets(budgets);
    const paths = [...new Set(pageBudgets.map((b) => b.path))];
    for (const pagePath of paths) {
      for (let i = 0; i < PAGE_NAVIGATIONS; i++) {
        await measurePageTiming(page, pagePath, pageBudgets);
      }
    }
  });

  test.afterAll(() => {
    writeSamples();
  });
});
