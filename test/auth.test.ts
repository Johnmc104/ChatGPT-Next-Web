/**
 * @jest-environment node
 */
/**
 * Tests for the auth module.
 *
 * We mock getServerSideConfig to control the configuration and test
 * the auth() function's behaviour without needing actual env variables.
 */
import { NextRequest } from "next/server";
import { ACCESS_CODE_PREFIX, ModelProvider } from "@/app/constant";
import md5 from "spark-md5";

// Mock the server config module
jest.mock("@/app/config/server", () => ({
  getServerSideConfig: jest.fn(),
}));

// Mock the logger to suppress output in tests
jest.mock("@/app/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    keyInfo: jest.fn(),
  },
}));

import { auth, AuthResult } from "@/app/api/auth";
import { getServerSideConfig } from "@/app/config/server";

const mockGetServerSideConfig = getServerSideConfig as jest.MockedFunction<
  typeof getServerSideConfig
>;

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  return new NextRequest("https://example.com/api/chat", { headers });
}

function makeConfig(overrides: Partial<ReturnType<typeof getServerSideConfig>> = {}) {
  return {
    apiKey: "",
    codes: new Set<string>(),
    needCode: false,
    hideUserApiKey: false,
    baseUrl: "",
    isAzure: false,
    azureUrl: "",
    azureApiKey: "",
    azureApiVersion: "",
    googleApiKey: "",
    googleUrl: "",
    anthropicApiKey: "",
    anthropicUrl: "",
    anthropicApiVersion: "",
    baiduUrl: "",
    baiduApiKey: "",
    baiduSecretKey: "",
    bytedanceApiKey: "",
    bytedanceUrl: "",
    alibabaUrl: "",
    alibabaApiKey: "",
    tencentUrl: "",
    tencentSecretKey: "",
    tencentSecretId: "",
    moonshotApiKey: "",
    moonshotUrl: "",
    iflytekApiKey: "",
    iflytekApiSecret: "",
    iflytekUrl: "",
    deepseekApiKey: "",
    deepseekUrl: "",
    xaiApiKey: "",
    xaiUrl: "",
    chatglmApiKey: "",
    chatglmUrl: "",
    siliconFlowApiKey: "",
    siliconFlowUrl: "",
    ai302ApiKey: "",
    ai302Url: "",
    stabilityApiKey: "",
    stabilityUrl: "",
    disableGPT4: false,
    enableBalanceQuery: false,
    disableFastLink: false,
    customModels: "",
    defaultModel: "",
    visionModels: "",
    whiteWebDevEndpoints: [],
    defaultInputTemplate: "",
    enableMcp: false,
    ...overrides,
  } as ReturnType<typeof getServerSideConfig>;
}

describe("auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Access Code validation ---

  test("accepts valid access code", () => {
    const code = "my-secret-code";
    const hashed = md5.hash(code);
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: true, codes: new Set([hashed]), apiKey: "sk-test-key-1234567890" }),
    );

    const req = makeRequest(`Bearer ${ACCESS_CODE_PREFIX}${code}`);
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-test-key-1234567890");
  });

  test("rejects wrong access code when code is required", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: true, codes: new Set(["validhash"]) }),
    );

    const req = makeRequest(`Bearer ${ACCESS_CODE_PREFIX}wrong-code`);
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("wrong access code");
  });

  test("rejects empty access code when code is required", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: true, codes: new Set(["validhash"]) }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("empty access code");
  });

  test("allows request without code when needCode is false", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: false, apiKey: "sk-test" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-test");
  });

  // --- User API key ---

  test("blocks user API key when hideUserApiKey is true", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ hideUserApiKey: true }),
    );

    const req = makeRequest("Bearer sk-user-provided-key");
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("not allowed to access with your own api key");
  });

  test("allows user API key when hideUserApiKey is false", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ hideUserApiKey: false }),
    );

    const req = makeRequest("Bearer sk-user-provided-key");
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBeUndefined();
  });

  // --- System API key selection by provider ---

  test("returns OpenAI apiKey for GPT provider", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ apiKey: "sk-openai-key" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-openai-key");
  });

  test("returns googleApiKey for GeminiPro provider", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ googleApiKey: "google-key-123" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.GeminiPro);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("google-key-123");
  });

  test("returns anthropicApiKey for Claude provider", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ anthropicApiKey: "claude-key-456" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.Claude);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("claude-key-456");
  });

  test("returns stabilityApiKey for Stability provider", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ stabilityApiKey: "stability-key-789" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.Stability);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("stability-key-789");
  });

  test("returns baiduApiKey for Ernie provider", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ baiduApiKey: "baidu-key" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.Ernie);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("baidu-key");
  });

  test("returns combined iflytek key:secret for Iflytek provider", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ iflytekApiKey: "iflytek-key", iflytekApiSecret: "iflytek-secret" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.Iflytek);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("iflytek-key:iflytek-secret");
  });

  // --- Unified proxy fallback ---

  test("falls back to default apiKey when provider key is missing and baseUrl is set", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({
        baseUrl: "https://proxy.example.com",
        apiKey: "sk-unified-proxy-key",
        googleApiKey: "", // no provider-specific key
      }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.GeminiPro);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-unified-proxy-key");
  });

  test("returns error when no API key is available", () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ apiKey: "", googleApiKey: "" }),
    );

    const req = makeRequest();
    const result = auth(req, ModelProvider.GeminiPro);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("not configured");
  });

  // --- Access code bypasses system key when user provides own key ---

  test("user key passes through even when needCode and system key configured", () => {
    const code = "valid";
    const hashed = md5.hash(code);
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({
        needCode: true,
        codes: new Set([hashed]),
        apiKey: "sk-system-key",
      }),
    );

    // User sends their own API key (no access code prefix)
    const req = makeRequest("Bearer sk-user-own-key-1234");
    const result = auth(req, ModelProvider.GPT);

    // Should pass - user key is accepted (bypasses code check)
    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBeUndefined();
  });
});
