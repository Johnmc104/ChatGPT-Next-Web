import {
  normalizeEndpointUrl,
  validateEndpointUrl,
} from "../app/domain/endpoint/config";

describe("endpoint configuration", () => {
  test("keeps relative proxy paths and strips trailing slashes", () => {
    expect(normalizeEndpointUrl("/api/openai///")).toBe("/api/openai");
    expect(validateEndpointUrl("/api/openai/")).toEqual({
      valid: true,
      normalized: "/api/openai",
    });
  });

  test("normalizes a host without a protocol", () => {
    expect(normalizeEndpointUrl("api.example.com/")).toBe(
      "https://api.example.com",
    );
  });

  test.each([
    ["", "required"],
    ["ftp://api.example.com", "protocol"],
    ["https://user:pass@example.com", "credentials"],
    ["https://[bad", "invalid"],
  ])("rejects %s as %s", (value, code) => {
    expect(validateEndpointUrl(value)).toEqual({ valid: false, code });
  });
});
