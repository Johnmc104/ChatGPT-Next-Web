/**
 * @jest-environment node
 */
/**
 * Tests for resolveAuthHeaderValue() — the auth header priority chain
 * used by requestOpenai() to decide what credentials to send upstream.
 */
import { NextRequest } from "next/server";

// Mock modules that common.ts imports at top level
jest.mock("@/app/config/server", () => ({
  getServerSideConfig: jest.fn().mockReturnValue({
    apiKey: "",
    codes: new Set<string>(),
    needCode: false,
    hideUserApiKey: false,
    isEnableRAG: false,
  }),
}));

jest.mock("@/app/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    keyInfo: jest.fn(),
  },
}));

import { resolveAuthHeaderValue } from "@/app/api/common";
import type { AuthResult } from "@/app/api/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.com/api/chat", { headers });
}

function authOk(systemApiKey?: string): AuthResult {
  return { error: false, systemApiKey };
}

// ---------------------------------------------------------------------------
// Priority 1 — User-provided API key (X-User-Api-Key header)
// ---------------------------------------------------------------------------

describe("resolveAuthHeaderValue", () => {
  describe("Priority 1: user API key", () => {
    it("uses X-User-Api-Key with Bearer prefix by default", () => {
      const req = makeReq({ "X-User-Api-Key": "sk-user-123" });
      expect(resolveAuthHeaderValue(req)).toBe("Bearer sk-user-123");
    });

    it("uses X-User-Api-Key without Bearer when isBearer=false", () => {
      const req = makeReq({ "X-User-Api-Key": "sk-user-123" });
      expect(
        resolveAuthHeaderValue(req, undefined, { isBearer: false }),
      ).toBe("sk-user-123");
    });

    it("takes precedence over systemApiKey", () => {
      const req = makeReq({ "X-User-Api-Key": "sk-user" });
      expect(resolveAuthHeaderValue(req, authOk("sk-system"))).toBe(
        "Bearer sk-user",
      );
    });

    it("is skipped when ignoreUserApiKey=true", () => {
      const req = makeReq({ "X-User-Api-Key": "sk-user" });
      expect(
        resolveAuthHeaderValue(req, authOk("sk-system"), {
          ignoreUserApiKey: true,
        }),
      ).toBe("Bearer sk-system");
    });
  });

  // ---------------------------------------------------------------------------
  // Priority 2 — System API key from authResult
  // ---------------------------------------------------------------------------

  describe("Priority 2: system API key", () => {
    it("uses systemApiKey with Bearer prefix", () => {
      const req = makeReq();
      expect(resolveAuthHeaderValue(req, authOk("sk-server"))).toBe(
        "Bearer sk-server",
      );
    });

    it("uses systemApiKey without Bearer when isBearer=false", () => {
      const req = makeReq();
      expect(
        resolveAuthHeaderValue(req, authOk("sk-server"), { isBearer: false }),
      ).toBe("sk-server");
    });

    it("is skipped when systemApiKey is undefined", () => {
      const req = makeReq({ Authorization: "Bearer sk-fallback" });
      expect(resolveAuthHeaderValue(req, authOk(undefined))).toBe(
        "Bearer sk-fallback",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Priority 3 — Fallback to original Authorization header
  // ---------------------------------------------------------------------------

  describe("Priority 3: fallback to original header", () => {
    it("forwards the original Authorization header", () => {
      const req = makeReq({ Authorization: "Bearer sk-real-key" });
      expect(resolveAuthHeaderValue(req)).toBe("Bearer sk-real-key");
    });

    it("uses custom headerName when specified", () => {
      const req = makeReq({ "api-key": "azure-key-123" });
      expect(
        resolveAuthHeaderValue(req, undefined, { headerName: "api-key" }),
      ).toBe("azure-key-123");
    });

    it("falls back to Authorization when custom headerName is absent", () => {
      const req = makeReq({ Authorization: "Bearer sk-default" });
      expect(
        resolveAuthHeaderValue(req, undefined, { headerName: "api-key" }),
      ).toBe("Bearer sk-default");
    });

    it("returns empty string when no headers present", () => {
      const req = makeReq();
      expect(resolveAuthHeaderValue(req)).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // Safety — never forward access codes upstream
  // ---------------------------------------------------------------------------

  describe("Safety: access code filtering", () => {
    it("blocks nk- prefixed tokens", () => {
      const req = makeReq({ Authorization: "Bearer nk-abc123" });
      expect(resolveAuthHeaderValue(req)).toBe("");
    });

    it("blocks ACCESS_CODE_PREFIX tokens (nk-)", () => {
      const req = makeReq({ Authorization: "nk-mycode" });
      expect(resolveAuthHeaderValue(req)).toBe("");
    });

    it("does not block real API keys", () => {
      const req = makeReq({ Authorization: "Bearer sk-proj-abc123" });
      expect(resolveAuthHeaderValue(req)).toBe("Bearer sk-proj-abc123");
    });
  });
});
