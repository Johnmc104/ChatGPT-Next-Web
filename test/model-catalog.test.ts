import {
  collectModelsWithDefaultModel,
  resolveConfiguredModel,
  retainSelectedModel,
} from "../app/utils/model";

const models = [
  {
    name: "openai/gpt-4o-mini",
    available: true,
    sorted: 1,
    provider: { id: "openai", providerName: "OpenAI", sorted: 1 },
  },
];

test("refreshed catalogs with the same length do not reuse stale records", () => {
  expect(collectModelsWithDefaultModel(models, "", "")[0].name).toBe(
    "openai/gpt-4o-mini",
  );
  const replacement = [{ ...models[0], name: "new-model" }];
  expect(collectModelsWithDefaultModel(replacement, "", "")[0].name).toBe(
    "new-model",
  );
});

test("default markers never leak between collections", () => {
  expect(
    collectModelsWithDefaultModel(models, "", "gpt-4o-mini")[0].isDefault,
  ).toBe(true);
  expect(
    collectModelsWithDefaultModel(models, "", "")[0].isDefault,
  ).toBeUndefined();
});

test("explicit upstream IDs and provider-specific aliases resolve consistently", () => {
  expect(
    resolveConfiguredModel(
      "gpt-4o-mini",
      models,
      "gpt-4o-mini@OpenAI=Deployment",
      "",
      "OpenAI",
    ).model,
  ).toBe("gpt-4o-mini");
  expect(
    resolveConfiguredModel("gpt-4o-mini", models, "", "", "OpenAI").model,
  ).toBe("openai/gpt-4o-mini");
  expect(
    resolveConfiguredModel(
      "deploy",
      models,
      "deploy@OpenAI,deploy@Azure",
      "",
      "Azure",
    ),
  ).toMatchObject({ model: "deploy", providerName: "Azure" });
});

test("server rules retain precedence and custom display names never replace IDs", () => {
  const records = collectModelsWithDefaultModel(
    models,
    "deploy@OpenAI=Work,deploy@Azure=Azure Work",
    "deploy@Azure",
    "-deploy@OpenAI",
  );
  expect(
    records.map(
      ({ name, displayName, provider, available, source, isDefault }) => ({
        name,
        displayName,
        provider: provider.providerName,
        available,
        source,
        isDefault: !!isDefault,
      }),
    ),
  ).toMatchInlineSnapshot(`
[
  {
    "available": true,
    "displayName": "Azure Work",
    "isDefault": true,
    "name": "deploy",
    "provider": "Azure",
    "source": "custom",
  },
  {
    "available": false,
    "displayName": "Work",
    "isDefault": false,
    "name": "deploy",
    "provider": "OpenAI",
    "source": "server",
  },
  {
    "available": true,
    "displayName": "openai/gpt-4o-mini",
    "isDefault": false,
    "name": "openai/gpt-4o-mini",
    "provider": "OpenAI",
    "source": "builtin",
  },
]
`);
});

test("missing persisted selections remain visible but unavailable", () => {
  const visible = retainSelectedModel(
    collectModelsWithDefaultModel(models, "", ""),
    "retired",
    "Azure",
  );
  expect(visible.find((m) => m.name === "retired")).toMatchObject({
    available: false,
    source: "missing",
    provider: { providerName: "Azure" },
  });
});

test("successive disable and enable rules still work", () => {
  expect(
    collectModelsWithDefaultModel(
      models,
      "-all,-deploy@OpenAI,+deploy@OpenAI=Ready",
      "",
    ).find((m) => m.name === "deploy"),
  ).toMatchObject({ available: true, displayName: "Ready" });
});
