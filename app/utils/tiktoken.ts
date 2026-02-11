/**
 * Accurate token counting using js-tiktoken (BPE tokenizer).
 *
 * Uses the `o200k_base` encoding (GPT-4o family) as a universal approximation.
 * The encoding data (~2MB) is lazy-loaded from CDN on first use to avoid
 * bloating the main bundle. Falls back to the heuristic `estimateTokenLength`
 * while loading or if loading fails.
 */

import { Tiktoken } from "js-tiktoken/lite";
import { estimateTokenLength } from "./token";

// ── singleton encoder (lazy via dynamic import) ─────────────────────────────
let encoder: Tiktoken | null = null;
let loadingPromise: Promise<void> | null = null;
let loadFailed = false;

/**
 * Start loading the BPE ranks in the background.
 * The ~2MB o200k_base data is loaded via dynamic import (code-split by
 * bundler) so it doesn't bloat the initial JS bundle.
 * Safe to call multiple times – only one import will be triggered.
 */
export function preloadEncoder(): void {
  if (encoder || loadingPromise || loadFailed) return;
  loadingPromise = loadEncoderInternal();
}

async function loadEncoderInternal(): Promise<void> {
  try {
    const { default: o200k_base } = await import(
      "js-tiktoken/ranks/o200k_base"
    );
    encoder = new Tiktoken(o200k_base);
    console.log("[tiktoken] o200k_base encoder loaded successfully");
  } catch (err) {
    console.warn("[tiktoken] Failed to load o200k_base, using heuristic:", err);
    loadFailed = true;
  } finally {
    loadingPromise = null;
  }
}

/**
 * Returns true once the BPE encoder is ready.
 */
export function isEncoderReady(): boolean {
  return encoder !== null;
}

/**
 * Count tokens for a string.
 * - If the BPE encoder is loaded → accurate count via tiktoken
 * - Otherwise → heuristic fallback via estimateTokenLength
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  if (encoder) {
    try {
      return encoder.encode(text).length;
    } catch {
      // Encoding can theoretically fail on very unusual input
      return Math.ceil(estimateTokenLength(text));
    }
  }
  return Math.ceil(estimateTokenLength(text));
}

/**
 * Count tokens for a chat message (role + content).
 * Each message has ~4 overhead tokens (role markers, separators).
 */
export function countMessageTokens(role: string, content: string): number {
  const MESSAGE_OVERHEAD = 4; // <|im_start|>role\n ... <|im_end|>\n
  return countTokens(role) + countTokens(content) + MESSAGE_OVERHEAD;
}

/**
 * Count total tokens for an array of messages.
 * Adds 3 tokens for the priming overhead (every conversation has this).
 */
export function countMessagesTokens(
  messages: { role: string; content: string }[],
): number {
  const PRIMING_TOKENS = 3;
  let total = PRIMING_TOKENS;
  for (const msg of messages) {
    total += countMessageTokens(msg.role, msg.content);
  }
  return total;
}

/**
 * Format a token count for display, e.g. 1234 → "1.2K", 567890 → "568K".
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return (count / 1000).toFixed(1) + "K";
  if (count < 1_000_000) return Math.round(count / 1000) + "K";
  return (count / 1_000_000).toFixed(1) + "M";
}
