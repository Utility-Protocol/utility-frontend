/**
 * Domain types for multi-tariff metering, expressed in terms of the fixed-point
 * {@link Decimal} type so consumption values never round-trip through `number`.
 */

import type { Decimal, Precision, SerializedDecimal } from "@/utils/decimal";

/** Metered resource kinds and their natural decimal precision. */
export type ResourceKind =
  | "water" // liters, integer
  | "electricity" // kWh, 3 decimals
  | "gas" // therms, 4 decimals
  | "cost" // fiat, 2 decimals
  | "submeter" // fine-grained, 6 decimals
  | "nano"; // nanoscale, 9 decimals

/** Canonical precision per resource kind. */
export const RESOURCE_PRECISION: Record<ResourceKind, Precision> = {
  water: 0,
  electricity: 3,
  gas: 4,
  cost: 2,
  submeter: 6,
  nano: 9,
};

/** Display unit per resource kind. */
export const RESOURCE_UNIT: Record<ResourceKind, string> = {
  water: "L",
  electricity: "kWh",
  gas: "therm",
  cost: "",
  submeter: "u",
  nano: "nu",
};

/** A single reading from a meter. */
export interface MeterReading<K extends ResourceKind = ResourceKind> {
  meterId: string;
  resource: K;
  /** Unix milliseconds. */
  timestamp: number;
  value: Decimal<(typeof RESOURCE_PRECISION)[K]>;
}

/** Aggregated consumption for a resource over a window. */
export interface ResourceConsumption<K extends ResourceKind = ResourceKind> {
  resource: K;
  total: Decimal;
  /** Number of readings folded into the total. */
  count: number;
  unit: string;
}

/** A tariff rate (cost per unit), priced in currency precision. */
export interface TariffRate {
  resource: ResourceKind;
  /** Cost per unit, currency precision (2 decimals). */
  ratePerUnit: Decimal<2>;
  currency: string;
}

/** Serialized reading as stored in the slice (string-encoded decimal). */
export interface SerializedMeterReading {
  meterId: string;
  resource: ResourceKind;
  timestamp: number;
  value: SerializedDecimal;
}
