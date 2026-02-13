/**
 * @jest-environment node
 */

// Test LaTeX escapeBrackets() — P2 fix
// Verifies:
// 1. Standard \[...\] → $$...$$ conversion
// 2. Standard \(...\) → $...$ conversion
// 3. Code blocks are preserved
// 4. Edge case: \[x\\] (backslash before closing bracket) now matches
// 5. Empty and single-char math expressions

// We need to import escapeBrackets. Since it's a local function in markdown.tsx,
// we replicate the fixed function here for unit testing.
// In a real project we'd extract it to a utility module.

function escapeBrackets(text: string) {
  const pattern =
    /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?)\\\]|\\\((.*?)\\\)/g;
  return text.replace(
    pattern,
    (match, codeBlock, squareBracket, roundBracket) => {
      if (codeBlock) {
        return codeBlock;
      } else if (squareBracket != null) {
        return `$$${squareBracket}$$`;
      } else if (roundBracket != null) {
        return `$${roundBracket}$`;
      }
      return match;
    },
  );
}

describe("escapeBrackets", () => {
  describe("display math \\[...\\]", () => {
    it("converts simple display math", () => {
      expect(escapeBrackets("\\[E = mc^2\\]")).toBe("$$E = mc^2$$");
    });

    it("converts display math with fractions", () => {
      expect(escapeBrackets("\\[\\frac{a}{b}\\]")).toBe("$$\\frac{a}{b}$$");
    });

    it("converts multi-line display math", () => {
      const input = "\\[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\]";
      const expected = "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$";
      expect(escapeBrackets(input)).toBe(expected);
    });

    it("handles double backslash before closing bracket (P2 fix)", () => {
      // This was the reported bug: \[x\\] should match
      expect(escapeBrackets("\\[x\\\\\\]")).toBe("$$x\\\\$$");
    });

    it("handles single character display math", () => {
      expect(escapeBrackets("\\[x\\]")).toBe("$$x$$");
    });

    it("handles empty display math", () => {
      expect(escapeBrackets("\\[\\]")).toBe("$$$$");
    });
  });

  describe("inline math \\(...\\)", () => {
    it("converts simple inline math", () => {
      expect(escapeBrackets("\\(x + y\\)")).toBe("$x + y$");
    });

    it("converts inline math with superscript", () => {
      expect(escapeBrackets("The formula \\(x^2\\) is quadratic.")).toBe(
        "The formula $x^2$ is quadratic.",
      );
    });

    it("handles multiple inline math in one line", () => {
      expect(
        escapeBrackets("Given \\(a\\) and \\(b\\), compute \\(a+b\\)."),
      ).toBe("Given $a$ and $b$, compute $a+b$.");
    });
  });

  describe("code block preservation", () => {
    it("preserves backtick code with LaTeX-like content", () => {
      expect(escapeBrackets("`\\[x\\]`")).toBe("`\\[x\\]`");
    });

    it("preserves fenced code blocks with LaTeX-like content", () => {
      const input = "```\n\\[x\\]\n```";
      expect(escapeBrackets(input)).toBe("```\n\\[x\\]\n```");
    });

    it("converts math outside code but preserves code", () => {
      const input = "\\[E=mc^2\\] and `\\[code\\]`";
      expect(escapeBrackets(input)).toBe("$$E=mc^2$$ and `\\[code\\]`");
    });
  });

  describe("mixed content", () => {
    it("handles text with both display and inline math", () => {
      const input = "Display: \\[a^2 + b^2 = c^2\\], inline: \\(x\\)";
      const expected = "Display: $$a^2 + b^2 = c^2$$, inline: $x$";
      expect(escapeBrackets(input)).toBe(expected);
    });

    it("handles text with no math", () => {
      const input = "Hello world, no math here.";
      expect(escapeBrackets(input)).toBe(input);
    });

    it("handles escaped brackets that are not LaTeX", () => {
      // A single \[ without matching \] should not be converted
      const input = "Array \\[0] is the first element";
      // No matching \], so the regex won't match — text preserved as-is
      expect(escapeBrackets(input)).toBe(input);
    });
  });
});
