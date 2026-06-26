/**
 * Fixed-point resource quantity backed by BigInt.
 *
 * The value is stored as an integer `raw` interpreted as `raw / 10^scale`, so
 * additions and integer multiplications are exact regardless of magnitude. The
 * only lossy operation is {@link ResourceUnits.toNumber} / {@link toDisplay},
 * which is the single, deliberate conversion-to-`Number` at the tail of the
 * aggregation pipeline.
 *
 * ES2017 target → BigInt literals are unavailable; `BigInt()` is used.
 */

const TEN = BigInt(10);

function pow10(n: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < n; i++) result *= TEN;
  return result;
}

export class ResourceUnits {
  /** @param raw integer value scaled by 10^scale. @param scale fractional digits. */
  constructor(readonly raw: bigint, readonly scale: number = 18) {
    if (scale < 0 || !Number.isInteger(scale)) {
      throw new Error(`scale must be a non-negative integer, got ${scale}`);
    }
  }

  static zero(scale = 18): ResourceUnits {
    return new ResourceUnits(BigInt(0), scale);
  }

  /** Wrap an exact integer count of base units at the given scale. */
  static fromBaseUnits(units: bigint, scale = 18): ResourceUnits {
    return new ResourceUnits(units * pow10(scale), scale);
  }

  /** Re-express this value at a different scale (down-scaling floors). */
  rescale(targetScale: number): ResourceUnits {
    if (targetScale === this.scale) return this;
    if (targetScale > this.scale) {
      return new ResourceUnits(this.raw * pow10(targetScale - this.scale), targetScale);
    }
    return new ResourceUnits(this.raw / pow10(this.scale - targetScale), targetScale);
  }

  /** Exact addition; operands are aligned to the higher scale. */
  add(other: ResourceUnits): ResourceUnits {
    const scale = Math.max(this.scale, other.scale);
    const a = this.rescale(scale);
    const b = other.rescale(scale);
    return new ResourceUnits(a.raw + b.raw, scale);
  }

  /** Exact multiplication by an integer factor (BigInt or integer Number). */
  multiply(factor: bigint | number): ResourceUnits {
    let f: bigint;
    if (typeof factor === "bigint") {
      f = factor;
    } else {
      if (!Number.isInteger(factor)) {
        throw new Error(`multiply expects an integer factor, got ${factor}`);
      }
      f = BigInt(factor);
    }
    return new ResourceUnits(this.raw * f, this.scale);
  }

  /** The exact integer count of base units (fractional part floored). */
  toBaseUnits(): bigint {
    return this.raw / pow10(this.scale);
  }

  /**
   * Convert to a JS number — the single lossy step. Splits into integer and
   * fractional parts so large magnitudes keep their fractional precision.
   */
  toNumber(): number {
    const divisor = pow10(this.scale);
    const whole = this.raw / divisor;
    const frac = this.raw - whole * divisor;
    return Number(whole) + Number(frac) / Number(divisor);
  }

  /**
   * Formatted string for display via `Intl.NumberFormat`. Defaults match the
   * dashboard: 2–4 fraction digits.
   */
  toDisplay(maximumFractionDigits = 4, minimumFractionDigits = 2): string {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(this.toNumber());
  }

  equals(other: ResourceUnits): boolean {
    const scale = Math.max(this.scale, other.scale);
    return this.rescale(scale).raw === other.rescale(scale).raw;
  }
}
