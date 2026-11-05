import { ModelCapability } from "./types";
import type { ModelInfo } from "@/app/api/model-info/types";
import type { ModelCapabilityProfile } from "./types";

const DEFAULT_MAX_INPUT_IMAGES = 3;

/** Resolve a stable routing profile from provider metadata. */
export function resolveModelCapabilities(
  _modelId: string,
  modelInfo?: ModelInfo,
): ModelCapabilityProfile {
  const capabilities = new Set(modelInfo?.capabilities ?? []);
  const imageInput = capabilities.has(ModelCapability.ImageInput);
  const imageOutput = capabilities.has(ModelCapability.ImageOutput);

  return {
    textInput: capabilities.has(ModelCapability.TextInput) || !modelInfo,
    imageInput,
    imageOutput,
    imageEdit: imageOutput && imageInput,
    streaming: !imageOutput,
    tools: capabilities.has(ModelCapability.ToolUse),
    maxInputImages: imageInput ? DEFAULT_MAX_INPUT_IMAGES : undefined,
    acceptedImageTypes: imageInput
      ? ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]
      : undefined,
  };
}

/** Return the configured or default image input limit for a model. */
export function resolveMaxInputImages(
  modelId: string,
  modelInfo?: ModelInfo,
): number {
  return (
    resolveModelCapabilities(modelId, modelInfo).maxInputImages ??
    (modelInfo ? 0 : DEFAULT_MAX_INPUT_IMAGES)
  );
}
