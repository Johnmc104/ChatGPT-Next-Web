/**
 * Model capability flags derived from upstream provider metadata.
 * These are inferred from OpenRouter's architecture.input_modalities,
 * architecture.output_modalities, and supported_parameters fields.
 */
export { ModelCapability } from "@/app/domain/model/types";
import type { ModelCapability } from "@/app/domain/model/types";

/**
 * Model metadata fetched from OpenRouter API
 * Used for token usage display, cost estimation, and capability routing
 */
export interface ModelInfo {
  id: string; // e.g. "anthropic/claude-opus-4.6"
  name: string; // display name e.g. "Anthropic: Claude Opus 4.6"
  context_length: number; // total context window size in tokens
  max_output: number | null; // max completion tokens, null if unlimited
  max_input_images?: number;
  max_image_bytes?: number;
  capabilities: ModelCapability[]; // what the model can do
  pricing: {
    input: number; // cost per token (raw from API)
    output: number; // cost per token (raw from API)
    cache_read: number | null; // cost per cached input token
    cache_write: number | null; // cost per cached write token
    image: number | null; // cost per image token
    audio: number | null; // cost per audio token
    web_search: number | null; // cost per web search
    reasoning: number | null; // cost per reasoning token
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
  architecture?: {
    modality?: string; // e.g. "text+image->text+image"
    input_modalities?: string[]; // e.g. ["text", "image"]
    output_modalities?: string[]; // e.g. ["text", "image"]
    tokenizer?: string;
    instruct_type?: string | null;
  };
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
    audio?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  supported_parameters?: string[];
}
