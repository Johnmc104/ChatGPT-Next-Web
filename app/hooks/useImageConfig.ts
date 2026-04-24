/**
 * useImageConfig — derives image-model config options from the current model.
 *
 * Extracted from ChatActions to centralise conditional option logic
 * and avoid recomputing on every render of the action bar.
 */

import { useMemo } from "react";
import {
  isDalle3,
  isImageModel,
  getModelSizes,
  supportsCustomSize,
} from "../utils";
import type {
  DalleStyle,
  ImageOutputFormat,
  ImageQuality,
  ModelSize,
} from "../typing";

export interface ImageConfigOptions {
  /** Whether the current model supports image-config UI */
  showConfig: boolean;
  /** Available size presets for this model */
  modelSizes: ModelSize[];
  /** Whether the model is an image-generation model */
  isImageGen: boolean;
  /** Whether the model is specifically DALL-E 3 */
  isDalle3: boolean;
  /** Whether the model is a gpt-image variant */
  isGptImage: boolean;
  /** Quality choices for this model family */
  qualityOptions: ImageQuality[];
  /** Output format choices (gpt-image only) */
  formatOptions: ImageOutputFormat[];
  /** Style choices (DALL-E 3 only) */
  styleOptions: DalleStyle[];
}

export function useImageConfig(model: string): ImageConfigOptions {
  return useMemo(() => {
    const sizes = getModelSizes(model);
    const imageGen = isImageModel(model);
    const dalle3 = isDalle3(model);
    const gptImage = model.toLowerCase().includes("gpt-image");

    const qualityOptions: ImageQuality[] = gptImage
      ? ["low", "medium", "high", "auto"]
      : ["standard", "hd"];

    const formatOptions: ImageOutputFormat[] = ["png", "jpeg", "webp"];
    const styleOptions: DalleStyle[] = ["vivid", "natural"];

    return {
      showConfig: supportsCustomSize(model),
      modelSizes: sizes,
      isImageGen: imageGen,
      isDalle3: dalle3,
      isGptImage: gptImage,
      qualityOptions,
      formatOptions,
      styleOptions,
    };
  }, [model]);
}
