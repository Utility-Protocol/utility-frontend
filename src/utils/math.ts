import BigNumber from "bignumber.js";

BigNumber.config({
  DECIMAL_PLACES: 20,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  EXPONENTIAL_AT: [-30, 30],
});

/** Soroban contract states are 7-decimal fixed-point integers (×10^7). */
export const SCALE = 7;
export const SCALE_FACTOR = new BigNumber(10).pow(SCALE);

/** Signed 128-bit integer bounds (Soroban i128). */
export const I128_MAX = new BigNumber(
  "170141183460469231731687303715884105727"
);
export const I128_MIN = new BigNumber(
  "-170141183460469231731687303715884105728"
);

/** Safe upper bound for the integer part of an authored value (10^12). */
export const MAX_INTEGER_PART = new BigNumber(10).pow(12);

/** Decimal value (the un-scaled, human-facing number) inputs accept. */
export type DecimalInput = string | number | BigNumber;

export class OverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverflowError";
  }
}

export class ScaleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaleValidationError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ScaleValidation {
  valid: boolean;
  reason?: string;
}

/** Plain decimal (no exponent): optional sign, digits, optional fraction. */
const DECIMAL_RE = /^[+-]?(\d+)(\.(\d+))?$/;
/** Exponential notation, e.g. 1e7, -2.5E-3. */
const EXPONENTIAL_RE = /^[+-]?(\d+)(\.\d+)?[eE][+-]?\d+$/;

/**
 * Validate that a value is safe to convert to contract units:
 *  - at most {@link SCALE} (7) digits after the decimal point,
 *  - no exponential notation unless it represents a safe integer,
 *  - integer part not exceeding {@link MAX_INTEGER_PART} (10^12).
 */
export function validateScale(value: string): ScaleValidation {
  if (typeof value !== "string" || value.trim() === "") {
    return { valid: false, reason: "value must be a non-empty string" };
  }
  const trimmed = value.trim();

  const isExponential = EXPONENTIAL_RE.test(trimmed);
  if (!isExponential && !DECIMAL_RE.test(trimmed)) {
    return { valid: false, reason: "not a valid decimal number" };
  }

  const bn = new BigNumber(trimmed);
  if (bn.isNaN() || !bn.isFinite()) {
    return { valid: false, reason: "not a finite number" };
  }

  if (isExponential) {
    // Exponential notation is only accepted when it denotes a safe integer,
    // so authored fractions can't smuggle in hidden sub-1e-7 precision.
    if (!bn.isInteger()) {
      return {
        valid: false,
        reason: "exponential notation is only allowed for integers",
      };
    }
    if (!Number.isSafeInteger(bn.toNumber())) {
      return {
        valid: false,
        reason: "exponential value is not a safe integer",
      };
    }
  }

  const decimals = bn.decimalPlaces() ?? 0;
  if (decimals > SCALE) {
    return {
      valid: false,
      reason: `more than ${SCALE} decimal places (${decimals})`,
    };
  }

  const integerPart = bn.abs().integerValue(BigNumber.ROUND_DOWN);
  if (integerPart.isGreaterThan(MAX_INTEGER_PART)) {
    return {
      valid: false,
      reason: `integer part exceeds ${MAX_INTEGER_PART.toFixed(0)}`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Scaling (pure)
// ---------------------------------------------------------------------------

export interface ScaleOptions {
  /** Reject values that fail {@link validateScale} instead of truncating. */
  strict?: boolean;
}

function toBigNumber(value: DecimalInput): BigNumber {
  let bn: BigNumber;
  try {
    bn = new BigNumber(value);
  } catch {
    throw new ScaleValidationError(`invalid numeric input: ${String(value)}`);
  }
  if (bn.isNaN() || !bn.isFinite()) {
    throw new ScaleValidationError(`invalid numeric input: ${String(value)}`);
  }
  return bn;
}

/**
 * Convert a human decimal to its 7-decimal contract-unit integer string.
 * Extra precision is explicitly truncated (ROUND_DOWN); in `strict` mode a
 * value with more than 7 decimals is rejected instead. Throws on i128 overflow.
 */
export function toContractUnits(
  value: DecimalInput,
  options: ScaleOptions = {}
): string {
  if (options.strict && typeof value === "string") {
    const result = validateScale(value);
    if (!result.valid) {
      throw new ScaleValidationError(result.reason ?? "invalid scale");
    }
  }

  const bn = toBigNumber(value);
  // Explicitly truncate beyond 7 decimals rather than silently rounding.
  const truncated = bn.decimalPlaces(SCALE, BigNumber.ROUND_DOWN);
  const scaled = truncated.times(SCALE_FACTOR).integerValue(BigNumber.ROUND_DOWN);
  assertI128(scaled);
  return scaled.toFixed(0);
}

/** Convert a contract-unit integer back to a 7-decimal human string. */
export function fromContractUnits(value: DecimalInput): string {
  const bn = toBigNumber(value);
  return bn.div(SCALE_FACTOR).toFixed(SCALE, BigNumber.ROUND_HALF_UP);
}

/** Throw {@link OverflowError} if a contract-unit value is outside i128. */
export function assertI128(scaled: BigNumber): void {
  if (scaled.isGreaterThan(I128_MAX) || scaled.isLessThan(I128_MIN)) {
    throw new OverflowError(
      `value ${scaled.toFixed(0)} exceeds the i128 range`
    );
  }
}

// ---------------------------------------------------------------------------
// Safe arithmetic (throws on overflow)
// ---------------------------------------------------------------------------

/** Assert a decimal result fits i128 once scaled to contract units. */
function assertResultInRange(result: BigNumber): void {
  assertI128(result.times(SCALE_FACTOR).integerValue(BigNumber.ROUND_DOWN));
}

export function addSafe(a: DecimalInput, b: DecimalInput): string {
  const result = toBigNumber(a).plus(toBigNumber(b));
  assertResultInRange(result);
  return result.toFixed(SCALE);
}

export function subtractSafe(a: DecimalInput, b: DecimalInput): string {
  const result = toBigNumber(a).minus(toBigNumber(b));
  assertResultInRange(result);
  return result.toFixed(SCALE);
}

export function multiplySafe(a: DecimalInput, b: DecimalInput): string {
  const result = toBigNumber(a).times(toBigNumber(b));
  assertResultInRange(result);
  return result.toFixed(SCALE);
}

export function divideSafe(a: DecimalInput, b: DecimalInput): string {
  const divisor = toBigNumber(b);
  if (divisor.isZero()) {
    throw new OverflowError("division by zero");
  }
  const result = toBigNumber(a).div(divisor);
  assertResultInRange(result);
  return result.toFixed(SCALE);
}

// ---------------------------------------------------------------------------
// General-purpose helpers (unchanged public surface)
// ---------------------------------------------------------------------------

export function add(a: DecimalInput, b: DecimalInput): string {
  return new BigNumber(a).plus(b).toFixed(SCALE);
}

export function subtract(a: DecimalInput, b: DecimalInput): string {
  return new BigNumber(a).minus(b).toFixed(SCALE);
}

export function multiply(a: DecimalInput, b: DecimalInput): string {
  return new BigNumber(a).times(b).toFixed(SCALE);
}

export function divide(a: DecimalInput, b: DecimalInput): string {
  return new BigNumber(a).div(b).toFixed(SCALE);
}

export function compare(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const diff = new BigNumber(a).minus(b);
  if (diff.isZero()) return 0;
  return diff.isPositive() ? 1 : -1;
}

export function formatDisplay(value: DecimalInput, decimals = 7): string {
  return new BigNumber(value).toFormat(decimals);
}

export function formatCompact(value: DecimalInput): string {
  const bn = new BigNumber(value);
  if (bn.isGreaterThanOrEqualTo(1_000_000)) return `${bn.div(1_000_000).toFixed(2)}M`;
  if (bn.isGreaterThanOrEqualTo(1_000)) return `${bn.div(1_000).toFixed(2)}K`;
  return bn.toFixed(2);
}

export function isZero(value: DecimalInput): boolean {
  return new BigNumber(value).isZero();
}

export function isGreaterThan(a: DecimalInput, b: DecimalInput): boolean {
  return new BigNumber(a).isGreaterThan(b);
}

export function toNumber(value: DecimalInput): number {
  return new BigNumber(value).toNumber();
}
