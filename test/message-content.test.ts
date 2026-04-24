/**
 * @jest-environment node
 */
/**
 * Defensive tests for getMessageTextContent() and getMessageImages().
 *
 * These utilities must handle corrupt / unexpected `content` shapes
 * without throwing, since they're called in render paths.
 */
import {
  getMessageTextContent,
  getMessageImages,
} from "@/app/utils";
import type { RequestMessage } from "@/app/client/api";

// Mock browser-only dependencies that utils.ts imports
jest.mock("react", () => ({ useEffect: jest.fn(), useState: jest.fn() }));
jest.mock("@/app/components/ui-lib", () => ({ showToast: jest.fn() }));
jest.mock("@/app/locales", () => ({
  __esModule: true,
  default: { Copy: { Success: "", Failed: "" }, Download: { Success: "", Failed: "" } },
}));
jest.mock("@/app/store", () => ({ useAccessStore: jest.fn() }));
jest.mock("@/app/utils/stream", () => ({ fetch: jest.fn() }));
jest.mock("@/app/hooks/useModelInfo", () => ({
  hasCapability: jest.fn().mockReturnValue(false),
  getClientModelInfo: jest.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// getMessageTextContent
// ---------------------------------------------------------------------------

describe("getMessageTextContent", () => {
  it("returns string content directly", () => {
    const msg = { role: "user", content: "hello" } as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("hello");
  });

  it("extracts text from multimodal array", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "Here is the image" },
        { type: "image_url", image_url: { url: "https://img.test/1.png" } },
      ],
    } as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("Here is the image");
  });

  it("returns empty string for array with no text parts", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "image_url", image_url: { url: "https://img.test/1.png" } },
      ],
    } as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("");
  });

  it("handles null content without throwing", () => {
    const msg = { role: "user", content: null } as unknown as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("");
  });

  it("handles undefined content without throwing", () => {
    const msg = { role: "user", content: undefined } as unknown as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("");
  });

  it("stringifies unexpected object content", () => {
    const msg = {
      role: "user",
      content: { unexpected: "object" },
    } as unknown as RequestMessage;
    const result = getMessageTextContent(msg);
    expect(result).toContain("unexpected");
    expect(result).toContain("object");
  });

  it("converts number content to string", () => {
    const msg = { role: "user", content: 42 } as unknown as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("42");
  });

  it("handles text part with missing text field", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "text" }], // text field missing
    } as unknown as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("");
  });

  it("returns empty string for empty array", () => {
    const msg = { role: "user", content: [] } as unknown as RequestMessage;
    expect(getMessageTextContent(msg)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getMessageImages
// ---------------------------------------------------------------------------

describe("getMessageImages", () => {
  it("returns empty array for string content", () => {
    const msg = { role: "user", content: "hello" } as RequestMessage;
    expect(getMessageImages(msg)).toEqual([]);
  });

  it("extracts image URLs from multimodal array", () => {
    const msg = {
      role: "assistant",
      content: [
        { type: "text", text: "caption" },
        { type: "image_url", image_url: { url: "https://img.test/a.png" } },
        { type: "image_url", image_url: { url: "https://img.test/b.png" } },
      ],
    } as RequestMessage;
    expect(getMessageImages(msg)).toEqual([
      "https://img.test/a.png",
      "https://img.test/b.png",
    ]);
  });

  it("returns empty array for null content", () => {
    const msg = { role: "user", content: null } as unknown as RequestMessage;
    expect(getMessageImages(msg)).toEqual([]);
  });

  it("returns empty array for undefined content", () => {
    const msg = { role: "user", content: undefined } as unknown as RequestMessage;
    expect(getMessageImages(msg)).toEqual([]);
  });

  it("returns empty array for non-array object content", () => {
    const msg = {
      role: "user",
      content: { type: "image_url" },
    } as unknown as RequestMessage;
    expect(getMessageImages(msg)).toEqual([]);
  });

  it("handles image_url with missing url field", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "image_url", image_url: {} }],
    } as unknown as RequestMessage;
    expect(getMessageImages(msg)).toEqual([""]);
  });

  it("returns empty array for empty content array", () => {
    const msg = { role: "user", content: [] } as unknown as RequestMessage;
    expect(getMessageImages(msg)).toEqual([]);
  });
});
