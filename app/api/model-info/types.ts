/**
 * Model metadata fetched from OpenRouter API
 * Used for token usage display and cost estimation
 */
export interface ModelInfo {
  id: string; // e.g. "anthropic/claude-opus-4.6"
  name: string; // display name e.g. "Anthropic: Claude Opus 4.6"
  context_length: number; // total context window size in tokens
  max_output: number | null; // max completion tokens, null if unlimited
  pricing: {
    input: number; // cost per token (raw from API)
    output: number; // cost per token (raw from API)
    cache_read: number | null; // cost per cached input token
  };
}

/**
 * The full response shape from /api/model-info
 */
export interface ModelInfoResponse {
  models: Record<string, ModelInfo>; // keyed by model id
  updated_at: string; // ISO timestamp of last fetch
}

/**
 * Shape of a single model from OpenRouter /api/v1/models
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
}
