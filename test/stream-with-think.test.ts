/**
 * streamWithThink end-to-end over a scripted fetchEventSource: verifies that
 * every request ends in exactly one of onFinish / onError, with a reason.
 */

let handlers: any;

jest.mock("@fortaine/fetch-event-source", () => ({
  EventStreamContentType: "text/event-stream",
  fetchEventSource: jest.fn((_url: string, options: any) => {
    handlers = options;
    return Promise.resolve();
  }),
}));
jest.mock("@/app/store", () => ({}));
jest.mock("@/app/utils/model-detection", () => ({
  getTimeoutMSByModel: () => 120_000,
}));

import Locale from "../app/locales";
import { parseChatCompletionChunk } from "../app/domain/chat/sse";
import {
  streamWithThink,
  USER_ABORT_MESSAGE,
  type StreamChunk,
} from "../app/services/chat/stream";

function parse(data: string, _tools: any[], event?: string): StreamChunk {
  const chunk = parseChatCompletionChunk(data, event);
  return chunk ?? {};
}

function sseResponse(status = 200, contentType = "text/event-stream") {
  // jsdom has no Response; provide the parts streamWithThink reads.
  const body = status === 200 ? "" : '{"error":{"message":"nope"}}';
  const res = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body,
    clone: () => res,
  };
  return res;
}

const delta = (d: Record<string, unknown>, finish?: string) => ({
  data: JSON.stringify({
    choices: [{ delta: d, ...(finish ? { finish_reason: finish } : {}) }],
  }),
});

function start(controller = new AbortController()) {
  const options = {
    messages: [],
    config: { model: "m" },
    onUpdate: jest.fn(),
    onFinish: jest.fn(),
    onError: jest.fn(),
  } as any;
  streamWithThink(
    "/chat",
    { model: "m", messages: [] },
    {},
    [],
    {},
    controller,
    parse,
    () => {},
    options,
  );
  return { options, controller };
}

afterEach(() => {
  jest.useRealTimers();
  handlers = undefined;
});

test("finishes with reasoning and answer text", async () => {
  const { options } = start();
  await handlers.onopen(sseResponse());
  handlers.onmessage(delta({ reasoning_content: "think" }));
  handlers.onmessage(delta({ content: "Answer" }, "stop"));
  handlers.onmessage({ data: "[DONE]" });
  handlers.onclose();

  expect(options.onError).not.toHaveBeenCalled();
  expect(options.onFinish).toHaveBeenCalledTimes(1);
  const text = options.onFinish.mock.calls[0][0];
  expect(text).toContain("<!--THINKING-->\n> think");
  expect(text).toContain("<!--/THINKING-->");
  expect(text.endsWith("Answer")).toBe(true);
});

test("reports an error frame inside a 200 stream instead of empty", async () => {
  const { options } = start();
  await handlers.onopen(sseResponse());
  handlers.onmessage({
    data: JSON.stringify({
      error: { message: "Our servers are currently overloaded." },
    }),
  });
  handlers.onclose();

  expect(options.onFinish).not.toHaveBeenCalled();
  expect(options.onError).toHaveBeenCalledTimes(1);
  expect(options.onError.mock.calls[0][0].message).toBe(
    "Our servers are currently overloaded.",
  );
});

test("explains an empty answer cut off by the length limit", async () => {
  const { options } = start();
  await handlers.onopen(sseResponse());
  handlers.onmessage(delta({ reasoning_content: "long reasoning" }));
  handlers.onmessage(delta({}, "length"));
  handlers.onmessage({ data: "[DONE]" });

  expect(options.onFinish).not.toHaveBeenCalled();
  expect(options.onError.mock.calls[0][0].message).toBe(
    Locale.Chat.Stream.Length,
  );
  // The reasoning that did arrive is still rendered.
  expect(options.onUpdate).toHaveBeenCalled();
});

test("reports an empty stream with its finish_reason", async () => {
  const { options } = start();
  await handlers.onopen(sseResponse());
  handlers.onmessage(delta({}, "content_filter"));
  handlers.onclose();

  expect(options.onError.mock.calls[0][0].message).toBe(
    Locale.Chat.Stream.Empty("content_filter"),
  );
});

test("reports a non-2xx response with the upstream message", async () => {
  const { options } = start();
  await handlers.onopen(sseResponse(429, "application/json"));
  handlers.onclose();

  expect(options.onFinish).not.toHaveBeenCalled();
  expect(options.onError.mock.calls[0][0].message).toBe(
    Locale.Chat.Stream.HttpError(429, "nope"),
  );
});

test("a user stop before any text is reported as an abort", async () => {
  const { options, controller } = start();
  await handlers.onopen(sseResponse());
  controller.abort();

  expect(options.onFinish).not.toHaveBeenCalled();
  expect(options.onError.mock.calls[0][0].message).toBe(USER_ABORT_MESSAGE);
});

test("a user stop after some text keeps the partial answer", async () => {
  const { options, controller } = start();
  await handlers.onopen(sseResponse());
  handlers.onmessage(delta({ content: "partial" }));
  controller.abort();

  expect(options.onError).not.toHaveBeenCalled();
  expect(options.onFinish.mock.calls[0][0]).toBe("partial");
});

test("a connect timeout is reported as a timeout", () => {
  jest.useFakeTimers();
  const { options } = start();
  jest.advanceTimersByTime(120_000);

  expect(options.onError.mock.calls[0][0].message).toBe(
    Locale.Chat.Stream.Timeout(120),
  );
});

test("raw <think> tags are rendered as reasoning", async () => {
  const { options } = start();
  await handlers.onopen(sseResponse());
  handlers.onmessage(delta({ content: "<think>plan" }));
  handlers.onmessage(delta({ content: " more</think>Result" }));
  handlers.onmessage({ data: "[DONE]" });

  const text = options.onFinish.mock.calls[0][0];
  expect(text).toContain("<!--THINKING-->\n> plan more");
  expect(text.endsWith("Result")).toBe(true);
});
