/**
 * Tests for ChatGPTApi.extractMessage() — the unified response parser
 * that handles DALL-E, gpt-image, OpenRouter, and standard chat formats.
 */

// We test extractMessage in isolation by instantiating ChatGPTApi directly.
// Mock the store dependencies that ChatGPTApi constructor/methods use.
jest.mock("@/app/store", () => ({
  useAccessStore: {
    getState: () => ({
      openaiApiKey: "",
      accessCode: "",
      useCustomConfig: false,
    }),
  },
  useAppConfig: {
    getState: () => ({
      modelConfig: { model: "gpt-4o-mini", providerName: "OpenAI" },
    }),
  },
  useChatStore: {
    getState: () => ({
      currentSession: () => ({
        mask: { modelConfig: { model: "gpt-4o-mini" } },
      }),
    }),
  },
  usePluginStore: { getState: () => ({ getAsTools: () => [[], []] }) },
  ChatControllerPool: { addController: jest.fn(), remove: jest.fn() },
}));

jest.mock("@/app/config/client", () => ({
  getClientConfig: () => null,
}));

jest.mock("@/app/utils/chat", () => ({
  preProcessImageContent: jest.fn((c: any) => c),
  // uploadImage mock: simulate ServiceWorker cache returning a URL
  uploadImage: jest.fn(async (_blob: Blob) => "https://cache.test/img-001"),
  cacheBase64Image: jest.fn(
    async (_b64: string, _mime?: string) => "https://cache.test/img-001",
  ),
  base64Image2Blob: jest.fn(
    (b64: string, mime: string) => new Blob([b64], { type: mime }),
  ),
  base64Image2BlobAsync: jest.fn(
    async (b64: string, mime: string) => new Blob([b64], { type: mime }),
  ),
  streamWithThink: jest.fn(),
}));

jest.mock("@/app/utils/cloudflare", () => ({
  cloudflareAIGatewayUrl: jest.fn((url: string) => url),
}));

import { ChatGPTApi } from "../app/client/platforms/openai";

describe("ChatGPTApi.extractMessage", () => {
  let api: ChatGPTApi;

  beforeEach(() => {
    api = new ChatGPTApi();
  });

  describe("error responses", () => {
    it("should format error as code block", async () => {
      const res = { error: { message: "Invalid API key", type: "auth" } };
      const result = await api.extractMessage(res);
      expect(typeof result).toBe("string");
      expect(result).toContain("```");
      expect(result).toContain("Invalid API key");
    });
  });

  describe("DALL-E / Images API format (res.data)", () => {
    it("should handle b64_json response", async () => {
      const res = {
        data: [{ b64_json: "iVBORw0KGgo=", revised_prompt: "A cat" }],
      };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      // Should have revised_prompt text + image
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ type: "text", text: "A cat" });
      expect(parts[1].type).toBe("image_url");
      expect(parts[1].image_url.url).toBe("https://cache.test/img-001");
    });

    it("should handle URL response", async () => {
      const res = {
        data: [{ url: "https://oai.blob.core/image.png" }],
      };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      expect(parts[0].type).toBe("image_url");
      expect(parts[0].image_url.url).toBe("https://oai.blob.core/image.png");
    });

    it("should handle b64_json without revised_prompt", async () => {
      const res = { data: [{ b64_json: "abc123" }] };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      // No revised_prompt → only image part
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe("image_url");
    });
  });

  describe("OpenRouter format (message.images[])", () => {
    it("should extract images from message.images array", async () => {
      const res = {
        choices: [
          {
            message: {
              content: "Here is your image",
              images: [
                { image_url: { url: "https://openrouter.ai/img1.png" } },
              ],
            },
          },
        ],
      };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      expect(parts).toHaveLength(2); // text + image
      expect(parts[0]).toEqual({
        type: "text",
        text: "Here is your image",
      });
      expect(parts[1].type).toBe("image_url");
    });

    it("should cache base64 data URI images from OpenRouter", async () => {
      const res = {
        choices: [
          {
            message: {
              content: "",
              images: [
                { image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
              ],
            },
          },
        ],
      };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      // base64 should have been uploaded to SW cache
      expect(parts[0].image_url.url).toBe("https://cache.test/img-001");
    });
  });

  describe("multimodal content array", () => {
    it("should handle mixed text + image content", async () => {
      const res = {
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "Here's your edit" },
                {
                  type: "image_url",
                  image_url: { url: "https://cdn.test/img.png" },
                },
              ],
            },
          },
        ],
      };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ type: "text", text: "Here's your edit" });
      expect(parts[1].image_url.url).toBe("https://cdn.test/img.png");
    });

    it("should cache base64 images in multimodal content", async () => {
      const res = {
        choices: [
          {
            message: {
              content: [
                {
                  type: "image_url",
                  image_url: { url: "data:image/jpeg;base64,/9j/4AAQ" },
                },
              ],
            },
          },
        ],
      };
      const result = await api.extractMessage(res);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as any[];
      expect(parts[0].image_url.url).toBe("https://cache.test/img-001");
    });
  });

  describe("standard text responses", () => {
    it("should return plain string for text content", async () => {
      const res = {
        choices: [{ message: { content: "Hello world" } }],
      };
      const result = await api.extractMessage(res);
      expect(typeof result).toBe("string");
      expect(result).toBe("Hello world");
    });

    it("should handle empty choices gracefully", async () => {
      const res = { choices: [] };
      const result = await api.extractMessage(res);
      expect(typeof result).toBe("string");
    });

    it("should handle missing message", async () => {
      const res = { choices: [{}] };
      const result = await api.extractMessage(res);
      expect(typeof result).toBe("string");
    });
  });

  describe("edge cases", () => {
    it("should never return a raw object", async () => {
      const res = { unexpected: "format" };
      const result = await api.extractMessage(res);
      // Must be string or array, never a plain object
      expect(
        typeof result === "string" || Array.isArray(result),
      ).toBeTruthy();
    });

    it("should handle null/undefined gracefully", async () => {
      const result = await api.extractMessage({});
      expect(
        typeof result === "string" || Array.isArray(result),
      ).toBeTruthy();
    });

    it("should handle string response directly", async () => {
      const result = await api.extractMessage("raw string");
      expect(result).toBe("raw string");
    });
  });
});
