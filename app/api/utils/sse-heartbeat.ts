/**
 * Shared SSE heartbeat wrapper for long-running upstream requests.
 *
 * Prevents Cloudflare and other reverse proxies from timing out by
 * emitting `: heartbeat\n\n` comments at regular intervals while
 * waiting for the upstream response body.
 *
 * Two modes:
 *   a) Passthrough — upstream returns SSE (`text/event-stream`):
 *      forward each chunk with interleaved heartbeats.
 *   b) Collect — upstream returns JSON: gather full body,
 *      then wrap as `data: <json>\n\ndata: [DONE]\n\n`.
 */

export const HEARTBEAT_INTERVAL_MS = 15_000;

export interface HeartbeatWrapOptions {
  /** If true, forward upstream chunks directly (SSE passthrough mode). */
  passthrough?: boolean;
}

/**
 * Wrap a ReadableStream with SSE heartbeat comments.
 *
 * @param upstream - The upstream response body stream.
 * @param options  - `passthrough: true` for SSE passthrough; default is collect mode.
 * @returns A new ReadableStream that emits heartbeats + the payload as SSE events.
 */
export function wrapWithHeartbeat(
  upstream: ReadableStream<Uint8Array>,
  options?: HeartbeatWrapOptions,
): ReadableStream<Uint8Array> {
  const isPassthrough = options?.passthrough ?? false;

  return new ReadableStream({
    async start(ctrl) {
      const encoder = new TextEncoder();
      const heartbeat = encoder.encode(": heartbeat\n\n");

      const timer = setInterval(() => {
        try {
          ctrl.enqueue(heartbeat);
        } catch {
          clearInterval(timer);
        }
      }, HEARTBEAT_INTERVAL_MS);

      try {
        const reader = upstream.getReader();

        if (isPassthrough) {
          // --- Passthrough mode ---
          // Forward each upstream chunk directly (preserving SSE events),
          // heartbeats are interleaved by the timer above.
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) ctrl.enqueue(value);
          }
          clearInterval(timer);
          ctrl.close();
        } else {
          // --- Collect mode ---
          // Gather full upstream body, wrap as single SSE data event.
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }

          clearInterval(timer);

          // Concatenate chunks
          const totalLen = chunks.reduce((n, c) => n + c.length, 0);
          const body = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.length;
          }

          // Send the actual payload as an SSE data event
          const payload = new TextDecoder().decode(body);
          ctrl.enqueue(encoder.encode(`data: ${payload}\n\n`));
          ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
          ctrl.close();
        }
      } catch (e) {
        clearInterval(timer);
        ctrl.error(e);
      }
    },
  });
}

/** Standard SSE response headers. */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
