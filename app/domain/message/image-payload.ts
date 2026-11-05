import type { LLMConfig } from "../../client/api";
import type { ModelSize, ImageQuality, DalleStyle } from "../../typing";

export interface ImageGenerationPayload {
  model: string;
  prompt: string;
  response_format?: "url" | "b64_json";
  output_format?: "png" | "jpeg" | "webp";
  output_compression?: number;
  n: number;
  size: ModelSize;
  quality?: ImageQuality;
  style?: DalleStyle;
  partial_images?: number;
}

export type ImagePayloadConfig = Pick<
  LLMConfig,
  "model" | "size" | "quality" | "style" | "outputFormat"
>;

export function buildImageGenerationPayload(
  config: ImagePayloadConfig,
  prompt: string,
  flags: { isDalle3: boolean; isGptImageModel: boolean; isImageEdit: boolean },
): ImageGenerationPayload {
  return {
    model: config.model,
    prompt,
    n: 1,
    size: config?.size ?? "1024x1024",
    // GPT Image models use output_format (png/jpeg/webp); DALL-E uses response_format.
    ...(flags.isGptImageModel
      ? {
          output_format: config?.outputFormat ?? "png",
          ...((config?.outputFormat === "jpeg" ||
            config?.outputFormat === "webp") && {
            output_compression: 100,
          }),
        }
      : flags.isDalle3
      ? { response_format: "b64_json" as const }
      : { response_format: "b64_json" as const }),
    // Quality & style mapping per model family
    ...(flags.isDalle3
      ? {
          quality: config?.quality ?? "standard",
          style: config?.style ?? "vivid",
        }
      : flags.isGptImageModel
      ? {
          quality: (["low", "medium", "high", "auto"] as string[]).includes(
            config?.quality ?? "",
          )
            ? config!.quality
            : config?.quality === "hd"
            ? "high"
            : "auto",
        }
      : {}),
    // partial_images for progressive preview (GPT Image only, not edits)
    ...(flags.isGptImageModel && !flags.isImageEdit
      ? { partial_images: 2 }
      : {}),
  };
}
