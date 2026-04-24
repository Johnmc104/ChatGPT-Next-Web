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
import { sha256 } from "@/app/utils/hash";

// Mock the server config module
jest.mock("@/app/config/server", () => ({
  getServerSideConfig: jest.fn(),
  getAccessCodeSet: jest.fn(),
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
import { getServerSideConfig, getAccessCodeSet } from "@/app/config/server";

const mockGetServerSideConfig = getServerSideConfig as jest.MockedFunction<
  typeof getServerSideConfig
>;
const mockGetAccessCodeSet = getAccessCodeSet as jest.MockedFunction<
  typeof getAccessCodeSet
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
    needCode: false,
    hideUserApiKey: false,
    baseUrl: "",
    openaiOrgId: "",
    isAzure: false,
    azureUrl: "",
    azureApiKey: "",
    azureApiVersion: "",
    isStability: false,
    stabilityApiKey: "",
    stabilityUrl: "",
    isRAGFlow: false,
    ragflowUrl: "",
    ragflowApiKey: "",
    disableGPT4: false,
    hideBalanceQuery: false,
    disableFastLink: false,
    customModels: "",
    defaultModel: "",
    visionModels: "",
    allowedWebDavEndpoints: [],
    enableMcp: false,
    ...overrides,
  } as ReturnType<typeof getServerSideConfig>;
}

describe("auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessCodeSet.mockResolvedValue(new Set<string>());
  });

  // --- Access Code validation ---

  test("accepts valid access code", async () => {
    const code = "my-secret-code";
    const hashed = await sha256(code);
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: true, apiKey: "sk-test-key-1234567890" }),
    );
    mockGetAccessCodeSet.mockResolvedValue(new Set([hashed]));

    const req = makeRequest(`Bearer ${ACCESS_CODE_PREFIX}${code}`);
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-test-key-1234567890");
  });

  test("rejects wrong access code when code is required", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: true }),
    );
    mockGetAccessCodeSet.mockResolvedValue(new Set(["validhash"]));

    const req = makeRequest(`Bearer ${ACCESS_CODE_PREFIX}wrong-code`);
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("wrong access code");
  });

  test("rejects empty access code when code is required", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: true }),
    );
    mockGetAccessCodeSet.mockResolvedValue(new Set(["validhash"]));

    const req = makeRequest();
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("empty access code");
  });

  test("allows request without code when needCode is false", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ needCode: false, apiKey: "sk-test" }),
    );

    const req = makeRequest();
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-test");
  });

  // --- User API key ---

  test("blocks user API key when hideUserApiKey is true", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ hideUserApiKey: true }),
    );

    const req = makeRequest("Bearer sk-user-provided-key");
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("not allowed to access with your own api key");
  });

  test("allows user API key when hideUserApiKey is false", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ hideUserApiKey: false }),
    );

    const req = makeRequest("Bearer sk-user-provided-key");
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBeUndefined();
  });

  // --- System API key selection by provider ---

  test("returns OpenAI apiKey for GPT provider", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ apiKey: "sk-openai-key" }),
    );

    const req = makeRequest();
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-openai-key");
  });

  test("returns stabilityApiKey for Stability provider", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ stabilityApiKey: "stability-key-789" }),
    );

    const req = makeRequest();
    const result = await auth(req, ModelProvider.Stability);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("stability-key-789");
  });

  // --- Unified proxy fallback ---

  test("falls back to default apiKey when provider key is missing and baseUrl is set", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({
        baseUrl: "https://proxy.example.com",
        apiKey: "sk-unified-proxy-key",
      }),
    );

    const req = makeRequest();
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBe("sk-unified-proxy-key");
  });

  test("returns error when no API key is available", async () => {
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({ apiKey: "" }),
    );

    const req = makeRequest();
    const result = await auth(req, ModelProvider.GPT);

    expect(result.error).toBe(true);
    expect(result.msg).toContain("not configured");
  });

  // --- Access code bypasses system key when user provides own key ---

  test("user key passes through even when needCode and system key configured", async () => {
    const code = "valid";
    const hashed = await sha256(code);
    mockGetServerSideConfig.mockReturnValue(
      makeConfig({
        needCode: true,
        apiKey: "sk-system-key",
      }),
    );
    mockGetAccessCodeSet.mockResolvedValue(new Set([hashed]));

    // User sends their own API key (no access code prefix)
    const req = makeRequest("Bearer sk-user-own-key-1234");
    const result = await auth(req, ModelProvider.GPT);

    // Should pass - user key is accepted (bypasses code check)
    expect(result.error).toBe(false);
    expect(result.systemApiKey).toBeUndefined();
  });
});
