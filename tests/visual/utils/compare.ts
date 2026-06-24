import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { PIXELMATCH_OPTIONS } from "../config";

export interface CompareResult {
  /** Whether the images match within the given threshold */
  match: boolean;
  /** Ratio of differing pixels to total pixels (0-1) */
  diffRatio: number;
  /** Absolute count of differing pixels */
  diffPixels: number;
  /** Total pixels in the image */
  totalPixels: number;
  /** Path to the diff image written to disk */
  diffPath: string | null;
  /** Human-readable error message when baseline is missing or unreadable */
  error: string | null;
}

/**
 * Compare a captured screenshot against its baseline using pixelmatch.
 *
 * When the baseline does not exist yet (first run / new route) a "missing
 * baseline" result is returned so the test can be skipped rather than
 * failed — the screenshot is still written to `results/` so it can be
 * promoted to a baseline later via the update-baselines script.
 *
 * @param baselinePath  Absolute path to the reference PNG
 * @param actualPath    Absolute path to the just-captured PNG
 * @param diffPath      Absolute path where the diff PNG should be written
 * @param maxDiffRatio  Maximum acceptable ratio of differing pixels (0-1)
 */
export function compare(
  baselinePath: string,
  actualPath: string,
  diffPath: string,
  maxDiffRatio: number
): CompareResult {
  // First-run / new-route guard: no baseline on disk
  if (!fs.existsSync(baselinePath)) {
    return {
      match: false,
      diffRatio: 1,
      diffPixels: 0,
      totalPixels: 0,
      diffPath: null,
      error: `Missing baseline: ${baselinePath}`,
    };
  }

  let baselineImg: PNG;
  let actualImg: PNG;

  try {
    baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
    actualImg = PNG.sync.read(fs.readFileSync(actualPath));
  } catch (err) {
    return {
      match: false,
      diffRatio: 1,
      diffPixels: 0,
      totalPixels: 0,
      diffPath: null,
      error: `Failed to read PNG: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // pixelmatch requires both images to be the same dimensions
  if (baselineImg.width !== actualImg.width || baselineImg.height !== actualImg.height) {
    return {
      match: false,
      diffRatio: 1,
      diffPixels: baselineImg.width * baselineImg.height,
      totalPixels: baselineImg.width * baselineImg.height,
      diffPath: null,
      error: `Dimension mismatch: baseline ${baselineImg.width}x${baselineImg.height} vs actual ${actualImg.width}x${actualImg.height}`,
    };
  }

  const { width, height } = baselineImg;
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    baselineImg.data,
    actualImg.data,
    diff.data,
    width,
    height,
    PIXELMATCH_OPTIONS
  );

  const totalPixels = width * height;
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

  // Write the diff image even when matching so the artifact is available
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    match: diffRatio <= maxDiffRatio,
    diffRatio,
    diffPixels,
    totalPixels,
    diffPath,
    error: null,
  };
}
