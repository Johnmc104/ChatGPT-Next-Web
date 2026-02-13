// Mock for nanoid (ESM-only package) to work with Jest's CJS transform
let counter = 0;
export function nanoid(size = 21): string {
  counter++;
  return `mock-nanoid-${counter}-${Math.random().toString(36).slice(2, 2 + size)}`;
}
