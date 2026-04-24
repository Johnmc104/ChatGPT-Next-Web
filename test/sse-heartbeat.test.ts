/**
 * Tests for the shared SSE heartbeat wrapper utility.
 * Verifies both passthrough (SSE) and collect (JSON) modes.
 */

// Polyfill Web Streams APIs for Node.js test environment
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream } from "stream/web";

Object.assign(globalThis, { TextEncoder, TextDecoder, ReadableStream });

import {
  wrapWithHeartbeat,
  SSE_HEADERS,
  HEARTBEAT_INTERVAL_MS,
} from "../app/api/utils/sse-heartbeat";

/** Helper to create a ReadableStream from string chunks. */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const chunk of chunks) {
        ctrl.enqueue(encoder.encode(chunk));
      }
      ctrl.close();
    },
  });
}

/** Helper to read an entire stream to string. */
async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("wrapWithHeartbeat", () => {
  describe("collect mode (default)", () => {
    it("should wrap JSON body as SSE data event", async () => {
      const json = JSON.stringify({ data: [{ url: "https://example.com" }] });
      const upstream = streamFromChunks([json]);

      const wrapped = wrapWithHeartbeat(upstream);
      const output = await readStream(wrapped);

      expect(output).toContain(`data: ${json}\n\n`);
      expect(output).toContain("data: [DONE]\n\n");
    });

    it("should handle multi-chunk upstream body", async () => {
      const part1 = '{"data":[{"b64_json":"abc';
      const part2 = 'def"}]}';
      const upstream = streamFromChunks([part1, part2]);

      const wrapped = wrapWithHeartbeat(upstream);
      const output = await readStream(wrapped);

      // Should concatenate chunks into single SSE event
      expect(output).toContain(`data: ${part1}${part2}\n\n`);
      expect(output).toContain("data: [DONE]\n\n");
    });

    it("should handle empty upstream body", async () => {
      const upstream = streamFromChunks([]);
      const wrapped = wrapWithHeartbeat(upstream);
      const output = await readStream(wrapped);

      expect(output).toContain("data: \n\n");
      expect(output).toContain("data: [DONE]\n\n");
    });
  });

  describe("passthrough mode", () => {
    it("should forward SSE events verbatim", async () => {
      const event1 = 'event: partial_image\ndata: {"type":"partial_image"}\n\n';
      const event2 = 'event: completed\ndata: {"type":"completed"}\n\n';
      const upstream = streamFromChunks([event1, event2]);

      const wrapped = wrapWithHeartbeat(upstream, { passthrough: true });
      const output = await readStream(wrapped);

      expect(output).toContain(event1);
      expect(output).toContain(event2);
      // Should NOT wrap in data: ... [DONE] envelope
      expect(output).not.toContain("data: [DONE]");
    });

    it("should handle empty SSE stream", async () => {
      const upstream = streamFromChunks([]);
      const wrapped = wrapWithHeartbeat(upstream, { passthrough: true });
      const output = await readStream(wrapped);

      expect(output).toBe("");
    });
  });

  describe("error handling", () => {
    it("should propagate upstream errors", async () => {
      const upstream = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.error(new Error("upstream failure"));
        },
      });

      const wrapped = wrapWithHeartbeat(upstream);
      const reader = wrapped.getReader();

      await expect(reader.read()).rejects.toThrow("upstream failure");
    });
  });

  describe("constants", () => {
    it("should export correct heartbeat interval", () => {
      expect(HEARTBEAT_INTERVAL_MS).toBe(15_000);
    });

    it("should export correct SSE headers", () => {
      expect(SSE_HEADERS["Content-Type"]).toBe(
        "text/event-stream; charset=utf-8",
      );
      expect(SSE_HEADERS["Cache-Control"]).toBe("no-cache");
      expect(SSE_HEADERS["Connection"]).toBe("keep-alive");
    });
  });
});
