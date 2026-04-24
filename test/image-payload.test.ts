/**
 * Test that image generation payloads are built correctly for different model families.
 * Verifies the fix for gpt-image-* models requiring output_format instead of response_format,
 * and different quality values than DALL-E.
 */

// Inline the payload-building logic extracted from openai.ts for unit testing
function buildImagePayload(model: string, configQuality?: string, configStyle?: string, configSize?: string, outputFormat?: string) {
  const isDalle3 = model.includes("dall-e-3");
  const isGptImageModel = model.toLowerCase().includes("gpt-image");
  const gptImageValidQualities = ["low", "medium", "high", "auto"];
  const fmt = outputFormat ?? "png";

  return {
    model,
    prompt: "test prompt",
    n: 1,
    size: configSize ?? "1024x1024",
    // GPT Image models use output_format; DALL-E uses response_format
    ...(isGptImageModel
      ? {
          output_format: fmt,
          ...((fmt === "jpeg" || fmt === "webp") && {
            output_compression: 100,
          }),
        }
      : { response_format: "b64_json" as const }),
    // Quality & style mapping
    ...(isDalle3
      ? {
          quality: configQuality ?? "standard",
          style: configStyle ?? "vivid",
        }
      : isGptImageModel
        ? {
            quality: gptImageValidQualities.includes(configQuality ?? "")
              ? configQuality
              : configQuality === "hd"
                ? "high"
                : "auto",
          }
        : {}),
  };
}

describe("Image generation payload construction", () => {
  // --- DALL-E 3 ---
  describe("dall-e-3", () => {
    it("should use response_format: b64_json", () => {
      const payload = buildImagePayload("dall-e-3");
      expect(payload.response_format).toBe("b64_json");
      expect(payload).not.toHaveProperty("output_format");
    });

    it("should include quality and style with DALL-E defaults", () => {
      const payload = buildImagePayload("dall-e-3");
      expect(payload.quality).toBe("standard");
      expect(payload.style).toBe("vivid");
    });

    it("should pass through hd quality", () => {
      const payload = buildImagePayload("dall-e-3", "hd");
      expect(payload.quality).toBe("hd");
    });
  });

  // --- GPT Image models ---
  describe.each([
    "gpt-image-1",
    "gpt-image-1.5",
    "gpt-image-2",
    "openai/gpt-image-2",
  ])("%s", (model) => {
    it("should use output_format: png (not response_format)", () => {
      const payload = buildImagePayload(model);
      expect(payload.output_format).toBe("png");
      expect(payload).not.toHaveProperty("response_format");
    });

    it("should NOT include style", () => {
      const payload = buildImagePayload(model);
      expect(payload).not.toHaveProperty("style");
    });

    it('should remap "standard" quality to "auto"', () => {
      const payload = buildImagePayload(model, "standard");
      expect(payload.quality).toBe("auto");
    });

    it('should remap "hd" quality to "high"', () => {
      const payload = buildImagePayload(model, "hd");
      expect(payload.quality).toBe("high");
    });

    it("should default quality to auto when unset", () => {
      const payload = buildImagePayload(model);
      expect(payload.quality).toBe("auto");
    });

    it('should pass through native GPT Image quality values like "low"', () => {
      const payload = buildImagePayload(model, "low");
      expect(payload.quality).toBe("low");
    });

    it('should pass through "medium"', () => {
      const payload = buildImagePayload(model, "medium");
      expect(payload.quality).toBe("medium");
    });

    it('should pass through "high"', () => {
      const payload = buildImagePayload(model, "high");
      expect(payload.quality).toBe("high");
    });
  });

  // --- Other image models (e.g., cogview) ---
  describe("other image models (cogview-3)", () => {
    it("should use response_format: b64_json", () => {
      const payload = buildImagePayload("cogview-3");
      expect(payload.response_format).toBe("b64_json");
      expect(payload).not.toHaveProperty("output_format");
    });

    it("should NOT include quality or style", () => {
      const payload = buildImagePayload("cogview-3");
      expect(payload).not.toHaveProperty("quality");
      expect(payload).not.toHaveProperty("style");
    });
  });

  // --- Output format selection ---
  describe("output_format for GPT Image models", () => {
    it("should default to png", () => {
      const payload = buildImagePayload("gpt-image-2");
      expect(payload.output_format).toBe("png");
      expect(payload).not.toHaveProperty("output_compression");
    });

    it("should use jpeg and include output_compression", () => {
      const payload = buildImagePayload("gpt-image-2", undefined, undefined, undefined, "jpeg");
      expect(payload.output_format).toBe("jpeg");
      expect(payload.output_compression).toBe(100);
    });

    it("should use webp and include output_compression", () => {
      const payload = buildImagePayload("gpt-image-2", undefined, undefined, undefined, "webp");
      expect(payload.output_format).toBe("webp");
      expect(payload.output_compression).toBe(100);
    });

    it("should not include output_compression for png", () => {
      const payload = buildImagePayload("gpt-image-2", undefined, undefined, undefined, "png");
      expect(payload.output_format).toBe("png");
      expect(payload).not.toHaveProperty("output_compression");
    });

    it("DALL-E should not be affected by outputFormat param", () => {
      const payload = buildImagePayload("dall-e-3", undefined, undefined, undefined, "jpeg");
      expect(payload.response_format).toBe("b64_json");
      expect(payload).not.toHaveProperty("output_format");
      expect(payload).not.toHaveProperty("output_compression");
    });
  });

  // --- Size options ---
  describe("size parameter", () => {
    it("should accept auto size for gpt-image-2", () => {
      const payload = buildImagePayload("gpt-image-2", undefined, undefined, "auto");
      expect(payload.size).toBe("auto");
    });

    it("should accept 4K size for gpt-image-2", () => {
      const payload = buildImagePayload("gpt-image-2", undefined, undefined, "3840x2160");
      expect(payload.size).toBe("3840x2160");
    });

    it("should accept 2K size for gpt-image-2", () => {
      const payload = buildImagePayload("gpt-image-2", undefined, undefined, "2048x2048");
      expect(payload.size).toBe("2048x2048");
    });
  });
});
