import {
  modelSelectionMatches,
  resolveModelSelection,
} from "../app/domain/model/selection";

const models = [
  {
    name: "openai/gpt-4o-mini",
    available: true,
    sorted: 1,
    provider: { id: "openai", providerName: "OpenAI", sorted: 1 },
  },
  {
    name: "gpt-4o-mini",
    available: true,
    sorted: 2,
    provider: { id: "azure", providerName: "Azure", sorted: 2 },
  },
] as const;

describe("resolveModelSelection", () => {
  test("maps a bare model alias to the unique built-in model", () => {
    const selection = resolveModelSelection("openai/gpt-4o-mini", [models[0]]);
    expect(selection).toEqual({
      model: "openai/gpt-4o-mini",
      providerName: "OpenAI",
      providerId: "openai",
    });
  });

  test("keeps provider-specific aliases distinct", () => {
    const selection = resolveModelSelection("gpt-4o-mini@Azure", models);
    expect(selection.model).toBe("gpt-4o-mini");
    expect(selection.providerName).toBe("Azure");
    expect(modelSelectionMatches(selection, models[1])).toBe(true);
    expect(modelSelectionMatches(selection, models[0])).toBe(false);
  });

  test("preserves unknown custom model IDs", () => {
    expect(resolveModelSelection("my-model@custom", models)).toEqual({
      model: "my-model",
      providerName: "custom",
    });
  });
});
