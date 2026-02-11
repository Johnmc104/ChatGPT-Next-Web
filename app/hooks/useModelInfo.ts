import { useState, useEffect, useCallback } from "react";
import type { ModelInfo, ModelInfoResponse } from "../api/model-info/types";

const MODEL_INFO_API = "/api/model-info";

// Client-side cache (shared across all hook instances)
let clientCache: Record<string, ModelInfo> | null = null;
let clientCacheTime: number = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Hook to access model metadata from the backend cache.
 *
 * Usage:
 *   const { getModelInfo, isLoading } = useModelInfo();
 *   const info = getModelInfo("anthropic/claude-opus-4.6");
 *   // info?.context_length => 1000000
 */
export function useModelInfo() {
  const [models, setModels] = useState<Record<string, ModelInfo>>(
    clientCache ?? {},
  );
  const [isLoading, setIsLoading] = useState(!clientCache);

  useEffect(() => {
    // If cache is fresh, skip fetch
    if (clientCache && Date.now() - clientCacheTime < CACHE_TTL) {
      setModels(clientCache);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchModelInfo() {
      try {
        const res = await fetch(MODEL_INFO_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: ModelInfoResponse = await res.json();
        if (data.models && !cancelled) {
          clientCache = data.models;
          clientCacheTime = Date.now();
          setModels(data.models);
        }
      } catch (err) {
        console.error("[useModelInfo] Failed to fetch:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchModelInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  const getModelInfo = useCallback(
    (modelId: string): ModelInfo | undefined => {
      return models[modelId];
    },
    [models],
  );

  return { models, getModelInfo, isLoading };
}

/**
 * Default context window sizes by provider prefix.
 * Used as fallback when model info is not yet loaded or unknown.
 */
const DEFAULT_CONTEXT_BY_PREFIX: Record<string, number> = {
  "anthropic/": 200_000,
  "openai/": 128_000,
  "google/": 1_048_576,
  "x-ai/": 131_072,
  "deepseek/": 163_840,
  "moonshotai/": 131_072,
  "qwen/": 131_072,
  "z-ai/": 131_072,
  "minimax/": 200_000,
  "meta-llama/": 131_072,
  "mistral/": 131_072,
};

const DEFAULT_CONTEXT_LENGTH = 32_000;

/**
 * Get context length for a model, with fallback logic.
 */
export function getContextLength(
  modelId: string,
  modelInfo?: ModelInfo,
): number {
  if (modelInfo?.context_length) return modelInfo.context_length;

  // Fallback: match by prefix
  for (const [prefix, len] of Object.entries(DEFAULT_CONTEXT_BY_PREFIX)) {
    if (modelId.startsWith(prefix)) return len;
  }

  return DEFAULT_CONTEXT_LENGTH;
}
