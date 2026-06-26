/**
 * Per-resource conversion factors for the consumption dashboard.
 *
 * Raw meter readings are integers (micro-units); each resource is converted to
 * a common "resource unit" base by an integer factor. Conversion is done in
 * BigInt so a factor like 3,600,000 never loses low-order digits the way
 * `Number` multiplication does (the 0.01%-per-reading drift that accumulated to
 * a 3.5% daily dashboard error).
 *
 * Note: this project targets ES2017, so BigInt *literals* (`1000n`) are not
 * available — the `BigInt()` constructor is used throughout.
 */

export type ResourceType = "water" | "energy" | "bandwidth";

/** Exact integer conversion factors (BigInt). */
export const RESOURCE_FACTORS: Record<ResourceType, bigint> = {
  water: BigInt(1000), // 10^3  (megaliters)
  energy: BigInt(3_600_000), // 3.6×10^6 (kWh → base)
  bandwidth: BigInt(1_000_000_000), // 10^9  (GB)
};

/** The same factors as `number`, used only by the precision-audit comparison. */
export const RESOURCE_FACTORS_NUMBER: Record<ResourceType, number> = {
  water: 1e3,
  energy: 3.6e6,
  bandwidth: 1e9,
};

export const RESOURCE_TYPES: ResourceType[] = ["water", "energy", "bandwidth"];

/** Coerce a reading value to a non-negative BigInt integer. */
export function toBigIntReading(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return BigInt(value);
  if (!Number.isFinite(value)) throw new Error(`invalid reading: ${value}`);
  // Meter readings are integers; truncate any incidental fractional part.
  return BigInt(Math.trunc(value));
}

/** Convert a raw reading to exact base resource units (BigInt). */
export function convertToBase(
  resource: ResourceType,
  rawReading: bigint | number | string
): bigint {
  return toBigIntReading(rawReading) * RESOURCE_FACTORS[resource];
}

/** Convert a raw reading to base units using lossy `Number` math (audit only). */
export function convertToBaseApprox(
  resource: ResourceType,
  rawReading: bigint | number | string
): number {
  return Number(rawReading) * RESOURCE_FACTORS_NUMBER[resource];
}
