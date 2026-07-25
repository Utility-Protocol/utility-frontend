import { aggregateReadings, type Reading } from "@/utils/aggregation/resourceMath";
import { RESOURCE_TYPES, type ResourceType } from "@/utils/aggregation/unitConversion";

export interface HistoricalReading extends Reading {
  /** Unix milliseconds. */
  timestamp: number;
}

export interface CapacityLimit {
  resource: ResourceType;
  /** Provisioned capacity in base resource units for one planning window. */
  capacityBase: bigint | number | string;
}

export interface CapacityForecastOptions {
  /** Width of each historical bucket. */
  windowMs: number;
  /** Number of future windows to project. */
  horizonWindows: number;
  /** Optional growth buffer applied after trend projection. @default 0.15 */
  safetyMargin?: number;
}

export interface ResourceForecast {
  resource: ResourceType;
  currentBase: bigint;
  projectedBase: bigint;
  recommendedCapacityBase: bigint;
  utilization: number;
  projectedUtilization: number;
  trendPerWindowBase: bigint;
  windowsObserved: number;
  exhaustedAtWindow: number | null;
  status: "healthy" | "watch" | "critical";
}

export interface CapacityPlan {
  generatedAt: number;
  windowMs: number;
  horizonWindows: number;
  forecasts: Record<ResourceType, ResourceForecast>;
}

function toBaseCapacity(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value);
}

function bucketReadings(readings: HistoricalReading[], windowMs: number) {
  const buckets = new Map<number, HistoricalReading[]>();
  for (const reading of readings) {
    const windowStart = Math.floor(reading.timestamp / windowMs) * windowMs;
    const bucket = buckets.get(windowStart);
    if (bucket) bucket.push(reading);
    else buckets.set(windowStart, [reading]);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]);
}

function positiveTrend(values: bigint[]): bigint {
  if (values.length < 2) return BigInt(0);
  let totalIncrease = BigInt(0);
  let samples = BigInt(0);
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > BigInt(0)) totalIncrease += delta;
    samples += BigInt(1);
  }
  return totalIncrease / samples;
}

function utilization(used: bigint, capacity: bigint): number {
  if (capacity <= BigInt(0)) return used > BigInt(0) ? Infinity : 0;
  return Number(used) / Number(capacity);
}

function applySafetyMargin(value: bigint, safetyMargin: number): bigint {
  const basisPoints = BigInt(Math.ceil(safetyMargin * 10_000));
  const denominator = BigInt(10_000);
  return value + (value * basisPoints + denominator - BigInt(1)) / denominator;
}

function statusFor(projectedUtilization: number): ResourceForecast["status"] {
  if (projectedUtilization >= 0.95) return "critical";
  if (projectedUtilization >= 0.8) return "watch";
  return "healthy";
}

/**
 * Build a deterministic capacity plan from historical readings.
 *
 * The hot path is O(readings + resources × windows) and reuses the exact BigInt
 * aggregation pipeline so trends cannot drift as history grows.
 */
export function planCapacity(
  readings: HistoricalReading[],
  limits: CapacityLimit[],
  options: CapacityForecastOptions
): CapacityPlan {
  if (options.windowMs <= 0) throw new Error("windowMs must be positive");
  if (options.horizonWindows < 0) throw new Error("horizonWindows cannot be negative");

  const safetyMargin = options.safetyMargin ?? 0.15;
  if (safetyMargin < 0) throw new Error("safetyMargin cannot be negative");

  const capacityByResource = new Map(
    limits.map((limit) => [limit.resource, toBaseCapacity(limit.capacityBase)] as const)
  );
  const buckets = bucketReadings(readings, options.windowMs);
  const forecasts = {} as Record<ResourceType, ResourceForecast>;

  for (const resource of RESOURCE_TYPES) {
    const series = buckets.map(([, bucket]) =>
      aggregateReadings(bucket.filter((reading) => reading.resource === resource), {
        logger: { warn: () => {} },
      }).byResource[resource]
    );
    const currentBase = series.at(-1) ?? BigInt(0);
    const trendPerWindowBase = positiveTrend(series);
    const projectedBase = currentBase + trendPerWindowBase * BigInt(options.horizonWindows);
    const recommendedCapacityBase = applySafetyMargin(projectedBase, safetyMargin);
    const capacityBase = capacityByResource.get(resource) ?? recommendedCapacityBase;
    const projectedUtilization = utilization(projectedBase, capacityBase);
    const exhaustedAtWindow =
      trendPerWindowBase > BigInt(0) && currentBase < capacityBase
        ? Number((capacityBase - currentBase + trendPerWindowBase - BigInt(1)) / trendPerWindowBase)
        : currentBase >= capacityBase
          ? 0
          : null;

    forecasts[resource] = {
      resource,
      currentBase,
      projectedBase,
      recommendedCapacityBase,
      utilization: utilization(currentBase, capacityBase),
      projectedUtilization,
      trendPerWindowBase,
      windowsObserved: series.length,
      exhaustedAtWindow,
      status: statusFor(projectedUtilization),
    };
  }

  return {
    generatedAt: Date.now(),
    windowMs: options.windowMs,
    horizonWindows: options.horizonWindows,
    forecasts,
  };
}
