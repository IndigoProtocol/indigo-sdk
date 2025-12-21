import { array as A, ord as Ord } from 'fp-ts';

export function shuffle<T>(arr: T[]): T[] {
  const source = [...arr];
  for (let i = source.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }

  return source;
}

/**
 * The parameter `arr` should be sorted for correct results.
 */
export function insertSorted<T>(arr: T[], item: T, ord: Ord.Ord<T>): T[] {
  const arrOrd = ord.compare(arr[0], arr[arr.length - 1]);
  // Array containing the same items
  if (arrOrd === 0) {
    if (ord.compare(arr[0], item) === -1) {
      return [...arr, item];
    } else {
      return [item, ...arr];
    }
  }

  // TODO: could be improved with binary search
  for (let i = 0; i < arr.length; i++) {
    if (ord.compare(arr[i], item) !== arrOrd) {
      return [...A.takeLeft(i)(arr), item, ...A.takeRight(arr.length - i)(arr)];
    }
  }

  return [...arr, item];
}
