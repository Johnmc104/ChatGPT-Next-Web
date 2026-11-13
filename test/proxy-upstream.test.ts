/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { ModelProvider } from "@/app/constant";

const fetchWithRetry = jest.fn();
// `var` (hoisted): common.ts reads the config at import time, before this
// initializer runs; the factory below tolerates that.
var mockServerConfig = {
  baseUrl: "https://gateway.example.com",
  ragflowUrl: "https://ragflow.example.com",
  needCode: false,
};

jest.mock("@/app/config/server", () => ({
  getServerSideConfig: () => mockServerConfig ?? {},
}));
jest.mock("@/app/api/auth", () => ({
  auth: jest.fn(),
  checkAccessCode: jest.fn(),
}));
jest.mock("@/app/api/url-builder", () => ({
  ...jest.requireActual("@/app/api/url-builder"),
  fetchWithRetry: (...args: unknown[]) => fetchWithRetry(...args),
}));
jest.mock("@/app/utils/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { auth, checkAccessCode } from "@/app/api/auth";
import { handle, resolveUpstream } from "@/app/api/proxy";

const authMock = auth as jest.Mock;
const checkAccessCodeMock = checkAccessCode as jest.Mock;
const gptTarget = {
  serverBaseUrl: "https://gateway.example.com",
  provider: ModelProvider.GPT,
  allowClientBaseUrl: true,
};

function request(headers: Record<string, string>) {
  return new NextRequest("https://site.test/api/proxy/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: "m" }),
  });
}

async function proxied(headers: Record<string, string>) {
  fetchWithRetry.mockResolvedValue(new Response("{}", { status: 200 }));
  const res = await handle(request(headers), {
    params: Promise.resolve({ path: ["v1", "chat", "completions"] }),
  });
  const call = fetchWithRetry.mock.calls.at(-1);
  return {
    res,
    url: call?.[0] as string | undefined,
    headers: call?.[1]?.headers as Headers | undefined,
  };
}

beforeEach(() => {
  fetchWithRetry.mockReset();
  authMock.mockReset();
  checkAccessCodeMock.mockReset();
  mockServerConfig.needCode = false;
});

describe("resolveUpstream", () => {
  test("uses the server upstream when the client names none", () => {
    expect(resolveUpstream(null, gptTarget)).toEqual({
      baseUrl: "https://gateway.example.com",
      trusted: true,
    });
  });

  test("treats a client-chosen upstream as untrusted", () => {
    expect(resolveUpstream("https://evil.example", gptTarget)).toEqual({
      baseUrl: "https://evil.example",
      trusted: false,
    });
  });

  test("trusts a client URL equal to the server upstream", () => {
    expect(
      resolveUpstream("https://gateway.example.com/", gptTarget),
    ).toMatchObject({ trusted: true });
  });

  test("ignores the client URL when overrides are not allowed", () => {
    expect(
      resolveUpstream("https://evil.example", {
        ...gptTarget,
        allowClientBaseUrl: false,
      }),
    ).toEqual({ baseUrl: "https://gateway.example.com", trusted: true });
  });

  test("rejects a missing server upstream", () => {
    expect(
      resolveUpstream(null, { ...gptTarget, serverBaseUrl: "" }),
    ).toHaveProperty("error");
  });
});

describe("proxy handle", () => {
  test("never sends the server key to a client-chosen upstream", async () => {
    authMock.mockResolvedValue({ error: false, systemApiKey: "server-secret" });
    const { url, headers } = await proxied({
      Authorization: "Bearer nk-code",
      "X-Base-URL": "https://evil.example",
    });
    expect(url).toBe("https://evil.example/v1/chat/completions");
    expect(headers?.get("Authorization")).toBeNull();
    expect(JSON.stringify([...headers!.entries()])).not.toContain(
      "server-secret",
    );
    expect(JSON.stringify([...headers!.entries()])).not.toContain("nk-code");
  });

  test("forwards the user's own key to a client-chosen upstream", async () => {
    authMock.mockResolvedValue({ error: false });
    const { headers } = await proxied({
      Authorization: "Bearer sk-user",
      "X-User-Api-Key": "sk-user",
      "X-Base-URL": "https://custom.example",
    });
    expect(headers?.get("Authorization")).toBe("Bearer sk-user");
  });

  test("uses the server key for the server upstream", async () => {
    authMock.mockResolvedValue({ error: false, systemApiKey: "server-secret" });
    const { url, headers } = await proxied({
      Authorization: "Bearer nk-code",
    });
    expect(url).toBe("https://gateway.example.com/v1/chat/completions");
    expect(headers?.get("Authorization")).toBe("Bearer server-secret");
  });

  test("rejects unauthorized requests before contacting upstream", async () => {
    authMock.mockResolvedValue({ error: true, code: "missing-code" });
    const { res } = await proxied({ "X-Base-URL": "https://evil.example" });
    expect(res.status).toBe(401);
    expect(fetchWithRetry).not.toHaveBeenCalled();
  });
});

describe("[provider] route for RAGFlow", () => {
  test("goes to RAGFLOW_URL with RAGFlow auth, ignoring X-Base-URL", async () => {
    const { POST } = await import("@/app/api/[provider]/[...path]/route");
    authMock.mockResolvedValue({ error: false, systemApiKey: "ragflow-key" });
    fetchWithRetry.mockResolvedValue(new Response("{}", { status: 200 }));
    await POST(
      new NextRequest("https://site.test/api/ragflow/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer nk-code",
          "X-Base-URL": "https://evil.example",
        },
        body: "{}",
      }),
      {
        params: Promise.resolve({
          provider: "ragflow",
          path: ["v1", "chat", "completions"],
        }),
      },
    );
    expect(authMock).toHaveBeenCalledWith(
      expect.anything(),
      ModelProvider.RAGFlow,
    );
    const [url, init] = fetchWithRetry.mock.calls[0];
    expect(url).toBe("https://ragflow.example.com/v1/chat/completions");
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer ragflow-key",
    );
  });
});

describe("custom upstreams when the site requires an access code", () => {
  beforeEach(() => {
    mockServerConfig.needCode = true;
    authMock.mockResolvedValue({ error: false });
  });

  test("a user key alone cannot relay to a client-chosen upstream", async () => {
    checkAccessCodeMock.mockResolvedValue("missing");
    const { res } = await proxied({
      Authorization: "Bearer sk-anything",
      "X-Base-URL": "https://relay-target.example",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "missing-code" });
    expect(fetchWithRetry).not.toHaveBeenCalled();
  });

  test("an invalid access code is rejected", async () => {
    checkAccessCodeMock.mockResolvedValue("invalid");
    const { res } = await proxied({
      "X-Access-Code": "wrong",
      "X-Base-URL": "https://custom.example",
    });
    expect(await res.json()).toMatchObject({ code: "invalid-code" });
  });

  test("a valid access code plus user key reaches the custom upstream without the code", async () => {
    checkAccessCodeMock.mockResolvedValue("valid");
    const { url, headers } = await proxied({
      Authorization: "Bearer sk-user",
      "X-User-Api-Key": "sk-user",
      "X-Access-Code": "code",
      "X-Base-URL": "https://custom.example",
    });
    expect(url).toBe("https://custom.example/v1/chat/completions");
    expect(headers?.get("Authorization")).toBe("Bearer sk-user");
    expect(headers?.has("X-Access-Code")).toBe(false);
  });

  test("the server's own upstream does not need the extra check", async () => {
    const { res } = await proxied({ Authorization: "Bearer sk-user" });
    expect(res.status).toBe(200);
    expect(checkAccessCodeMock).not.toHaveBeenCalled();
  });
});
