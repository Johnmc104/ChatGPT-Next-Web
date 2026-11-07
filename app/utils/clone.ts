export function ensure<T extends object>(
  obj: T,
  keys: Array<[keyof T][number]>,
) {
  return keys.every(
    (k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== "",
  );
}
