import { assert, expect } from 'vitest';

export function assertValueInRange<T extends number | bigint>(
  val: T,
  bounds: { min: T; max: T },
): void {
  assert(bounds.max > bounds.min, 'Bounds are incorrectly configured.');

  expect(
    bounds.min <= val && val <= bounds.max,
    `${val} not in range [${bounds.min}, ${bounds.max}]`,
  ).toBeTruthy();
}
