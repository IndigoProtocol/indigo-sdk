import * as fs from 'fs';
import { SystemParams } from '../types/system-params';
import { match, P } from 'ts-pattern';

/**
 * Accept only a single item in the array and return it.
 * When not exclusively a single item, throw an error.
 */
export function matchSingle<T>(xs: T[], mkErr: (xs: T[]) => Error): T {
  return match(xs)
    .with([P.select()], (res) => res as T)
    .otherwise(() => {
      throw mkErr(xs);
    });
}

export function calculateFeeFromPercentage(
  percent: bigint,
  amount: bigint,
): bigint {
  if (amount <= 0n) return 0n;
  const a = (amount * percent) / 1_000_000n;
  const b = BigInt(100_000_000);
  return (a * 1_000_000n) / b;
}

export function loadSystemParamsFromFile(file: string): SystemParams {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as SystemParams;
}

export function loadSystemParamsFromUrl(url: string): Promise<SystemParams> {
  return fetch(url)
    .then((res: Response) => res.json())
    .then((data: unknown) => data as SystemParams);
}

export const getRandomElement = <T>(arr: T[]) =>
  arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
