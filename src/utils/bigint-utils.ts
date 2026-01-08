import Decimal from 'decimal.js';
import { array as A, ord as Ord } from 'fp-ts';

export function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function sum(arr: bigint[]): bigint {
  return A.reduce<bigint, bigint>(0n, (acc, val) => acc + val)(arr);
}

export function fromDecimal(val: Decimal): bigint {
  return BigInt(val.toString());
}

export const BigIntOrd: Ord.Ord<bigint> = {
  equals: (x, y) => x === y,
  compare: (first, second) => (first < second ? -1 : first > second ? 1 : 0),
};
