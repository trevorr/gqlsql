export function arrayEqual<T>(a: T[], b: T[], compare = (a: T, b: T): boolean => a === b): boolean {
  return a.length === b.length && a.every((v, i) => compare(v, b[i]));
}

export function optionalArrayEqual<T>(
  a: T[] | null | undefined,
  b: T[] | null | undefined,
  compare?: (a: T, b: T) => boolean
): boolean {
  return a && b ? arrayEqual(a, b, compare) : (!a || a.length === 0) && (!b || b.length === 0);
}

// find the first value that maps to a truthy value and return that mapped value, else undefined if none
export function findMap<S, T>(a: Iterable<T>, f: (v: T) => S | false | null | undefined): S | undefined {
  for (const v of a) {
    const x = f(v);
    if (x) return x;
  }
}

export function notNull<T>(value: T | null | undefined): value is T {
  return value != null;
}
