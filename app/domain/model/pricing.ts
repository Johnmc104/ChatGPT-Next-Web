import type { ModelInfo } from "@/app/api/model-info/types";

/**
 * Format a per-token USD rate (as returned by the model-info API) into a
 * human-readable "per 1M tokens" price string.
 */
function perMillion(rate: number): string {
  const value = rate * 1_000_000;
  const digits = value > 0 && value < 1 ? 3 : 2;
  return `$${value.toFixed(digits)}`;
}

/**
 * Build a short input/output pricing label for a model, or undefined when no
 * pricing metadata is available.
 */
export function formatModelPricing(info?: ModelInfo): string | undefined {
  const pricing = info?.pricing;
  if (!pricing) return undefined;
  const input = Number(pricing.input);
  const output = Number(pricing.output);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return undefined;
  if (input <= 0 && output <= 0) return undefined;
  return `${perMillion(input)} / ${perMillion(output)}`;
}
