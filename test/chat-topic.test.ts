import {
  looksLikeLeakedTopic,
  MAX_TOPIC_LENGTH,
  sanitizeTopic,
} from "../app/domain/chat/topic";
import {
  stripThinkingBlocks,
  stripThinkingFromContent,
} from "../app/utils/message";

describe("sanitizeTopic", () => {
  test("keeps a plain title and trims quotes and punctuation", () => {
    expect(sanitizeTopic("“图片识别问题”。")).toBe("图片识别问题");
    expect(sanitizeTopic("Title: Rust lifetimes.")).toBe("Rust lifetimes");
    expect(sanitizeTopic("**Docker 部署**")).toBe("Docker 部署");
  });

  test("rejects a leaked response body", () => {
    const body = JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      choices: [{ message: { content: null } }],
    });
    expect(sanitizeTopic(body)).toBeNull();
    expect(sanitizeTopic("```\n" + body + "\n```")).toBeNull();
  });

  test("accepts a JSON title object", () => {
    expect(sanitizeTopic('{"title": "周报总结"}')).toBe("周报总结");
    expect(sanitizeTopic('```json\n{"topic":"Trip plan"}\n```')).toBe(
      "Trip plan",
    );
  });

  test("drops reasoning blocks and takes the first line", () => {
    expect(
      sanitizeTopic("<!--THINKING-->\n> hmm\n<!--/THINKING-->\n\n旅行计划\n"),
    ).toBe("旅行计划");
    expect(sanitizeTopic("<think>long</think>\nShort title\nextra")).toBe(
      "Short title",
    );
  });

  test("rejects empty and non-string replies", () => {
    expect(sanitizeTopic("")).toBeNull();
    expect(sanitizeTopic("<!--THINKING-->\n> only reasoning")).toBeNull();
    expect(sanitizeTopic(undefined)).toBeNull();
    expect(sanitizeTopic([{ type: "text", text: "x" }])).toBeNull();
  });

  test("caps the length", () => {
    const title = sanitizeTopic("长".repeat(80));
    expect(Array.from(title!)).toHaveLength(MAX_TOPIC_LENGTH);
  });
});

describe("looksLikeLeakedTopic", () => {
  test("detects stored JSON titles", () => {
    expect(looksLikeLeakedTopic('{"id":"chatcmpl-1","object":"x"')).toBe(true);
    expect(looksLikeLeakedTopic('```\n{\n    "error": {')).toBe(true);
    expect(looksLikeLeakedTopic('前缀 "choices": [')).toBe(true);
    expect(looksLikeLeakedTopic("新的聊天")).toBe(false);
    expect(looksLikeLeakedTopic("JSON 解析问题")).toBe(false);
  });
});

describe("stripThinkingBlocks", () => {
  test("removes thinking markers but keeps ordinary blockquotes", () => {
    expect(
      stripThinkingBlocks("<!--THINKING-->\n> a\n<!--/THINKING-->\n\n> quote"),
    ).toBe("> quote");
    expect(stripThinkingBlocks("> quote only")).toBe("> quote only");
  });

  test("removes an unterminated block to the end", () => {
    expect(stripThinkingBlocks("Answer\n<!--THINKING-->\n> cut")).toBe(
      "Answer",
    );
  });

  test("applies to text parts of multimodal content", () => {
    expect(
      stripThinkingFromContent([
        { type: "text", text: "<think>x</think>Hi" },
        { type: "image_url", image_url: { url: "u" } },
      ]),
    ).toEqual([
      { type: "text", text: "Hi" },
      { type: "image_url", image_url: { url: "u" } },
    ]);
  });
});
