import BigNumber from "bignumber.js";

BigNumber.config({
  DECIMAL_PLACES: 20,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  EXPONENTIAL_AT: [-30, 30],
});

export const SCALE = 7;
export const SCALE_FACTOR = new BigNumber(10).pow(SCALE);

export function toContractUnits(value: string | number | BigNumber): string {
  return new BigNumber(value).times(SCALE_FACTOR).toFixed(0, BigNumber.ROUND_HALF_UP);
}

export function fromContractUnits(value: string | number | BigNumber): string {
  return new BigNumber(value).div(SCALE_FACTOR).toFixed(SCALE, BigNumber.ROUND_HALF_UP);
}

export function add(a: string | number | BigNumber, b: string | number | BigNumber): string {
  return new BigNumber(a).plus(b).toFixed(SCALE);
}

export function subtract(a: string | number | BigNumber, b: string | number | BigNumber): string {
  return new BigNumber(a).minus(b).toFixed(SCALE);
}

export function multiply(a: string | number | BigNumber, b: string | number | BigNumber): string {
  return new BigNumber(a).times(b).toFixed(SCALE);
}

export function divide(a: string | number | BigNumber, b: string | number | BigNumber): string {
  return new BigNumber(a).div(b).toFixed(SCALE);
}

export function compare(a: string | number | BigNumber, b: string | number | BigNumber): -1 | 0 | 1 {
  const diff = new BigNumber(a).minus(b);
  if (diff.isZero()) return 0;
  return diff.isPositive() ? 1 : -1;
}

export function formatDisplay(value: string | number | BigNumber, decimals = 7): string {
  return new BigNumber(value).toFormat(decimals);
}

export function formatCompact(value: string | number | BigNumber): string {
  const bn = new BigNumber(value);
  if (bn.isGreaterThanOrEqualTo(1_000_000)) return `${bn.div(1_000_000).toFixed(2)}M`;
  if (bn.isGreaterThanOrEqualTo(1_000)) return `${bn.div(1_000).toFixed(2)}K`;
  return bn.toFixed(2);
}

export function isZero(value: string | number | BigNumber): boolean {
  return new BigNumber(value).isZero();
}

export function isGreaterThan(
  a: string | number | BigNumber,
  b: string | number | BigNumber
): boolean {
  return new BigNumber(a).isGreaterThan(b);
}

export function toNumber(value: string | number | BigNumber): number {
  return new BigNumber(value).toNumber();
}
