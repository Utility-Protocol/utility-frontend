/**
 * Aggregation over metered readings using exact {@link Decimal} arithmetic.
 *
 * Every intermediate stays a Decimal — values are never cast back to `number`
 * mid-pipeline — so daily totals match the per-reading inputs to the last unit
 * (no cumulative drift).
 */

import {
  add,
  average as decAverage,
  decimal,
  max as decMax,
  min as decMin,
  mul,
  sum as decSum,
  type Decimal,
  type Precision,
} from "@/utils/decimal";
import {
  RESOURCE_PRECISION,
  RESOURCE_UNIT,
  type MeterReading,
  type ResourceConsumption,
  type ResourceKind,
  type TariffRate,
} from "@/types/meter";

function valuesOf(readings: MeterReading[]): Decimal[] {
  return readings.map((r) => r.value);
}

/** Exact total of a set of readings (zero at the resource precision if empty). */
export function sumReadings(
  readings: MeterReading[],
  precision: Precision = 0
): Decimal {
  return decSum(valuesOf(readings), precision);
}

/** Mean of a set of readings. Throws on an empty list. */
export function averageReadings(readings: MeterReading[]): Decimal {
  return decAverage(valuesOf(readings));
}

/** Smallest reading value, or null for an empty list. */
export function minReading(readings: MeterReading[]): Decimal | null {
  const values = valuesOf(readings);
  if (values.length === 0) return null;
  return values.reduce((m, v) => decMin(m, v));
}

/** Largest reading value, or null for an empty list. */
export function maxReading(readings: MeterReading[]): Decimal | null {
  const values = valuesOf(readings);
  if (values.length === 0) return null;
  return values.reduce((m, v) => decMax(m, v));
}

/** Running cumulative totals: out[i] = sum(values[0..i]). */
export function cumulativeTotals(values: Decimal[]): Decimal[] {
  const out: Decimal[] = [];
  let acc: Decimal | null = null;
  for (const v of values) {
    acc = acc === null ? v : add(acc, v);
    out.push(acc);
  }
  return out;
}

/** Fold readings of one resource into a {@link ResourceConsumption}. */
export function aggregateReadings<K extends ResourceKind>(
  resource: K,
  readings: MeterReading[]
): ResourceConsumption<K> {
  return {
    resource,
    total: sumReadings(readings, RESOURCE_PRECISION[resource]),
    count: readings.length,
    unit: RESOURCE_UNIT[resource],
  };
}

/**
 * Bucket readings into fixed-width time windows keyed by the window start
 * (`floor(timestamp / windowMs) * windowMs`), returning a sorted list of
 * per-window consumption totals.
 */
export function aggregateByWindow<K extends ResourceKind>(
  resource: K,
  readings: MeterReading[],
  windowMs: number
): { windowStart: number; consumption: ResourceConsumption<K> }[] {
  if (windowMs <= 0) throw new Error("windowMs must be positive");
  const buckets = new Map<number, MeterReading[]>();
  for (const r of readings) {
    const start = Math.floor(r.timestamp / windowMs) * windowMs;
    const list = buckets.get(start);
    if (list) list.push(r);
    else buckets.set(start, [r]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([windowStart, group]) => ({
      windowStart,
      consumption: aggregateReadings(resource, group),
    }));
}

/**
 * Apply a tariff: cost = total × ratePerUnit, returned at currency precision.
 * Computed exactly, then quantized once to 2 decimals.
 */
export function applyTariff(total: Decimal, rate: TariffRate): Decimal<2> {
  const cost = mul(total, rate.ratePerUnit);
  // Re-wrap at currency precision so the cost serializes to 2 decimals.
  return decimal(cost.toFixed(), 2);
}
