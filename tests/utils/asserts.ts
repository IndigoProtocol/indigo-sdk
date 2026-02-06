import { TxBuilder } from '@lucid-evolution/lucid';
import { match, P } from 'ts-pattern';
import { assert, expect } from 'vitest';

export async function expectScriptFailure(
  /**
   * This doesn't have to be full message, can be just a part of it.
   */
  contains: string,
  tx: Promise<TxBuilder>,
): Promise<void> {
  if (contains.length === 0) {
    throw new Error('Expected error message has to be non empty.');
  }

  const result = await (await tx).completeSafe();

  const errMsg = match(result)
    .with({ _tag: 'Left', left: P.select() }, (smth) => smth.message)
    .otherwise(() => null);

  if (!errMsg) {
    throw new Error(`Expected TX to fail, but it succeeded.`);
  }

  if (!errMsg.includes(contains)) {
    throw new Error(
      `Expected TX to fail with error containing: "${contains}". But got: "${errMsg}"`,
    );
  }
}

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
