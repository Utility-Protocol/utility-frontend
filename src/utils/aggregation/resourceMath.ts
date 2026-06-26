/**
 * Exact resource-consumption aggregation.
 *
 * All conversion and summation happens in BigInt space; the result is an exact
 * integer count of base resource units. A precision audit also computes the old
 * `Number`-arithmetic total and logs a warning when its relative error exceeds
 * {@link PRECISION_THRESHOLD} — observability for the drift this module fixes.
 */

import {
  RESOURCE_TYPES,
  convertToBase,
  convertToBaseApprox,
  type ResourceType,
} from "@/utils/aggregation/unitConversion";
import { ResourceUnits } from "@/utils/aggregation/ResourceUnits";

/** Maximum readings folded into a single aggregation window. */
export const MAX_READINGS_PER_WINDOW = 10_000;
/** Relative-error budget: |displayed − exact| / exact must stay below this. */
export const PRECISION_THRESHOLD = 1e-5;

export interface Reading {
  resource: ResourceType;
  /** Raw integer meter reading (micro-units). */
  value: bigint | number | string;
}

export interface AggregationResult {
  /** Exact total in base resource units. */
  total: ResourceUnits;
  /** Exact integer base units. */
  exactBase: bigint;
  /** Old `Number`-pipeline total, retained for the audit comparison. */
  approxBase: number;
  /** `|approxBase − exactBase| / exactBase` (0 when exact is 0). */
  relativeError: number;
  /** Exact per-resource subtotals. */
  byResource: Record<ResourceType, bigint>;
  readingCount: number;
}

export interface AggregateOptions {
  /** Injectable logger (defaults to console) for the precision audit. */
  logger?: Pick<Console, "warn">;
}

/** Relative error between a `Number` approximation and a BigInt exact value. */
export function relativeError(approx: number, exact: bigint): number {
  if (exact === BigInt(0)) return approx === 0 ? 0 : Infinity;
  const exactNum = Number(exact);
  return Math.abs(approx - exactNum) / Math.abs(exactNum);
}

function emptyByResource(): Record<ResourceType, bigint> {
  return { water: BigInt(0), energy: BigInt(0), bandwidth: BigInt(0) };
}

/**
 * Aggregate a window of readings into an exact total. The BigInt pipeline is
 * authoritative; the `Number` pipeline runs only to audit precision drift.
 */
export function aggregateReadings(
  readings: Reading[],
  options: AggregateOptions = {}
): AggregationResult {
  const logger = options.logger ?? console;

  if (readings.length > MAX_READINGS_PER_WINDOW) {
    logger.warn(
      `[resourceMath] window has ${readings.length} readings, exceeding the ${MAX_READINGS_PER_WINDOW} cap`
    );
  }

  const byResource = emptyByResource();
  let exactBase = BigInt(0);
  let approxBase = 0;

  for (const reading of readings) {
    const base = convertToBase(reading.resource, reading.value);
    exactBase += base;
    byResource[reading.resource] += base;
    approxBase += convertToBaseApprox(reading.resource, reading.value);
  }

  const relError = relativeError(approxBase, exactBase);
  if (relError > PRECISION_THRESHOLD) {
    logger.warn(
      `[resourceMath] precision audit: Number pipeline drifted ${(relError * 100).toFixed(
        4
      )}% (approx=${approxBase}, exact=${exactBase.toString()}) — using exact BigInt total`
    );
  }

  return {
    total: ResourceUnits.fromBaseUnits(exactBase, 0),
    exactBase,
    approxBase,
    relativeError: relError,
    byResource,
    readingCount: readings.length,
  };
}

/** Exact per-resource totals wrapped as {@link ResourceUnits} (scale 0). */
export function perResourceUnits(
  result: AggregationResult
): Record<ResourceType, ResourceUnits> {
  const out = {} as Record<ResourceType, ResourceUnits>;
  for (const type of RESOURCE_TYPES) {
    out[type] = ResourceUnits.fromBaseUnits(result.byResource[type], 0);
  }
  return out;
}
