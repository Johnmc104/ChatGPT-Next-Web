import type { ModelInfo, OpenRouterModel } from "./types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// In-memory cache (persists across requests in Node.js standalone mode)
let modelInfoCache: Record<string, ModelInfo> = {};
let lastUpdated: string | null = null;
let fetchPromise: Promise<void> | null = null;

/**
 * Parse a single OpenRouter model object into our ModelInfo shape
 */
function parseModel(m: OpenRouterModel): ModelInfo {
  const pricing = m.pricing ?? {};
  const tp = m.top_provider ?? {};

  return {
    id: m.id,
    name: m.name,
    context_length: m.context_length ?? 0,
    max_output: tp.max_completion_tokens ?? null,
    pricing: {
      input: parseFloat(pricing.prompt ?? "0"),
      output: parseFloat(pricing.completion ?? "0"),
      cache_read: pricing.input_cache_read
        ? parseFloat(pricing.input_cache_read)
        : null,
    },
  };
}

/**
 * Fetch all models from OpenRouter and update the cache.
 * Returns the number of models fetched.
 */
export async function refreshModelInfo(): Promise<number> {
  console.log("[Model Info] Fetching models from OpenRouter...");

  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
    // 30s timeout via AbortController
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(
      `[Model Info] OpenRouter returned ${res.status}: ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { data: OpenRouterModel[] };
  const models = json.data;

  if (!Array.isArray(models) || models.length === 0) {
    throw new Error("[Model Info] OpenRouter returned empty model list");
  }

  const newCache: Record<string, ModelInfo> = {};
  for (const m of models) {
    if (m.id) {
      newCache[m.id] = parseModel(m);
    }
  }

  modelInfoCache = newCache;
  lastUpdated = new Date().toISOString();

  console.log(
    `[Model Info] Cached ${
      Object.keys(newCache).length
    } models at ${lastUpdated}`,
  );

  return Object.keys(newCache).length;
}

/**
 * Ensure the cache is populated. Deduplicates concurrent calls.
 */
export async function ensureModelInfo(): Promise<void> {
  if (lastUpdated) return; // already populated

  if (!fetchPromise) {
    fetchPromise = refreshModelInfo()
      .then(() => {})
      .catch((err) => {
        console.error("[Model Info] Failed to fetch:", err);
        lastUpdated = null; // allow retry
      })
      .finally(() => {
        fetchPromise = null;
      });
  }

  await fetchPromise;
}

/**
 * Get the current cached model info
 */
export function getModelInfoCache(): {
  models: Record<string, ModelInfo>;
  updated_at: string | null;
} {
  return {
    models: modelInfoCache,
    updated_at: lastUpdated,
  };
}
