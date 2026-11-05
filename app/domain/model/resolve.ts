import { ModelCapability } from "./types";
import type { ModelInfo } from "@/app/api/model-info/types";
import type { ModelCapabilityProfile } from "./types";

import { validImageLimit, type ModelCapabilityOverride } from "./overrides";

const DEFAULT_MAX_INPUT_IMAGES = 3;

/** Resolve a stable routing profile from provider metadata. */
export function resolveModelCapabilities(
  _modelId: string,
  modelInfo?: ModelInfo,
  override?: ModelCapabilityOverride,
): ModelCapabilityProfile {
  const capabilities = new Set(modelInfo?.capabilities ?? []);
  const imageInput =
    override?.imageInput ?? capabilities.has(ModelCapability.ImageInput);
  const imageOutput =
    override?.imageOutput ?? capabilities.has(ModelCapability.ImageOutput);
  const configuredLimit = override?.maxInputImages;
  const metadataLimit = modelInfo?.max_input_images;
  const limit =
    configuredLimit !== undefined && validImageLimit(configuredLimit)
      ? configuredLimit
      : metadataLimit !== undefined && validImageLimit(metadataLimit)
      ? metadataLimit
      : DEFAULT_MAX_INPUT_IMAGES;

  return {
    textInput: capabilities.has(ModelCapability.TextInput) || !modelInfo,
    imageInput,
    imageOutput,
    imageEdit: imageOutput && imageInput,
    streaming: !imageOutput,
    tools: override?.tools ?? capabilities.has(ModelCapability.ToolUse),
    maxInputImages: imageInput ? limit : 0,
    maxImageBytes:
      override?.maxImageBytes ?? modelInfo?.max_image_bytes ?? 20 * 1024 * 1024,
    acceptedImageTypes: imageInput
      ? ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]
      : undefined,
  };
}

/** Return the configured or default image input limit for a model. */
export function resolveMaxInputImages(
  modelId: string,
  modelInfo?: ModelInfo,
  override?: ModelCapabilityOverride,
): number {
  if (!modelInfo && override?.imageInput === undefined)
    return DEFAULT_MAX_INPUT_IMAGES;
  return (
    resolveModelCapabilities(modelId, modelInfo, override).maxInputImages ?? 0
  );
}
