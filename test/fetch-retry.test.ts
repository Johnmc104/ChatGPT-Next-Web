/**
 * @jest-environment node
 */
import { fetchWithRetry } from "../app/api/url-builder";

// ── Helpers ─────────────────────────────────────────────────────────────────

let fetchMock: jest.SpyInstance;

beforeEach(() => {
  fetchMock = jest.spyOn(global, "fetch");
});

afterEach(() => {
  fetchMock.mockRestore();
});

function jsonResponse(body: object, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function streamResponse(status = 200) {
  return new Response("data: hello\n\n", {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("fetchWithRetry", () => {
  it("returns immediately on 200 success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await fetchWithRetry("https://api.test/v1/chat", {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns immediately on 4xx non-retryable error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad" }, 400));

    const res = await fetchWithRetry("https://api.test/v1/chat", {});
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 rate limit and succeeds on second attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate limit" }, 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 3,
      baseDelayMs: 10, // fast for tests
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 502 Bad Gateway", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "bad gateway" }, 502))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 2,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 Service Unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 2,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns last error response when all retries exhausted", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate limit" }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: "rate limit" }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: "rate limit" }, 429));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 3,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry streaming responses (even on retryable status)", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(200));

    const res = await fetchWithRetry("https://api.test/v1/chat", {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network error and succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 2,
      baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on AbortError (no retry)", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abortError);

    await expect(
      fetchWithRetry("https://api.test/v1/chat", {}, {
        maxAttempts: 3,
        baseDelayMs: 10,
      }),
    ).rejects.toThrow("aborted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after all network retries exhausted", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      fetchWithRetry("https://api.test/v1/chat", {}, {
        maxAttempts: 2,
        baseDelayMs: 10,
      }),
    ).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects custom retryableStatuses", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "custom" }, 418))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 2,
      baseDelayMs: 10,
      retryableStatuses: [418],
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maxAttempts=1 means no retries", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "rate limit" }, 429));

    const res = await fetchWithRetry("https://api.test/v1/chat", {}, {
      maxAttempts: 1,
    });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
