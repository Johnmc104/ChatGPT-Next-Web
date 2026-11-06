import { parseCustomModels } from "../app/domain/model/custom";

describe("parseCustomModels", () => {
  test("parses enabled, disabled, provider and display-name syntax", () => {
    expect(
      parseCustomModels("+openai/gpt-new@OpenAI=GPT New,-legacy@Azure,+all"),
    ).toEqual({
      models: [
        {
          id: "openai/gpt-new",
          provider: "OpenAI",
          displayName: "GPT New",
          enabled: true,
        },
        {
          id: "legacy",
          provider: "Azure",
          displayName: undefined,
          enabled: false,
        },
        {
          id: "all",
          provider: undefined,
          displayName: undefined,
          enabled: true,
        },
      ],
      errors: [],
    });
  });

  test("reports duplicates and malformed display names", () => {
    const result = parseCustomModels("foo@OpenAI,foo@openai,bar=");
    expect(result.models).toHaveLength(1);
    expect(result.errors).toEqual([
      "模型重复: foo@openai",
      "展示名不能为空: bar=",
    ]);
  });

  test("parses optional #internalName suffix for pricing lookups", () => {
    const result = parseCustomModels("+gpt-mine@OpenAI=My GPT#openai/gpt-4o");
    expect(result.errors).toEqual([]);
    expect(result.models).toEqual([
      {
        id: "gpt-mine",
        provider: "OpenAI",
        displayName: "My GPT",
        internalName: "openai/gpt-4o",
        enabled: true,
      },
    ]);
  });

  test("omits internalName when no #suffix is present", () => {
    const result = parseCustomModels("+gpt-mine@OpenAI=My GPT");
    expect(result.models[0]).not.toHaveProperty("internalName");
  });
});
