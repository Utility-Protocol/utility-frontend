#!/usr/bin/env -S npx tsx

/**
 * Performance regression analyzer.
 *
 * Reads the raw samples written by the Playwright benchmark
 * (`performance-results/samples.json`), evaluates them against the budgets in
 * `performance/budgets.json` and the committed baseline
 * (`performance/baseline.json`), then:
 *
 *   1. writes a machine-readable report (`performance-results/report.json`),
 *   2. writes a human-readable HTML dashboard
 *      (`performance-results/report.html`),
 *   3. writes a markdown summary for the PR comment
 *      (`performance-results/performance-comment.md`),
 *   4. exits non-zero when a budget breach or regression is detected so the
 *      CI gate blocks the PR.
 *
 * Flags:
 *   --no-fail   Always exit 0 (used when refreshing the baseline on main).
 */

import fs from "node:fs";
import path from "node:path";
import {
  detectRegressions,
  summarizeAll,
  type PerformanceBaseline,
  type PerformanceBudget,
  type RegressionReport,
} from "@/utils/performanceRegression";

const RESULTS_DIR = path.resolve(process.cwd(), "performance-results");
const SAMPLES_FILE = path.join(RESULTS_DIR, "samples.json");
const REPORT_FILE = path.join(RESULTS_DIR, "report.json");
const HTML_REPORT_FILE = path.join(RESULTS_DIR, "report.html");
const COMMENT_FILE = path.join(RESULTS_DIR, "performance-comment.md");
const BUDGETS_FILE = path.resolve(process.cwd(), "performance", "budgets.json");
const BASELINE_FILE = path.resolve(process.cwd(), "performance", "baseline.json");

interface SamplesFile {
  generatedAt?: string;
  samples: Record<string, number[]>;
}

function loadBudgets(): PerformanceBudget[] {
  const parsed = JSON.parse(fs.readFileSync(BUDGETS_FILE, "utf8")) as { budgets: PerformanceBudget[] };
  return parsed.budgets;
}

function loadBaseline(): PerformanceBaseline | null {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  const parsed = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as PerformanceBaseline;
  return Object.keys(parsed).length === 0 ? null : parsed;
}

function loadSamples(): SamplesFile {
  if (!fs.existsSync(SAMPLES_FILE)) {
    throw new Error(`Samples file not found: ${SAMPLES_FILE}. Run the performance benchmark first (npm run test:performance).`);
  }
  return JSON.parse(fs.readFileSync(SAMPLES_FILE, "utf8")) as SamplesFile;
}

function statusIcon(status: string): string {
  switch (status) {
    case "pass":
      return "✅";
    case "budget-breach":
      return "❌";
    case "regression":
      return "🔺";
    case "insufficient-data":
      return "⚠️";
    default:
      return "❓";
  }
}

function generateMarkdownComment(report: RegressionReport): string {
  const lines = [
    "## 📈 Performance Regression Results",
    "",
    "| Critical Path | Metric | Current | Budget | Baseline | Δ vs Baseline | Status |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const finding of report.findings) {
    const current = finding.currentMs !== null ? `${finding.currentMs.toFixed(1)}ms` : "—";
    const budget = finding.budgetMs !== null ? `${finding.budgetMs.toFixed(1)}ms` : "—";
    const baseline = finding.baselineMs !== null ? `${finding.baselineMs.toFixed(1)}ms` : "—";
    const delta = finding.deltaPercent !== null ? `${finding.deltaPercent > 0 ? "+" : ""}${finding.deltaPercent.toFixed(1)}%` : "—";
    lines.push(
      `| ${finding.name} | ${finding.metric.toUpperCase()} | ${current} | ${budget} | ${baseline} | ${delta} | ${statusIcon(finding.status)} ${finding.status} |`
    );
  }

  lines.push("", `📊 **Result: ${report.passed ? "PASS" : "FAIL"}**`);
  lines.push(
    "",
    "📎 [View workflow artifacts](https://github.com/Utility-Protocol/utility-frontend/actions) for the full HTML report."
  );
  return lines.join("\n");
}

function generateHtmlReport(report: RegressionReport): string {
  const rows = report.findings
    .map((f) => {
      const current = f.currentMs !== null ? `${f.currentMs.toFixed(1)}ms` : "—";
      const budget = f.budgetMs !== null ? `${f.budgetMs.toFixed(1)}ms` : "—";
      const baseline = f.baselineMs !== null ? `${f.baselineMs.toFixed(1)}ms` : "—";
      const delta = f.deltaPercent !== null ? `${f.deltaPercent > 0 ? "+" : ""}${f.deltaPercent.toFixed(1)}%` : "—";
      return `<tr class="${f.status}">
        <td>${escapeHtml(f.name)}<br/><code>${escapeHtml(f.path)}</code></td>
        <td>${f.metric.toUpperCase()}</td>
        <td>${current}</td>
        <td>${budget}</td>
        <td>${baseline}</td>
        <td>${delta}</td>
        <td><span class="badge ${f.status}">${f.status.replace("-", " ")}</span></td>
        <td class="message">${escapeHtml(f.message)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Performance Regression Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  .verdict { font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
  .verdict.pass { color: #22c55e; }
  .verdict.fail { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; background: #171717; border-radius: 0.75rem; overflow: hidden; }
  th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #262626; }
  th { background: #1f1f1f; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; color: #a3a3a3; }
  tr.pass td { border-left: 3px solid #22c55e; }
  tr.budget-breach td { border-left: 3px solid #ef4444; }
  tr.regression td { border-left: 3px solid #f59e0b; }
  tr.insufficient-data td { border-left: 3px solid #facc15; }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
  .badge.pass { background: #22c55e; color: #000; }
  .badge.budget-breach { background: #ef4444; color: #fff; }
  .badge.regression { background: #f59e0b; color: #000; }
  .badge.insufficient-data { background: #facc15; color: #000; }
  code { color: #a3a3a3; font-size: 0.8rem; }
  .message { font-size: 0.85rem; color: #d4d4d4; }
</style>
</head>
<body>
<h1>Performance Regression Report</h1>
<div class="verdict ${report.passed ? "pass" : "fail"}">${report.passed ? "✅ PASS" : "❌ FAIL"}</div>
<table>
<thead>
  <tr><th>Critical Path</th><th>Metric</th><th>Current</th><th>Budget</th><th>Baseline</th><th>Δ Baseline</th><th>Status</th><th>Message</th></tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
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

function main(): void {
  const noFail = process.argv.includes("--no-fail");

  const budgets = loadBudgets();
  const baseline = loadBaseline();
  const { samples } = loadSamples();

  const report = detectRegressions(budgets, samples, baseline);
  const measurements = summarizeAll(budgets, samples);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify({ ...report, measurements }, null, 2)
  );
  fs.writeFileSync(HTML_REPORT_FILE, generateHtmlReport(report));
  fs.writeFileSync(COMMENT_FILE, generateMarkdownComment(report));

  // eslint-disable-next-line no-console
  console.log(`Report written to ${REPORT_FILE}`);

  const findingsSummary = report.findings
    .map((f) => `  ${statusIcon(f.status)} ${f.name}: ${f.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.log(`\n${findingsSummary}`);

  if (!report.passed && !noFail) {
    console.error("\n❌ Performance regression detected — blocking the CI gate.");
    process.exit(1);
  }
}

main();
