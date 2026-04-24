import type { ModelInfo, OpenRouterModel } from "./types";
import { ModelCapability } from "./types";
import { logger } from "@/app/utils/logger";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// In-memory cache (persists across requests in Node.js standalone mode)
let modelInfoCache: Record<string, ModelInfo> = {};
let lastUpdated: string | null = null;
let fetchPromise: Promise<void> | null = null;

/**
 * Derive capabilities from OpenRouter model metadata.
 * Maps architecture modalities + supported_parameters → ModelCapability[].
 */
function deriveCapabilities(m: OpenRouterModel): ModelCapability[] {
  const caps: ModelCapability[] = [];
  const arch = m.architecture ?? {};
  const inputMods = arch.input_modalities ?? [];
  const outputMods = arch.output_modalities ?? [];
  const params = m.supported_parameters ?? [];

  // Input modalities
  if (inputMods.includes("text")) caps.push(ModelCapability.TextInput);
  if (inputMods.includes("image")) caps.push(ModelCapability.ImageInput);
  if (inputMods.includes("audio")) caps.push(ModelCapability.AudioInput);
  if (inputMods.includes("video")) caps.push(ModelCapability.VideoInput);
  if (inputMods.includes("file")) caps.push(ModelCapability.FileInput);

  // Output modalities
  if (outputMods.includes("text")) caps.push(ModelCapability.TextOutput);
  if (outputMods.includes("image")) caps.push(ModelCapability.ImageOutput);
  if (outputMods.includes("audio")) caps.push(ModelCapability.AudioOutput);

  // Supported parameters
  if (params.includes("reasoning") || params.includes("include_reasoning")) {
    caps.push(ModelCapability.Reasoning);
  }
  if (params.includes("tools") || params.includes("tool_choice")) {
    caps.push(ModelCapability.ToolUse);
  }

  // Web search: indicated by pricing or supported params
  if (m.pricing?.web_search || params.includes("web_search_options")) {
    caps.push(ModelCapability.WebSearch);
  }

  return caps;
}

/**
 * Parse a single OpenRouter model object into our ModelInfo shape
 */
function parseModel(m: OpenRouterModel): ModelInfo {
  const pricing = m.pricing ?? {};
  const tp = m.top_provider ?? {};

  const parsePrice = (v?: string): number | null =>
    v != null ? parseFloat(v) || null : null;

  return {
    id: m.id,
    name: m.name,
    context_length: m.context_length ?? 0,
    max_output: tp.max_completion_tokens ?? null,
    capabilities: deriveCapabilities(m),
    pricing: {
      input: parseFloat(pricing.prompt ?? "0"),
      output: parseFloat(pricing.completion ?? "0"),
      cache_read: parsePrice(pricing.input_cache_read),
      cache_write: parsePrice(pricing.input_cache_write),
      image: parsePrice(pricing.image),
      audio: parsePrice(pricing.audio),
      web_search: parsePrice(pricing.web_search),
      reasoning: parsePrice(pricing.internal_reasoning),
    },
  };
}

/**
 * Fetch all models from OpenRouter and update the cache.
 * Returns the number of models fetched.
 */
export async function refreshModelInfo(): Promise<number> {
  logger.info("[Model Info] Fetching models from OpenRouter...");

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

  logger.info(
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
        logger.error("[Model Info] Failed to fetch:", err);
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
