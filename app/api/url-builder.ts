/**
 * Shared URL construction utilities for API proxy requests.
 *
 * Extracts the duplicated "smart URL construction" logic that was previously
 * copy-pasted across proxy.ts, common.ts, and provider.ts.
 */

import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";

/**
 * Well-known API endpoint paths.
 * When BASE_URL already ends with one of these, we avoid duplicating it
 * in the final fetch URL.
 */
export const API_ENDPOINTS = [
  "/v1/chat/completions",
  "/v1/completions",
  "/v1/embeddings",
  "/v1/images/generations",
  "/v1/audio/speech",
  "/v1/audio/transcriptions",
  "/v1/models",
  "/chat/completions",
] as const;

export interface BuildFetchUrlOptions {
  /** The upstream base URL (may already contain an endpoint path). */
  baseUrl: string;
  /** The request sub-path (e.g. "/v1/chat/completions"). */
  requestPath: string;
  /** Optional query string to append. */
  queryString?: string;
  /** Whether to wrap the result with cloudflareAIGatewayUrl (default: false). */
  useCloudflareGateway?: boolean;
}

/**
 * Normalize a base URL: ensure https prefix, strip trailing slash.
 */
export function normalizeBaseUrl(url: string): string {
  let normalized = url;
  if (!normalized.startsWith("http")) {
    normalized = `https://${normalized}`;
  }
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Detect if the base URL already ends with a known API endpoint path.
 * Returns the matched endpoint or empty string.
 */
export function detectBaseUrlEndpoint(baseUrl: string): string {
  const lower = baseUrl.toLowerCase();
  for (const endpoint of API_ENDPOINTS) {
    if (lower.endsWith(endpoint)) {
      return endpoint;
    }
  }
  return "";
}

/**
 * Build the final fetch URL, intelligently handling cases where BASE_URL
 * already contains an API endpoint path (e.g. OpenRouter URLs).
 *
 * Rules:
 * 1. If BASE_URL ends with an endpoint and request matches it → use BASE_URL directly
 * 2. If BASE_URL ends with an endpoint but request differs → replace endpoint part
 * 3. If BASE_URL has no endpoint → simply append the request path
 */
export function buildFetchUrl(options: BuildFetchUrlOptions): string {
  const { requestPath, queryString, useCloudflareGateway = false } = options;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const baseUrlEndpoint = detectBaseUrlEndpoint(baseUrl);

  // Ensure requestPath starts with "/"
  const normalizedPath = requestPath.startsWith("/")
    ? requestPath
    : `/${requestPath}`;

  let fetchUrl: string;

  if (baseUrlEndpoint) {
    const baseUrlWithoutEndpoint = baseUrl.slice(0, -baseUrlEndpoint.length);
    if (normalizedPath.toLowerCase() === baseUrlEndpoint) {
      // Request matches the endpoint already in BASE_URL
      fetchUrl = baseUrl;
    } else {
      // Request is for a different endpoint, replace the endpoint part
      fetchUrl = `${baseUrlWithoutEndpoint}${normalizedPath}`;
    }
  } else {
    fetchUrl = `${baseUrl}${normalizedPath}`;
  }

  if (queryString) {
    fetchUrl += `?${queryString}`;
  }

  if (useCloudflareGateway) {
    fetchUrl = cloudflareAIGatewayUrl(fetchUrl);
  }

  return fetchUrl;
}

/**
 * Default timeout for upstream API calls: 10 minutes.
 */
export const DEFAULT_API_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Create an AbortController with the default API timeout.
 * Returns both the controller and a cleanup function.
 */
export function createTimeoutController(timeoutMs = DEFAULT_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Standard headers to skip when forwarding a client request upstream.
 */
export const SKIP_HEADERS = new Set([
  "connection",
  "host",
  "origin",
  "referer",
  "cookie",
]);

/**
 * Build clean upstream headers from a client request,
 * stripping internal/browser-only headers.
 */
export function buildUpstreamHeaders(req: Request): Headers {
  return new Headers(
    Array.from(new Headers(req.headers).entries()).filter(([key]) => {
      if (key.startsWith("x-") || key.startsWith("sec-")) return false;
      return !SKIP_HEADERS.has(key);
    }),
  );
}

/**
 * Clean response headers for returning to the client.
 * Removes www-authenticate (prevents browser credential prompts),
 * sets X-Accel-Buffering: no (disables nginx buffering for SSE),
 * and removes content-encoding (prevents brotli/gzip mismatch on Vercel).
 */
export function cleanResponseHeaders(resHeaders: Headers): Headers {
  const newHeaders = new Headers(resHeaders);
  newHeaders.delete("www-authenticate");
  newHeaders.set("X-Accel-Buffering", "no");
  newHeaders.delete("content-encoding");
  return newHeaders;
}
