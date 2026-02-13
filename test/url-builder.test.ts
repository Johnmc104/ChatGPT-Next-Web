/**
 * @jest-environment node
 */
import {
  normalizeBaseUrl,
  detectBaseUrlEndpoint,
  buildFetchUrl,
  createTimeoutController,
  buildUpstreamHeaders,
  cleanResponseHeaders,
  SKIP_HEADERS,
} from "@/app/api/url-builder";

// --- normalizeBaseUrl ---

describe("normalizeBaseUrl", () => {
  test("adds https:// when no protocol", () => {
    expect(normalizeBaseUrl("api.example.com")).toBe("https://api.example.com");
  });

  test("keeps http:// prefix as-is", () => {
    expect(normalizeBaseUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  test("keeps https:// prefix as-is", () => {
    expect(normalizeBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com",
    );
  });

  test("strips trailing slash", () => {
    expect(normalizeBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
  });

  test("handles both missing protocol and trailing slash", () => {
    expect(normalizeBaseUrl("openrouter.ai/api/")).toBe(
      "https://openrouter.ai/api",
    );
  });
});

// --- detectBaseUrlEndpoint ---

describe("detectBaseUrlEndpoint", () => {
  test("detects /v1/chat/completions", () => {
    expect(
      detectBaseUrlEndpoint("https://openrouter.ai/api/v1/chat/completions"),
    ).toBe("/v1/chat/completions");
  });

  test("detects /v1/models", () => {
    expect(detectBaseUrlEndpoint("https://api.example.com/v1/models")).toBe(
      "/v1/models",
    );
  });

  test("returns empty string for plain URL", () => {
    expect(detectBaseUrlEndpoint("https://api.openai.com")).toBe("");
  });

  test("is case-insensitive", () => {
    expect(
      detectBaseUrlEndpoint("https://api.example.com/V1/Chat/Completions"),
    ).toBe("/v1/chat/completions");
  });
});

// --- buildFetchUrl ---

describe("buildFetchUrl", () => {
  test("simple base + path concatenation", () => {
    const url = buildFetchUrl({
      baseUrl: "https://api.openai.com",
      requestPath: "/v1/chat/completions",
    });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  test("path without leading slash is normalized", () => {
    const url = buildFetchUrl({
      baseUrl: "https://api.openai.com",
      requestPath: "v1/models",
    });
    expect(url).toBe("https://api.openai.com/v1/models");
  });

  test("base URL already contains matching endpoint", () => {
    const url = buildFetchUrl({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      requestPath: "/v1/chat/completions",
    });
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  test("base URL endpoint differs from request path", () => {
    const url = buildFetchUrl({
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      requestPath: "/v1/models",
    });
    expect(url).toBe("https://openrouter.ai/api/v1/models");
  });

  test("appends query string", () => {
    const url = buildFetchUrl({
      baseUrl: "https://api.openai.com",
      requestPath: "/v1/chat/completions",
      queryString: "api-version=2024-01-01",
    });
    expect(url).toBe(
      "https://api.openai.com/v1/chat/completions?api-version=2024-01-01",
    );
  });

  test("adds https:// when base URL has no protocol", () => {
    const url = buildFetchUrl({
      baseUrl: "api.openai.com",
      requestPath: "/v1/chat/completions",
    });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  test("strips trailing slash from base URL", () => {
    const url = buildFetchUrl({
      baseUrl: "https://api.openai.com/",
      requestPath: "/v1/chat/completions",
    });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });
});

// --- createTimeoutController ---

describe("createTimeoutController", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("returns controller, signal, and cleanup", () => {
    const result = createTimeoutController();
    expect(result.controller).toBeInstanceOf(AbortController);
    expect(result.signal).toBe(result.controller.signal);
    expect(typeof result.cleanup).toBe("function");
    result.cleanup();
  });

  test("aborts after default timeout", () => {
    const { signal, cleanup } = createTimeoutController();
    expect(signal.aborted).toBe(false);

    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test("aborts after custom timeout", () => {
    const { signal, cleanup } = createTimeoutController(5000);
    expect(signal.aborted).toBe(false);

    jest.advanceTimersByTime(4999);
    expect(signal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test("cleanup prevents abort", () => {
    const { signal, cleanup } = createTimeoutController(5000);
    cleanup();

    jest.advanceTimersByTime(10000);
    expect(signal.aborted).toBe(false);
  });
});

// --- buildUpstreamHeaders ---

describe("buildUpstreamHeaders", () => {
  test("passes through standard headers", () => {
    const req = new Request("https://example.com", {
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token123",
      },
    });
    const headers = buildUpstreamHeaders(req);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer token123");
  });

  test("strips x-* headers", () => {
    const req = new Request("https://example.com", {
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.2.3.4",
        "x-custom-header": "value",
      },
    });
    const headers = buildUpstreamHeaders(req);
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(headers.get("x-custom-header")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
  });

  test("strips sec-* headers", () => {
    const req = new Request("https://example.com", {
      headers: {
        "sec-fetch-mode": "navigate",
        "sec-ch-ua": "Chrome",
        "content-type": "text/plain",
      },
    });
    const headers = buildUpstreamHeaders(req);
    expect(headers.get("sec-fetch-mode")).toBeNull();
    expect(headers.get("sec-ch-ua")).toBeNull();
    expect(headers.get("content-type")).toBe("text/plain");
  });

  test("strips connection, host, origin, referer, cookie", () => {
    const req = new Request("https://example.com", {
      headers: {
        connection: "keep-alive",
        host: "example.com",
        origin: "https://example.com",
        referer: "https://example.com/",
        cookie: "session=abc123",
        accept: "application/json",
      },
    });
    const headers = buildUpstreamHeaders(req);
    for (const h of ["connection", "host", "origin", "referer", "cookie"]) {
      expect(headers.get(h)).toBeNull();
    }
    expect(headers.get("accept")).toBe("application/json");
  });
});

// --- cleanResponseHeaders ---

describe("cleanResponseHeaders", () => {
  test("removes www-authenticate", () => {
    const headers = new Headers({
      "www-authenticate": 'Basic realm="test"',
      "content-type": "application/json",
    });
    const cleaned = cleanResponseHeaders(headers);
    expect(cleaned.get("www-authenticate")).toBeNull();
    expect(cleaned.get("content-type")).toBe("application/json");
  });

  test("removes content-encoding", () => {
    const headers = new Headers({
      "content-encoding": "br",
      "content-type": "text/plain",
    });
    const cleaned = cleanResponseHeaders(headers);
    expect(cleaned.get("content-encoding")).toBeNull();
  });

  test("sets X-Accel-Buffering to no", () => {
    const headers = new Headers();
    const cleaned = cleanResponseHeaders(headers);
    expect(cleaned.get("X-Accel-Buffering")).toBe("no");
  });

  test("preserves other headers", () => {
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-cache",
    });
    const cleaned = cleanResponseHeaders(headers);
    expect(cleaned.get("content-type")).toBe("application/json");
    expect(cleaned.get("cache-control")).toBe("no-cache");
  });
});
