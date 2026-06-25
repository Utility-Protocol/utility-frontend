import fs from "node:fs";
import path from "node:path";
import {
  BASELINE_DIR,
  DIFF_DIR,
  RESULTS_DIR,
  DEFAULT_MAX_DIFF_PIXEL_RATIO,
  ROUTE_THRESHOLD_OVERRIDES,
  COMPONENT_THRESHOLD_OVERRIDES,
} from "./config";
import type { CompareResult } from "./utils/compare";
import { compare } from "./utils/compare";

interface VisualTestEntry {
  route: string;
  viewport: string;
  diffRatio: number;
  diffPixels: number;
  totalPixels: number;
  status: "pass" | "fail" | "skip";
  error: string | null;
  baselineExists: boolean;
  screenshotRelPath: string;
  diffRelPath: string;
  baselineRelPath: string;
}

/**
 * Generate an HTML report for visual regression test results.
 *
 * The report displays baseline / screenshot / diff side by side for
 * every test entry and summarises pass/fail/skip counts at the top.
 */
export function generateReport(entries: VisualTestEntry[]): string {
  const passCount = entries.filter((e) => e.status === "pass").length;
  const failCount = entries.filter((e) => e.status === "fail").length;
  const skipCount = entries.filter((e) => e.status === "skip").length;

  const statusBadge = (status: VisualTestEntry["status"]) => {
    switch (status) {
      case "pass":
        return '<span class="badge pass">PASS</span>';
      case "fail":
        return '<span class="badge fail">FAIL</span>';
      case "skip":
        return '<span class="badge skip">SKIP</span>';
    }
  };

  const entryCards = entries
    .map((entry) => {
      // For skipped entries (missing baseline) we show a single placeholder
      if (entry.status === "skip") {
        return `
        <div class="card skip">
          <div class="card-header">
            <strong>${escapeHtml(entry.route)}</strong> · ${escapeHtml(entry.viewport)}
            ${statusBadge(entry.status)}
          </div>
          <p class="skip-note">${escapeHtml(entry.error ?? "No baseline recorded yet.")}</p>
          <p class="hint">Run <code>npm run visual:update-baselines</code> to seed baselines.</p>
        </div>`;
      }

      const screenshotDataUri = imageToDataUri(entry.screenshotRelPath);
      const baselineDataUri = entry.baselineExists
        ? imageToDataUri(entry.baselineRelPath)
        : "";
      const diffDataUri = imageToDataUri(entry.diffRelPath);

      return `
        <div class="card ${entry.status}">
          <div class="card-header">
            <strong>${escapeHtml(entry.route)}</strong> · ${escapeHtml(entry.viewport)}
            ${statusBadge(entry.status)}
            <span class="diff-stats">
              ${(entry.diffRatio * 100).toFixed(3)}% diff (${entry.diffPixels} / ${entry.totalPixels} px)
            </span>
          </div>
          <div class="image-row">
            <div class="image-col">
              <label>Baseline</label>
              ${baselineDataUri ? `<img src="${baselineDataUri}" alt="Baseline" />` : '<div class="no-image">N/A</div>'}
            </div>
            <div class="image-col">
              <label>Screenshot</label>
              <img src="${screenshotDataUri}" alt="Screenshot" />
            </div>
            <div class="image-col">
              <label>Diff</label>
              <img src="${diffDataUri}" alt="Diff" />
            </div>
          </div>
          ${entry.error ? `<p class="error">${escapeHtml(entry.error)}</p>` : ""}
        </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Visual Regression Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  .summary { display: flex; gap: 1.5rem; margin-bottom: 2rem; font-size: 1rem; }
  .summary .count { font-weight: 700; font-size: 1.5rem; }
  .summary .pass { color: #22c55e; }
  .summary .fail { color: #ef4444; }
  .summary .skip { color: #f59e0b; }
  .card { border: 1px solid #262626; border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.5rem; background: #171717; }
  .card.fail { border-color: #ef4444; }
  .card.skip { border-color: #f59e0b; }
  .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
  .badge.pass { background: #22c55e; color: #000; }
  .badge.fail { background: #ef4444; color: #fff; }
  .badge.skip { background: #f59e0b; color: #000; }
  .diff-stats { margin-left: auto; font-size: 0.875rem; color: #a3a3a3; }
  .skip-note { color: #f59e0b; font-size: 0.875rem; }
  .hint { color: #737373; font-size: 0.8rem; margin-top: 0.5rem; }
  .hint code { background: #262626; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
  .image-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
  .image-col { display: flex; flex-direction: column; align-items: center; }
  .image-col label { font-size: 0.75rem; color: #a3a3a3; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .image-col img { max-width: 100%; border: 1px solid #404040; border-radius: 0.375rem; }
  .no-image { width: 100%; aspect-ratio: 16/9; background: #262626; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; color: #737373; font-size: 0.875rem; }
  .error { color: #ef4444; font-size: 0.875rem; margin-top: 0.75rem; }
</style>
</head>
<body>
<h1>Visual Regression Report</h1>
<div class="summary">
  <div><span class="count pass">${passCount}</span> passed</div>
  <div><span class="count fail">${failCount}</span> failed</div>
  <div><span class="count skip">${skipCount}</span> skipped</div>
</div>
${entryCards}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageToDataUri(relPath: string): string {
  try {
    // Resolve relative to the project root (cwd), not the file location,
    // since the config dirs are themselves relative to the project root.
    const absPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(absPath)) return "";
    const buf = fs.readFileSync(absPath);
    const ext = path.extname(absPath).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

/**
 * Walk the config.RESULTS_DIR and produce a VisualTestEntry for every
 * screenshot found, paired against its baseline and diff.
 *
 * This is intended to be called from a PostScript-style reporter or from
 * the CI workflow's post-test step.
 */
export function collectEntries(): VisualTestEntry[] {
  const entries: VisualTestEntry[] = [];

  if (!fs.existsSync(RESULTS_DIR)) return entries;

  function walk(dir: string, routeSlug: string) {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    for (const d of dirents) {
      if (d.isDirectory()) {
        walk(path.join(dir, d.name), routeSlug || d.name);
      } else if (d.name.endsWith(".png")) {
        // Determine if this is a route-level or component-level screenshot
        const parts = path.relative(RESULTS_DIR, dir).split(path.sep);
        const isComponent = parts[0] === "components";

        let routeDisplay: string;
        let viewportName: string;

        if (isComponent) {
          routeDisplay = `Component: ${parts[1]}`;
          viewportName = parts[2] ?? "unknown";
        } else {
          routeDisplay = parts[0] === "home" ? "/" : `/${parts[0]}`;
          viewportName = parts[1] ?? "unknown";
        }

        const screenshotRelPath = path.join(dir, d.name);
        const baselineRelPath = isComponent
          ? path.join(BASELINE_DIR, "components", parts[1], viewportName, d.name)
          : path.join(BASELINE_DIR, routeSlug || parts[0], viewportName, d.name);
        const diffRelPath = isComponent
          ? path.join(DIFF_DIR, "components", parts[1], viewportName, d.name)
          : path.join(DIFF_DIR, routeSlug || parts[0], viewportName, d.name);

        const maxDiffRatio = getThreshold(routeDisplay, isComponent ? parts[1] : undefined);

        const result: CompareResult = compare(
          baselineRelPath,
          screenshotRelPath,
          diffRelPath,
          maxDiffRatio
        );

        let status: VisualTestEntry["status"];
        if (result.error?.startsWith("Missing baseline:")) {
          status = "skip";
        } else if (result.error) {
          status = "fail";
        } else {
          status = result.match ? "pass" : "fail";
        }

        entries.push({
          route: routeDisplay,
          viewport: viewportName,
          diffRatio: result.diffRatio,
          diffPixels: result.diffPixels,
          totalPixels: result.totalPixels,
          status,
          error: result.error,
          baselineExists: !result.error?.startsWith("Missing baseline:"),
          screenshotRelPath,
          diffRelPath,
          baselineRelPath,
        });
      }
    }
  }

  walk(RESULTS_DIR, "");
  return entries;
}

function getThreshold(route: string, component?: string): number {
  if (component && COMPONENT_THRESHOLD_OVERRIDES[component] !== undefined) {
    return COMPONENT_THRESHOLD_OVERRIDES[component];
  }
  if (ROUTE_THRESHOLD_OVERRIDES[route] !== undefined) {
    return ROUTE_THRESHOLD_OVERRIDES[route];
  }
  return DEFAULT_MAX_DIFF_PIXEL_RATIO;
}
