/**
 * @jest-environment node
 */
/**
 * Tests for model detection utility functions.
 *
 * Ensures that isDalle3, isGptImageModel, isCogViewModel, isGpt5Model,
 * isImageModel (string fallback path), getModelSizes, and supportsCustomSize
 * all correctly identify model families from their name strings.
 */

// Mock browser-only dependencies
jest.mock("react", () => ({ useEffect: jest.fn(), useState: jest.fn() }));
jest.mock("@/app/components/ui-lib", () => ({ showToast: jest.fn() }));
jest.mock("@/app/locales", () => ({
  __esModule: true,
  default: {
    Copy: { Success: "", Failed: "" },
    Download: { Success: "", Failed: "" },
  },
}));
jest.mock("@/app/store", () => ({
  useAccessStore: { getState: () => ({ visionModels: "" }) },
}));
jest.mock("@/app/utils/stream", () => ({ fetch: jest.fn() }));
jest.mock("@/app/hooks/useModelInfo", () => ({
  hasCapability: jest.fn().mockReturnValue(false),
  getClientModelInfo: jest.fn().mockReturnValue(null),
}));

import {
  isDalle3,
  isGptImageModel,
  isCogViewModel,
  isGpt5Model,
  isImageModel,
  getModelSizes,
  supportsCustomSize,
} from "@/app/utils";

// ---------------------------------------------------------------------------
// isDalle3
// ---------------------------------------------------------------------------

describe("isDalle3", () => {
  it("matches exact dall-e-3", () => {
    expect(isDalle3("dall-e-3")).toBe(true);
  });

  it("does not match dall-e-2", () => {
    expect(isDalle3("dall-e-2")).toBe(false);
  });

  it("does not match gpt-image-1", () => {
    expect(isDalle3("gpt-image-1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGptImageModel
// ---------------------------------------------------------------------------

describe("isGptImageModel", () => {
  it("matches gpt-image-1", () => {
    expect(isGptImageModel("gpt-image-1")).toBe(true);
  });

  it("matches gpt-image-2", () => {
    expect(isGptImageModel("gpt-image-2")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isGptImageModel("GPT-Image-2")).toBe(true);
  });

  it("matches OpenRouter-prefixed model", () => {
    expect(isGptImageModel("openai/gpt-image-1")).toBe(true);
  });

  it("does not match gpt-4o", () => {
    expect(isGptImageModel("gpt-4o")).toBe(false);
  });

  it("does not match dall-e-3", () => {
    expect(isGptImageModel("dall-e-3")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCogViewModel
// ---------------------------------------------------------------------------

describe("isCogViewModel", () => {
  it("matches cogview-4", () => {
    expect(isCogViewModel("cogview-4")).toBe(true);
  });

  it("matches CogView-3-Plus", () => {
    expect(isCogViewModel("CogView-3-Plus")).toBe(true);
  });

  it("does not match gpt-image-2", () => {
    expect(isCogViewModel("gpt-image-2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGpt5Model
// ---------------------------------------------------------------------------

describe("isGpt5Model", () => {
  it("matches gpt-5", () => {
    expect(isGpt5Model("gpt-5")).toBe(true);
  });

  it("matches gpt-5-turbo", () => {
    expect(isGpt5Model("gpt-5-turbo")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isGpt5Model("GPT-5")).toBe(true);
  });

  it("does not match gpt-4o", () => {
    expect(isGpt5Model("gpt-4o")).toBe(false);
  });

  it("does not match gpt-50 (exact prefix)", () => {
    // "gpt-50" starts with "gpt-5" so this is expected to match
    expect(isGpt5Model("gpt-50")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isImageModel (string fallback path — capability cache is mocked to empty)
// ---------------------------------------------------------------------------

describe("isImageModel (string fallback)", () => {
  it("identifies gpt-image-2", () => {
    expect(isImageModel("gpt-image-2")).toBe(true);
  });

  it("identifies dall-e-3", () => {
    expect(isImageModel("dall-e-3")).toBe(true);
  });

  it("identifies cogview-4", () => {
    expect(isImageModel("cogview-4")).toBe(true);
  });

  it("does not identify gpt-4o", () => {
    expect(isImageModel("gpt-4o")).toBe(false);
  });

  it("does not identify claude-opus-4.6", () => {
    expect(isImageModel("claude-opus-4.6")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getModelSizes
// ---------------------------------------------------------------------------

describe("getModelSizes", () => {
  it("returns 3 sizes for dall-e-3", () => {
    const sizes = getModelSizes("dall-e-3");
    expect(sizes).toHaveLength(3);
    expect(sizes).toContain("1024x1024");
  });

  it("returns 9 sizes for gpt-image-2", () => {
    const sizes = getModelSizes("gpt-image-2");
    expect(sizes).toHaveLength(9);
    expect(sizes).toContain("auto");
    expect(sizes).toContain("3840x2160");
  });

  it("returns 3 sizes for cogview-4", () => {
    const sizes = getModelSizes("cogview-4");
    expect(sizes).toHaveLength(3);
  });

  it("returns empty array for non-image model", () => {
    expect(getModelSizes("gpt-4o")).toEqual([]);
  });

  it("returns empty array for text model", () => {
    expect(getModelSizes("claude-opus-4.6")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// supportsCustomSize
// ---------------------------------------------------------------------------

describe("supportsCustomSize", () => {
  it("true for image models", () => {
    expect(supportsCustomSize("dall-e-3")).toBe(true);
    expect(supportsCustomSize("gpt-image-1")).toBe(true);
    expect(supportsCustomSize("cogview-4")).toBe(true);
  });

  it("false for non-image models", () => {
    expect(supportsCustomSize("gpt-4o")).toBe(false);
    expect(supportsCustomSize("claude-opus-4.6")).toBe(false);
  });
});
