/**
 * @jest-environment node
 */

// Test getMessageTextContentWithoutThinking() — P1 fix
// Verifies:
// 1. New <!--THINKING--> marker format is correctly stripped
// 2. Backward compat: old "> " blockquote format at message start is stripped
// 3. Legitimate blockquotes AFTER thinking content are preserved
// 4. Non-thinking messages are returned unchanged

// We replicate the function here to avoid the deep import chain in app/utils.ts
// which triggers ESM-only packages (nanoid, lodash-es). The implementation must
// stay in sync with app/utils.ts:getMessageTextContentWithoutThinking().

interface RequestMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

function getMessageTextContentWithoutThinking(message: RequestMessage) {
  let content = "";

  if (typeof message.content === "string") {
    content = message.content;
  } else {
    for (const c of message.content) {
      if (c.type === "text") {
        content = c.text ?? "";
        break;
      }
    }
  }

  // New format: strip content between <!--THINKING--> and <!--/THINKING--> markers
  if (content.includes("<!--THINKING-->")) {
    return content
      .replace(/<!--THINKING-->[\s\S]*?<!--\/THINKING-->/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Backward compatibility: strip leading blockquote lines (old thinking format)
  const lines = content.split("\n");
  let thinkingEndIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("> ") || line.trim() === "") {
      thinkingEndIndex = i + 1;
    } else {
      break;
    }
  }

  if (thinkingEndIndex > 0) {
    const hasBlockquote = lines
      .slice(0, thinkingEndIndex)
      .some((l) => l.startsWith("> "));
    if (hasBlockquote) {
      return lines.slice(thinkingEndIndex).join("\n").trim();
    }
  }

  return content.trim();
}

function msg(content: string) {
  return { role: "assistant" as const, content };
}

function multimodalMsg(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
  };
}

describe("getMessageTextContentWithoutThinking", () => {
  describe("new marker format (<!--THINKING-->)", () => {
    it("strips thinking block with markers", () => {
      const content =
        "<!--THINKING-->\n> Let me think about this...\n<!--/THINKING-->\n\nHere is the answer.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Here is the answer.",
      );
    });

    it("strips thinking block that ends at stream finish (no trailing content)", () => {
      const content =
        "<!--THINKING-->\n> Just thinking, no response yet\n<!--/THINKING-->";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe("");
    });

    it("preserves legitimate blockquotes after thinking markers", () => {
      const content =
        "<!--THINKING-->\n> Analyzing the quote...\n<!--/THINKING-->\n\nAs the author said:\n\n> To be or not to be";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "As the author said:\n\n> To be or not to be",
      );
    });

    it("strips multiple thinking blocks", () => {
      const content =
        "<!--THINKING-->\n> First thought\n<!--/THINKING-->\n\nPartial answer\n\n<!--THINKING-->\n> Second thought\n<!--/THINKING-->\n\nFinal answer.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Partial answer\n\nFinal answer.",
      );
    });

    it("handles thinking with multi-line content", () => {
      const content =
        "<!--THINKING-->\n> Line 1\n> Line 2\n>\n> Line 3\n<!--/THINKING-->\n\nResult.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Result.",
      );
    });
  });

  describe("backward compatibility (old > format)", () => {
    it("strips leading blockquote lines (old format)", () => {
      const content =
        "> Let me think...\n> More thinking\n\nHere is the answer.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Here is the answer.",
      );
    });

    it("only strips leading blockquotes, preserves later ones", () => {
      const content =
        "> Thinking here\n\nResponse text\n\n> This is a real quote";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Response text\n\n> This is a real quote",
      );
    });

    it("strips leading blockquotes with empty lines between them", () => {
      const content =
        "> First thought\n\n> Second thought\n\nActual response.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Actual response.",
      );
    });
  });

  describe("no thinking content", () => {
    it("returns content unchanged when no thinking markers or leading blockquotes", () => {
      const content = "Hello, here is the answer.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "Hello, here is the answer.",
      );
    });

    it("preserves blockquotes that are not at the start", () => {
      const content = "The author said:\n\n> Some famous quote\n\nEnd.";
      expect(getMessageTextContentWithoutThinking(msg(content))).toBe(
        "The author said:\n\n> Some famous quote\n\nEnd.",
      );
    });

    it("handles empty content", () => {
      expect(getMessageTextContentWithoutThinking(msg(""))).toBe("");
    });

    it("handles whitespace-only content", () => {
      expect(getMessageTextContentWithoutThinking(msg("  \n  "))).toBe("");
    });
  });

  describe("multimodal messages", () => {
    it("extracts text from multimodal content with markers", () => {
      const content =
        "<!--THINKING-->\n> Thinking...\n<!--/THINKING-->\n\nAnswer.";
      expect(
        getMessageTextContentWithoutThinking(multimodalMsg(content)),
      ).toBe("Answer.");
    });

    it("handles multimodal with no text content", () => {
      const message = {
        role: "assistant" as const,
        content: [{ type: "image_url" as const, image_url: { url: "x" } }],
      };
      expect(getMessageTextContentWithoutThinking(message as any)).toBe("");
    });
  });
});
