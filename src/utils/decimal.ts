/**
 * Fixed-point decimal arithmetic safety wrapper.
 *
 * JavaScript `number` arithmetic accumulates rounding error that grows
 * unboundedly over aggregation windows. This module wraps BigNumber.js in a
 * branded {@link Decimal} type that carries an explicit precision (decimal
 * scale), keeps intermediate results exact, detects overflow against a hard
 * `MAX_SAFE` ceiling, and serializes losslessly for the store.
 *
 * Values are kept exact internally; rounding (ROUND_HALF_UP) happens only at
 * serialization / display boundaries — that is what eliminates cumulative drift.
 */

import BigNumber from "bignumber.js";

/** A dedicated BigNumber constructor so we never mutate the global config. */
const BN = BigNumber.clone({
  DECIMAL_PLACES: 28, // significant digits for non-terminating division
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  EXPONENTIAL_AT: [-40, 40],
});

/** Supported precisions (decimal scale) across the tariff taxonomy. */
export const SUPPORTED_PRECISIONS = [0, 2, 3, 4, 6, 9] as const;
export type Precision = (typeof SUPPORTED_PRECISIONS)[number];

/** Overflow ceiling: 10^21 (1 trillion units at 9 decimals) per resource. */
export const MAX_SAFE = new BN(10).pow(21);

/** Thrown when an operation would exceed {@link MAX_SAFE}. */
export class SafetyRangeError extends Error {
  constructor(readonly value: string, operation?: string) {
    super(
      `Value ${value} exceeds the safe range of ±10^21${
        operation ? ` during ${operation}` : ""
      }`
    );
    this.name = "SafetyRangeError";
  }
}

/** Thrown for an unsupported precision or malformed numeric input. */
export class PrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrecisionError";
  }
}

/** Serialized form stored in the slice (string-encoded to avoid FP corruption). */
export interface SerializedDecimal {
  value: string;
  precision: number;
  /** Integer scaling factor (10^precision) to convert to minor units. */
  scale: number;
}

declare const PRECISION_BRAND: unique symbol;

/**
 * A precision-tagged fixed-point value. The phantom `P` lets the compiler track
 * the declared precision; the runtime value is a {@link DecimalValue}.
 */
export type Decimal<P extends number = number> = DecimalValue & {
  readonly [PRECISION_BRAND]?: P;
};

class DecimalValue {
  constructor(
    /** Exact underlying value (not pre-rounded to `precision`). */
    readonly bn: BigNumber,
    /** Declared decimal scale used for serialization / display. */
    readonly precision: number
  ) {}

  /** Round to the declared precision and format as a plain decimal string. */
  toFixed(): string {
    return this.bn.toFixed(this.precision, BigNumber.ROUND_HALF_UP);
  }

  toString(): string {
    return this.toFixed();
  }

  /** Lossy conversion to a JS number (for charting). Prefer {@link toFixed}. */
  toNumber(): number {
    return this.bn.toNumber();
  }

  /** Lossless serialization for the store / Redux DevTools. */
  toRedux(): SerializedDecimal {
    return {
      value: this.toFixed(),
      precision: this.precision,
      scale: 10 ** this.precision,
    };
  }

  isSafe(): boolean {
    return this.bn.abs().lte(MAX_SAFE);
  }
}

function assertPrecision(precision: number): void {
  if (!SUPPORTED_PRECISIONS.includes(precision as Precision)) {
    throw new PrecisionError(
      `Unsupported precision ${precision}; expected one of ${SUPPORTED_PRECISIONS.join(
        ", "
      )}`
    );
  }
}

function guard(bn: BigNumber, operation: string, precision: number): DecimalValue {
  if (bn.isNaN()) {
    throw new PrecisionError(`Result of ${operation} is not a number`);
  }
  if (bn.abs().gt(MAX_SAFE)) {
    throw new SafetyRangeError(bn.toFixed(), operation);
  }
  return new DecimalValue(bn, precision);
}

/** True when `x` is a {@link Decimal}. */
export function isDecimal(x: unknown): x is Decimal {
  return x instanceof DecimalValue;
}

/**
 * Construct a {@link Decimal} from a string or number at the given precision.
 * The input is quantized (ROUND_HALF_UP) to `precision`, so the result exactly
 * represents a fixed-point value at that scale.
 */
export function decimal<P extends Precision>(
  value: string | number | BigNumber,
  precision: P
): Decimal<P> {
  assertPrecision(precision);
  let parsed: BigNumber;
  try {
    parsed = new BN(value);
  } catch {
    throw new PrecisionError(`Invalid numeric input: ${String(value)}`);
  }
  if (parsed.isNaN()) {
    throw new PrecisionError(`Invalid numeric input: ${String(value)}`);
  }
  const quantized = parsed.decimalPlaces(precision, BigNumber.ROUND_HALF_UP);
  return guard(quantized, "decimal()", precision) as Decimal<P>;
}

/** Rehydrate a {@link Decimal} from its serialized form. */
export function fromRedux(s: SerializedDecimal): Decimal {
  return decimal(s.value, s.precision as Precision);
}

/** Highest precision among operands (the scale add/sub/min/max upcast to). */
function maxPrecision(values: Decimal[]): number {
  return values.reduce((m, d) => Math.max(m, d.precision), 0);
}

// --- Arithmetic -------------------------------------------------------------

/** Sum two decimals, upcasting to the higher precision. */
export function add(a: Decimal, b: Decimal): Decimal {
  return guard(a.bn.plus(b.bn), "add", maxPrecision([a, b]));
}

/** Difference, upcasting to the higher precision. */
export function sub(a: Decimal, b: Decimal): Decimal {
  return guard(a.bn.minus(b.bn), "sub", maxPrecision([a, b]));
}

/** Product. Result precision is the sum of scales, capped at 9. */
export function mul(a: Decimal, b: Decimal): Decimal {
  const precision = Math.min(a.precision + b.precision, 9);
  return guard(a.bn.times(b.bn), "mul", precision);
}

/** Quotient (28 significant digits). Result precision upcasts to the higher. */
export function div(a: Decimal, b: Decimal): Decimal {
  if (b.bn.isZero()) {
    throw new PrecisionError("Division by zero");
  }
  return guard(a.bn.div(b.bn), "div", maxPrecision([a, b]));
}

/** Smaller of two decimals (keeps that operand's precision). */
export function min(a: Decimal, b: Decimal): Decimal {
  return a.bn.lte(b.bn) ? a : b;
}

/** Larger of two decimals (keeps that operand's precision). */
export function max(a: Decimal, b: Decimal): Decimal {
  return a.bn.gte(b.bn) ? a : b;
}

/**
 * Exact sum of a list, upcasting to the highest precision present. An empty
 * list returns zero at the requested `precision` (default 0).
 */
export function sum(values: Decimal[], precision: Precision = 0): Decimal {
  if (values.length === 0) return decimal(0, precision);
  const scale = Math.max(maxPrecision(values), precision);
  let acc = new BN(0);
  for (const d of values) {
    acc = acc.plus(d.bn);
    if (acc.abs().gt(MAX_SAFE)) {
      throw new SafetyRangeError(acc.toFixed(), "sum");
    }
  }
  return new DecimalValue(acc, scale) as Decimal;
}

/** Arithmetic mean, computed exactly then carried at the highest precision. */
export function average(values: Decimal[]): Decimal {
  if (values.length === 0) {
    throw new PrecisionError("Cannot average an empty list");
  }
  const total = sum(values);
  return guard(
    total.bn.div(values.length),
    "average",
    maxPrecision(values)
  );
}

/** Negate. */
export function neg(a: Decimal): Decimal {
  return new DecimalValue(a.bn.negated(), a.precision) as Decimal;
}

/** Absolute value. */
export function abs(a: Decimal): Decimal {
  return new DecimalValue(a.bn.abs(), a.precision) as Decimal;
}

// --- Comparisons ------------------------------------------------------------

export function eq(a: Decimal, b: Decimal): boolean {
  return a.bn.eq(b.bn);
}
export function gt(a: Decimal, b: Decimal): boolean {
  return a.bn.gt(b.bn);
}
export function gte(a: Decimal, b: Decimal): boolean {
  return a.bn.gte(b.bn);
}
export function lt(a: Decimal, b: Decimal): boolean {
  return a.bn.lt(b.bn);
}
export function lte(a: Decimal, b: Decimal): boolean {
  return a.bn.lte(b.bn);
}

/**
 * Convert to a JS number for charting libraries, warning when the conversion
 * loses more than one ULP of precision relative to the exact value.
 */
export function toDecimalNumber(d: Decimal): number {
  const n = d.bn.toNumber();
  const roundtrip = new BN(n);
  const lost = d.bn.minus(roundtrip).abs();
  if (lost.gt(Number.EPSILON)) {
    console.warn(
      `[decimal] precision loss converting ${d.toFixed()} to number (Δ=${lost.toFixed()})`
    );
  }
  return n;
}
