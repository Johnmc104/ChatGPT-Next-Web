import {
  normalizeMultimodalContent,
  toAnthropicContent,
  toGeminiContent,
  toOpenAIContent,
} from "../app/domain/message/multimodal";

describe("normalizeMultimodalContent", () => {
  test("normalizes OpenAI URL and data URI parts", () => {
    const parts = normalizeMultimodalContent([
      { type: "text", text: "describe" },
      { type: "image_url", image_url: { url: "https://img.test/a.png" } },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" },
      },
    ]);

    expect(parts).toEqual([
      { kind: "text", text: "describe" },
      {
        kind: "image",
        source: { type: "url", value: "https://img.test/a.png" },
      },
      {
        kind: "image",
        source: { type: "base64", value: "AAAA" },
        mimeType: "image/png",
      },
    ]);
  });

  test("normalizes Gemini and Anthropic image shapes", () => {
    const parts = normalizeMultimodalContent([
      { inlineData: { mimeType: "image/jpeg", data: "JPEG" } },
      {
        type: "image",
        source: { type: "base64", media_type: "image/webp", data: "WEBP" },
      },
    ]);

    expect(parts[0]).toEqual({
      kind: "image",
      source: { type: "base64", value: "JPEG" },
      mimeType: "image/jpeg",
    });
    expect(parts[1]).toEqual({
      kind: "image",
      source: { type: "base64", value: "WEBP" },
      mimeType: "image/webp",
    });
  });

  test("preserves order and drops unsupported parts when converting to OpenAI", () => {
    const normalized = normalizeMultimodalContent([
      { type: "text", text: "before" },
      { type: "unsupported", value: 1 },
      { type: "image_url", image_url: { url: "https://img.test/a.png" } },
    ]);

    expect(toOpenAIContent(normalized)).toEqual([
      { type: "text", text: "before" },
      { type: "image_url", image_url: { url: "https://img.test/a.png" } },
    ]);
  });

  test("converts normalized images for Gemini and Anthropic adapters", () => {
    const normalized = normalizeMultimodalContent([
      { type: "text", text: "describe" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,PNG" },
      },
    ]);

    expect(toGeminiContent(normalized)).toEqual([
      { text: "describe" },
      { inlineData: { mimeType: "image/png", data: "PNG" } },
    ]);
    expect(toAnthropicContent(normalized)).toEqual([
      { type: "text", text: "describe" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "PNG" },
      },
    ]);
  });
});

test("rejects unsupported MIME and empty image parts instead of constructing broken URLs", () => {
  const parts = normalizeMultimodalContent([
    { type: "image_url", image_url: { url: "data:text/html;base64,AAAA" } },
    { type: "image_url", image_url: { url: "data:image/png,not-base64" } },
    { inlineData: { mimeType: "application/pdf", data: "AAAA" } },
    { type: "image_url", image_url: { url: "" } },
  ]);
  expect(parts.every((part) => part.kind === "unknown")).toBe(true);
});

test("normalizes Gemini text parts alongside image input", () => {
  expect(
    toOpenAIContent(
      normalizeMultimodalContent([
        { text: "describe" },
        { inlineData: { mimeType: "image/png", data: "AAAA" } },
      ]),
    ),
  ).toEqual([
    { type: "text", text: "describe" },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
  ]);
});
