import { expect, test } from 'vitest';
import { insertSorted, shuffle } from '../src/utils/array-utils';
import { BigIntOrd } from '../src/utils/bigint-utils';
import { ord as Ord, number as Num, array as A } from 'fp-ts';

test('Shuffle', () => {
  const arr = [1, 2, 34, 45, -1, 20, 35];
  const shuffled = shuffle(arr);

  expect(shuffled.length).toBe(arr.length);
  expect(A.sort(Num.Ord)(shuffled)).toEqual(A.sort(Num.Ord)(arr));
});

test('insert sorted 1', () => {
  const arr = [0n, 2n, 3n];
  expect(insertSorted(arr, 1n, BigIntOrd)).toEqual([0n, 1n, 2n, 3n]);
});
test('insert sorted 2', () => {
  const arr = [0n, 2n, 4n];
  expect(insertSorted(arr, 3n, BigIntOrd)).toEqual([0n, 2n, 3n, 4n]);
});
test('insert sorted at start', () => {
  const arr = [0n, 2n, 3n];
  expect(insertSorted(arr, -1n, BigIntOrd)).toEqual([-1n, 0n, 2n, 3n]);
});
test('insert sorted at end', () => {
  const arr = [0n, 2n, 3n];
  expect(insertSorted(arr, 5n, BigIntOrd)).toEqual([0n, 2n, 3n, 5n]);
});
test('insert sorted at start when array all equal', () => {
  const arr = [0n, 0n, 0n];
  expect(insertSorted(arr, -1n, BigIntOrd)).toEqual([-1n, 0n, 0n, 0n]);
});
test('insert sorted at end when array all equal', () => {
  const arr = [0n, 0n, 0n];
  expect(insertSorted(arr, 1n, BigIntOrd)).toEqual([0n, 0n, 0n, 1n]);
});

test('insert sorted reversed 1', () => {
  const arr = [3n, 2n, 0n];
  expect(insertSorted(arr, 1n, Ord.reverse(BigIntOrd))).toEqual([
    3n,
    2n,
    1n,
    0n,
  ]);
});
test('insert sorted reversed 2', () => {
  const arr = [4n, 2n, 0n];
  expect(insertSorted(arr, 3n, Ord.reverse(BigIntOrd))).toEqual([
    4n,
    3n,
    2n,
    0n,
  ]);
});
test('insert sorted eversed at start', () => {
  const arr = [3n, 2n, 0n];
  expect(insertSorted(arr, 4n, Ord.reverse(BigIntOrd))).toEqual([
    4n,
    3n,
    2n,
    0n,
  ]);
});
test('insert sorted reversed at end', () => {
  const arr = [3n, 2n, 0n];
  expect(insertSorted(arr, -1n, Ord.reverse(BigIntOrd))).toEqual([
    3n,
    2n,
    0n,
    -1n,
  ]);
});
test('insert sorted reversed at end when array all equal', () => {
  const arr = [0n, 0n, 0n];
  expect(insertSorted(arr, -1n, Ord.reverse(BigIntOrd))).toEqual([
    0n,
    0n,
    0n,
    -1n,
  ]);
});
test('insert sorted reversed at start when array all equal', () => {
  const arr = [0n, 0n, 0n];
  expect(insertSorted(arr, 1n, Ord.reverse(BigIntOrd))).toEqual([
    1n,
    0n,
    0n,
    0n,
  ]);
});
