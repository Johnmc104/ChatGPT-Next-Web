import type { ModelCapabilityProfile } from "./types";

export type ModelCapabilityOverride = Partial<
  Pick<
    ModelCapabilityProfile,
    "imageInput" | "imageOutput" | "tools" | "maxInputImages" | "maxImageBytes"
  >
> & { imageOutputProtocol?: "images" | "chat" };
export type ModelCapabilityOverrides = Record<string, ModelCapabilityOverride>;
export const MAX_CONFIGURED_IMAGES = 32;

export function modelCapabilityKey(model: string, provider: string) {
  return JSON.stringify([model, provider.toLowerCase()]);
}

export function findCapabilityOverride(
  overrides: ModelCapabilityOverrides,
  model: string,
  provider?: string,
): ModelCapabilityOverride | undefined {
  if (provider) return overrides[modelCapabilityKey(model, provider)];
  // Legacy consumers without a provider may only use an unambiguous declaration.
  const matches = Object.entries(overrides).filter(([key]) => {
    try {
      return JSON.parse(key)[0] === model;
    } catch {
      return false;
    }
  });
  return matches.length === 1 ? matches[0][1] : undefined;
}

export function validImageLimit(value: number): boolean {
  return (
    Number.isInteger(value) && value >= 1 && value <= MAX_CONFIGURED_IMAGES
  );
}
