import { parseCustomModels } from "../app/domain/model/custom";

describe("parseCustomModels", () => {
  test("parses enabled, disabled, provider and display-name syntax", () => {
    expect(
      parseCustomModels(
        "+openai/gpt-new@OpenAI=GPT New,-legacy@Azure,+all",
      ),
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
});
