import {
  describeUpstreamError,
  parseChatCompletionChunk,
} from "../app/domain/chat/sse";

const frame = (value: unknown) => JSON.stringify(value);

describe("parseChatCompletionChunk", () => {
  test("reads answer text from delta.content", () => {
    const chunk = parseChatCompletionChunk(
      frame({ choices: [{ delta: { content: "Hi" } }] }),
    );
    expect(chunk).toMatchObject({ content: "Hi", reasoning: "" });
    expect(chunk?.error).toBeUndefined();
  });

  test("surfaces an error frame sent after a 200 response", () => {
    // sub2api writes this after the upstream fails mid-request.
    const chunk = parseChatCompletionChunk(
      frame({
        error: {
          message: "Our servers are currently overloaded.",
          type: "server_error",
        },
      }),
    );
    expect(chunk?.error).toBe(
      "Our servers are currently overloaded. (server_error)",
    );
  });

  test("surfaces `{ error: true, message }` bodies", () => {
    const chunk = parseChatCompletionChunk(
      frame({ error: true, message: "you are not allowed" }),
    );
    expect(chunk?.error).toBe("you are not allowed");
  });

  test("surfaces choice-level errors and finish_reason error", () => {
    expect(
      parseChatCompletionChunk(
        frame({ choices: [{ delta: {}, error: { message: "boom" } }] }),
      )?.error,
    ).toBe("boom");
    expect(
      parseChatCompletionChunk(
        frame({ choices: [{ delta: {}, finish_reason: "error" }] }),
      )?.error,
    ).toBe("upstream stream error");
  });

  test("treats an `event: error` frame as an error", () => {
    expect(parseChatCompletionChunk("rate limited", "error")?.error).toBe(
      "rate limited",
    );
    expect(
      parseChatCompletionChunk(frame({ message: "quota" }), "error")?.error,
    ).toBe("quota");
  });

  test("accepts `reasoning` as an alias of `reasoning_content`", () => {
    const chunk = parseChatCompletionChunk(
      frame({ choices: [{ delta: { reasoning: "step 1" } }] }),
    );
    expect(chunk).toMatchObject({ reasoning: "step 1", content: "" });
  });

  test("keeps both reasoning and content from one delta", () => {
    const chunk = parseChatCompletionChunk(
      frame({
        choices: [{ delta: { reasoning_content: "think", content: "answer" } }],
      }),
    );
    expect(chunk).toMatchObject({ reasoning: "think", content: "answer" });
  });

  test("joins array-shaped content", () => {
    const chunk = parseChatCompletionChunk(
      frame({
        choices: [
          {
            delta: {
              content: [
                { type: "text", text: "a" },
                { type: "image_url", image_url: { url: "x" } },
                { type: "output_text", text: "b" },
              ],
            },
          },
        ],
      }),
    );
    expect(chunk?.content).toBe("ab");
  });

  test("reads usage-only frames without choices", () => {
    const chunk = parseChatCompletionChunk(
      frame({
        choices: [],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }),
    );
    expect(chunk).toMatchObject({
      content: "",
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    });
    expect(chunk?.error).toBeUndefined();
  });

  test("records finish_reason and tool-call deltas", () => {
    const chunk = parseChatCompletionChunk(
      frame({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "t1", function: { name: "f", arguments: "" } },
              ],
            },
            finish_reason: "length",
          },
        ],
      }),
    );
    expect(chunk?.finishReason).toBe("length");
    expect(chunk?.toolCalls).toHaveLength(1);
  });

  test("falls back to `message` when a gateway sends full messages", () => {
    const chunk = parseChatCompletionChunk(
      frame({ choices: [{ message: { content: "whole" } }] }),
    );
    expect(chunk?.content).toBe("whole");
  });

  test("returns null for non-JSON keep-alive noise", () => {
    expect(parseChatCompletionChunk("ping")).toBeNull();
  });
});

describe("describeUpstreamError", () => {
  test("handles strings, nested errors and codes", () => {
    expect(describeUpstreamError("bad")).toBe("bad");
    expect(describeUpstreamError({ error: { message: "x", code: 429 } })).toBe(
      "x (429)",
    );
    expect(describeUpstreamError({ msg: "denied" })).toBe("denied");
    expect(describeUpstreamError({})).toBe("upstream error");
  });
});
