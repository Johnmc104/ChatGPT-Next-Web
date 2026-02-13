/**
 * Unified logger utility for NextChat.
 *
 * In development it behaves like `console.*`; in production it suppresses
 * debug-level messages and **never** prints raw API keys or access codes.
 *
 * Usage:
 *   import { logger } from "@/app/utils/logger";
 *   logger.info("[Auth]", "user authenticated");
 *   logger.debug("[Proxy]", "fetchUrl:", url);
 *   logger.warn("[Config]", "missing key");
 *   logger.error("[API]", error);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isDev =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

/** Minimum level that will actually be printed. */
const MIN_LEVEL: LogLevel = isDev ? "debug" : "info";

/**
 * Patterns that look like secrets – we mask them in log output.
 * Matches common API key prefixes and long hex/base64 strings.
 */
const SECRET_PATTERNS = [
  // OpenAI-style keys
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Generic long tokens (40+ hex chars) – likely API keys
  /\b[A-Fa-f0-9]{40,}\b/g,
  // Bearer tokens (mask the token portion)
  /Bearer\s+[^\s]{10,}/gi,
];

function maskSecrets(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let masked = value;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexps
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, (match) => {
      if (match.length <= 12) return match; // too short to be a real key
      return match.slice(0, 8) + "***" + match.slice(-4);
    });
  }
  return masked;
}

function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) return arg;
    return maskSecrets(
      typeof arg === "object" ? JSON.stringify(arg) : String(arg),
    );
  });
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

export const logger = {
  debug(...args: unknown[]) {
    if (!shouldLog("debug")) return;
    console.debug(...formatArgs(args));
  },

  info(...args: unknown[]) {
    if (!shouldLog("info")) return;
    console.info(...formatArgs(args));
  },

  warn(...args: unknown[]) {
    if (!shouldLog("warn")) return;
    console.warn(...formatArgs(args));
  },

  error(...args: unknown[]) {
    if (!shouldLog("error")) return;
    console.error(...formatArgs(args));
  },

  /** Convenience: log key length without revealing the key itself */
  keyInfo(prefix: string, key?: string | null) {
    if (!key) {
      this.info(prefix, "key not set");
      return;
    }
    this.info(
      prefix,
      `key length: ${key.length}, prefix: ${key.slice(0, 6)}***`,
    );
  },
};

export default logger;
