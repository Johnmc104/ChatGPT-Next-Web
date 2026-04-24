/**
 * Lightweight fetch utilities for store-level data fetching.
 *
 * Provides consistent timeout, status checking, and error handling
 * that was previously missing/inconsistent across 5 store files.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch JSON with timeout and status checking.
 * @throws {Error} on timeout, non-OK status, or JSON parse failure
 */
export async function fetchJSON<T = any>(
  url: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options ?? {};
  const controller = new AbortController();
  if (init.signal) {
    // Forward external abort to our controller
    init.signal.addEventListener("abort", () => controller.abort());
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch text with timeout and status checking.
 */
export async function fetchText(
  url: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<string> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options ?? {};
  const controller = new AbortController();
  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort());
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
