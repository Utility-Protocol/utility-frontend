#!/usr/bin/env -S npx tsx

/**
 * Visual Baseline Update Script
 *
 * Copies the latest screenshots from `tests/visual/results/` into
 * `tests/visual/baselines/` so they become the new reference images.
 *
 * Usage:
 *   npm run visual:update-baselines
 *
 * Run this script on the `main` branch after visually verifying that
 * the current screenshots are correct.  The updated baselines should
 * then be committed to the repository.
 */

import fs from "node:fs";
import path from "node:path";

const RESULTS_DIR = path.resolve(__dirname, "../tests/visual/results");
const BASELINE_DIR = path.resolve(__dirname, "../tests/visual/baselines");

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(
      `✗ Results directory not found: ${RESULTS_DIR}\n` +
        `  Run \`npx playwright test tests/visual\` first to generate screenshots.`
    );
    process.exit(1);
  }

  // Clear existing baselines
  if (fs.existsSync(BASELINE_DIR)) {
    fs.rmSync(BASELINE_DIR, { recursive: true, force: true });
  }

  copyDir(RESULTS_DIR, BASELINE_DIR);

  const count = countFiles(BASELINE_DIR);
  // eslint-disable-next-line no-console
  console.log(`✓ Baselines updated: ${count} file(s) copied to ${BASELINE_DIR}`);
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

main();
