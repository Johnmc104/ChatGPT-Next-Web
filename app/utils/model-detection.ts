/**
 * Client-side model detection helpers.
 *
 * Extracted from app/utils.ts (R-02a) to keep the root utility file focused.
 * These functions rely on the client-side model-info cache and are NOT
 * suitable for server-side use — see utils/model.ts for server helpers.
 */

import {
  REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS_FOR_THINKING,
  ServiceProvider,
  VISION_MODEL_REGEXES,
  EXCLUDE_VISION_MODEL_REGEXES,
} from "@/app/constant";
import { useAccessStore } from "@/app/store";
import { ModelSize } from "@/app/typing";
import { ModelCapability } from "@/app/api/model-info/types";
import { hasCapability } from "@/app/hooks/useModelInfo";

export function isDalle3(model: string): boolean {
  return "dall-e-3" === model;
}

/**
 * Check if a model is a GPT Image family model (gpt-image-1, gpt-image-2, etc.)
 */
export function isGptImageModel(model: string): boolean {
  return model.toLowerCase().includes("gpt-image");
}

/**
 * Check if a model is a CogView family model.
 */
export function isCogViewModel(model: string): boolean {
  return model.toLowerCase().includes("cogview");
}

/**
 * Check if a model is GPT-5 family.
 * GPT-5 uses max_completion_tokens instead of max_tokens.
 */
export function isGpt5Model(model: string): boolean {
  return model.toLowerCase().startsWith("gpt-5");
}

/**
 * String-based heuristic for image generation models.
 * Used as fallback when model-info cache is not yet loaded.
 */
function isImageModelByName(model: string): boolean {
  return (
    isGptImageModel(model) ||
    isDalle3(model) ||
    isCogViewModel(model) ||
    model.toLowerCase().includes("dall-e") ||
    model.toLowerCase().includes("dalle") ||
    model.toLowerCase().includes("image-2") ||
    model.toLowerCase().includes("-image-preview")
  );
}

/**
 * Check if a model is an image generation model.
 * Uses capability metadata from the model-info cache when available,
 * falling back to string heuristics. This ensures correct routing
 * regardless of provider-specific model naming conventions.
 */
export function isImageModel(model: string): boolean {
  // Primary: capability-based check (provider-agnostic)
  if (hasCapability(model, ModelCapability.ImageOutput)) {
    return true;
  }
  // Fallback: string heuristic (works before model-info is loaded)
  return isImageModelByName(model);
}

/**
 * Check if a model supports vision (image input).
 * Uses capability metadata when available, with regex fallback.
 */
export function isVisionModel(model: string) {
  // Primary: capability-based check
  if (hasCapability(model, ModelCapability.ImageInput)) {
    return true;
  }
  // Env-based override
  const visionModels = useAccessStore.getState().visionModels;
  const envVisionModels = visionModels?.split(",").map((m) => m.trim());
  if (envVisionModels?.includes(model)) {
    return true;
  }
  // Fallback: regex heuristic
  return (
    !EXCLUDE_VISION_MODEL_REGEXES.some((regex) => regex.test(model)) &&
    VISION_MODEL_REGEXES.some((regex) => regex.test(model))
  );
}

/**
 * Check if a model supports extended thinking / reasoning.
 */
export function isReasoningModel(model: string): boolean {
  if (hasCapability(model, ModelCapability.Reasoning)) {
    return true;
  }
  // Fallback: string heuristic
  model = model.toLowerCase();
  return (
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.includes("deepseek-r") ||
    model.includes("-thinking")
  );
}

export function getTimeoutMSByModel(model: string) {
  if (isImageModel(model) || isReasoningModel(model))
    return REQUEST_TIMEOUT_MS_FOR_THINKING;
  return REQUEST_TIMEOUT_MS;
}

export function getModelSizes(model: string): ModelSize[] {
  if (isDalle3(model)) {
    return ["1024x1024", "1792x1024", "1024x1792"];
  }
  if (isGptImageModel(model)) {
    return [
      "auto",
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "2048x2048",
      "2048x1152",
      "1152x2048",
      "3840x2160",
      "2160x3840",
    ];
  }
  if (isCogViewModel(model)) {
    return ["1024x1024", "1024x1536", "1536x1024"];
  }
  return [];
}

export function supportsCustomSize(model: string): boolean {
  return getModelSizes(model).length > 0;
}

export function showPlugins(provider: ServiceProvider, model: string) {
  if (provider == ServiceProvider.OpenAI || provider == ServiceProvider.Azure) {
    return true;
  }
  return false;
}
