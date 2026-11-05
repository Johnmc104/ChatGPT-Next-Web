import {
  resolveMaxInputImages,
  resolveModelCapabilities,
} from "../app/domain/model/resolve";
import {
  findCapabilityOverride,
  modelCapabilityKey,
} from "../app/domain/model/overrides";
import { resolveImageOutputProtocol } from "../app/domain/model/image-routing";
import { ModelCapability } from "../app/domain/model/types";
import type { ModelInfo } from "../app/api/model-info/types";

const vision = {
  capabilities: [ModelCapability.ImageInput],
  max_input_images: 8,
} as ModelInfo;
test("uses metadata limits and supports overrides greater than three", () => {
  expect(resolveMaxInputImages("vision", vision)).toBe(8);
  expect(
    resolveMaxInputImages("deployment", undefined, {
      imageInput: true,
      maxInputImages: 6,
    }),
  ).toBe(6);
  expect(resolveMaxInputImages("unknown")).toBe(3);
  expect(resolveMaxInputImages("vision", vision, { imageInput: false })).toBe(
    0,
  );
});
test.each([0, -1, 33, NaN, 2.5])(
  "invalid override %s falls back to metadata",
  (maxInputImages) => {
    expect(resolveMaxInputImages("vision", vision, { maxInputImages })).toBe(8);
  },
);
test("same ID on different providers keeps separate capability declarations", () => {
  const overrides = {
    [modelCapabilityKey("deploy", "OpenAI")]: { imageInput: true },
    [modelCapabilityKey("deploy", "Azure")]: { imageInput: false },
  };
  expect(
    findCapabilityOverride(overrides, "deploy", "openai")?.imageInput,
  ).toBe(true);
  expect(findCapabilityOverride(overrides, "deploy", "Azure")?.imageInput).toBe(
    false,
  );
  expect(findCapabilityOverride(overrides, "deploy")).toBeUndefined();
});
test.each([
  ["openai/gpt-image-1", "images"],
  ["openai/dall-e-3", "images"],
  ["google/gemini-image-preview", "chat"],
  ["custom-image", "chat"],
])("routes %s through %s", (model, protocol) => {
  expect(resolveImageOutputProtocol(model)).toBe(protocol);
});
test("an explicit output protocol is independent of the displayed model name", () => {
  expect(
    resolveImageOutputProtocol("gateway-deployment", {
      imageOutputProtocol: "images",
    }),
  ).toBe("images");
  expect(
    resolveModelCapabilities("model", undefined, {
      imageInput: true,
      imageOutput: true,
    }).imageEdit,
  ).toBe(true);
});
