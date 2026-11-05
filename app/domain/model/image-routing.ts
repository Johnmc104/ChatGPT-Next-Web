import type { ModelCapabilityOverride } from "./overrides";

/** Native image families use Images API; multimodal chat models use chat output. */
export function resolveImageOutputProtocol(
  model: string,
  override?: ModelCapabilityOverride,
): "images" | "chat" {
  if (override?.imageOutputProtocol) return override.imageOutputProtocol;
  return /(?:gpt-image|dall-e|dalle|cogview)/i.test(model) ? "images" : "chat";
}
