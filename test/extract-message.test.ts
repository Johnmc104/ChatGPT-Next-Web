jest.mock("../app/services/model/capabilities", () => ({
  getConfiguredCapabilities: () => undefined,
}));
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

jest.mock("@/app/services/media/image", () => ({
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
}));

jest.mock("@/app/services/chat/stream", () => ({ streamWithThink: jest.fn() }));

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
    it("throws a readable error instead of returning the body", async () => {
      const res = { error: { message: "Invalid API key", type: "auth" } };
      await expect(api.extractMessage(res)).rejects.toThrow(
        "Invalid API key (auth)",
      );
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
      expect(await api.extractMessage(res)).toBe("");
    });

    it("should handle missing message", async () => {
      const res = { choices: [{}] };
      expect(await api.extractMessage(res)).toBe("");
    });

    it("returns empty text, not the response JSON, when content is null", async () => {
      // Reasoning models: answer budget spent on reasoning, content null.
      const res = {
        id: "chatcmpl-1",
        object: "chat.completion",
        choices: [
          {
            message: { content: null, reasoning_content: "thinking…" },
            finish_reason: "length",
          },
        ],
      };
      expect(await api.extractMessage(res)).toBe("");
    });

    it("joins text parts of array content", async () => {
      const res = {
        choices: [
          {
            message: {
              content: [
                { type: "output_text", text: "Hello " },
                { type: "text", text: "world" },
              ],
            },
          },
        ],
      };
      expect(await api.extractMessage(res)).toBe("Hello world");
    });
  });

  describe("edge cases", () => {
    it("never returns the response body as text", async () => {
      const res = { unexpected: "format" };
      expect(await api.extractMessage(res)).toBe("");
    });

    it("should handle null/undefined gracefully", async () => {
      const result = await api.extractMessage({});
      expect(typeof result === "string" || Array.isArray(result)).toBeTruthy();
    });

    it("ignores a non-object response", async () => {
      expect(await api.extractMessage("raw string")).toBe("");
    });
  });
});

describe("multimodal image generation request routing", () => {
  test("Gemini-style image models use non-streaming chat output with modalities", async () => {
    const api = new ChatGPTApi();
    const path = jest.spyOn(api, "path").mockReturnValue("/fixture/chat");
    const finish = jest.fn();
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Image",
                images: [
                  { image_url: { url: "https://fixture.test/generated.png" } },
                ],
              },
            },
          ],
        }),
    });
    await api.chat({
      messages: [{ role: "user", content: "draw a tree" }],
      config: {
        model: "google/gemini-image-preview",
        providerName: "Google",
        stream: true,
      },
      onFinish: finish,
    });
    expect(path).toHaveBeenCalledWith("v1/chat/completions");
    const request = (fetch as jest.Mock).mock.calls.at(-1);
    expect(JSON.parse(request[1].body)).toMatchObject({
      model: "google/gemini-image-preview",
      modalities: ["image", "text"],
      stream: false,
    });
    expect(finish.mock.calls[0][0]).toContainEqual({
      type: "image_url",
      image_url: { url: "https://fixture.test/generated.png" },
    });
  });
});

describe("chat request payload", () => {
  const { streamWithThink } = jest.requireMock("@/app/services/chat/stream");

  async function sentPayload(model: string, messages: any[]) {
    (streamWithThink as jest.Mock).mockClear();
    const api = new ChatGPTApi();
    jest.spyOn(api, "path").mockReturnValue("/fixture/chat");
    await api.chat({
      messages,
      config: { model, providerName: "OpenAI", stream: true },
      onFinish: jest.fn(),
    });
    return (streamWithThink as jest.Mock).mock.calls[0][1];
  }

  const history = [
    { role: "user", content: "first" },
    {
      role: "assistant",
      content: "<!--THINKING-->\n> private reasoning\n<!--/THINKING-->\n\nreply",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AA" } },
      ],
    },
  ];

  test.each(["gpt-4o", "o3-mini", "gpt-5"])(
    "%s: sends no output token cap",
    async (model) => {
      const payload = await sentPayload(model, history);
      expect(payload).not.toHaveProperty("max_tokens");
      expect(payload).not.toHaveProperty("max_completion_tokens");
    },
  );

  test("strips reasoning blocks from assistant history", async () => {
    const payload = await sentPayload("gpt-4o", history);
    const assistant = payload.messages.find(
      (m: any) => m.role === "assistant",
    );
    expect(assistant.content).toBe("reply");
    // The user's image is still sent.
    expect(JSON.stringify(payload.messages.at(-1))).toContain("image_url");
  });
});
