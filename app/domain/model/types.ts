/**
 * Provider-independent model capabilities.
 * Provider adapters may expose more detail, but routing should depend on
 * these stable flags instead of model-name string checks.
 */
export enum ModelCapability {
  TextInput = "text-input",
  ImageInput = "image-input",
  AudioInput = "audio-input",
  VideoInput = "video-input",
  FileInput = "file-input",
  TextOutput = "text-output",
  ImageOutput = "image-output",
  AudioOutput = "audio-output",
  Reasoning = "reasoning",
  ToolUse = "tool-use",
  WebSearch = "web-search",
}

export interface ModelCapabilityProfile {
  textInput: boolean;
  imageInput: boolean;
  imageOutput: boolean;
  imageEdit: boolean;
  streaming: boolean;
  tools: boolean;
  maxInputImages?: number;
  acceptedImageTypes?: string[];
  maxImageBytes?: number;
}
