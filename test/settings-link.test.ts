import {
  parseSettingsLink,
  previewSettingsLink,
} from "../app/domain/settings/link";

const parse = (value: unknown) => parseSettingsLink(JSON.stringify(value));

describe("settings link import", () => {
  test("accepts legacy endpoint links and normalizes their URL", () => {
    expect(parse({ url: "api.example.com/", key: " test-key " })).toEqual({
      ok: true,
      value: {
        version: 1,
        provider: "OpenAI",
        url: "https://api.example.com",
        key: "test-key",
      },
    });
  });

  test("model-only links do not implicitly switch endpoints", () => {
    expect(
      parse({
        version: 1,
        customModels: "gateway-model@OpenAI=Local",
        defaultModel: "gateway-model",
      }),
    ).toEqual({
      ok: true,
      value: {
        version: 1,
        customModels: "gateway-model@OpenAI=Local",
        defaultModel: "gateway-model",
      },
    });
    expect(parse({ customModels: "" })).toEqual({
      ok: true,
      value: { version: 1, customModels: "" },
    });
  });

  test.each([
    [null, "invalid"],
    [[], "invalid"],
    [{}, "invalid"],
    [{ version: 2, url: "/api/openai" }, "version"],
    [{ key: 42 }, "invalid"],
    [{ key: "" }, "invalid"],
    [{ unknown: "value" }, "invalid"],
    [{ provider: "Unknown" }, "provider"],
    [{ url: "//evil.example" }, "url"],
    [{ url: "javascript:alert(1)" }, "url"],
    [{ url: "https://user:password@example.com" }, "url"],
    [{ customModels: "model,model" }, "models"],
    [{ defaultModel: "model@" }, "models"],
  ])(
    "rejects invalid payload %# without echoing its contents",
    (payload, error) => {
      expect(parse(payload)).toEqual({ ok: false, error });
    },
  );

  test("preview masks the entire key and URL query/fragment", () => {
    const preview = previewSettingsLink({
      version: 1,
      key: "secret",
      url: "https://example.com/v1?token=hidden#private",
    });
    expect(preview).not.toMatch(/secret|hidden|private/);
    expect(preview).toContain("https://example.com/v1");
  });
});
