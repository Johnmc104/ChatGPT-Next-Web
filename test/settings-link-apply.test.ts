import { ServiceProvider } from "../app/constant";
import { applySettingsLink } from "../app/services/settings/link";
import { useAccessStore, useAppConfig } from "../app/store";

jest.mock("../app/store", () => ({
  useAccessStore: { getState: jest.fn() },
  useAppConfig: { getState: jest.fn() },
}));

function fixture() {
  const access = {
    provider: "OpenAI",
    useCustomConfig: false,
    openaiUrl: "/api/openai",
    openaiApiKey: "old",
    azureUrl: "",
    azureApiKey: "",
    customModels: "",
  };
  const config = {
    customModels: "old-model",
    models: [
      {
        name: "openai/gpt-4o-mini",
        provider: { id: "openai", providerName: "OpenAI", sorted: 0 },
        available: true,
        sorted: 0,
      },
    ],
    modelConfig: {
      model: "old-model",
      providerName: "OpenAI",
      temperature: 0.5,
    },
  };
  (useAccessStore.getState as jest.Mock).mockReturnValue({
    ...access,
    update: (fn: (s: typeof access) => void) => fn(access),
  });
  (useAppConfig.getState as jest.Mock).mockReturnValue({
    ...config,
    update: (fn: (s: typeof config) => void) => fn(config),
  });
  return { access, config };
}

test("an Azure link updates only the corresponding endpoint fields", () => {
  const { access, config } = fixture();
  applySettingsLink({
    version: 1,
    provider: ServiceProvider.Azure,
    url: "https://azure.example",
    key: "new",
  });
  expect(access).toMatchObject({
    provider: "Azure",
    useCustomConfig: true,
    azureUrl: "https://azure.example",
    azureApiKey: "new",
    openaiApiKey: "old",
    openaiUrl: "/api/openai",
  });
  expect(config.customModels).toBe("old-model");
});

test("model-only links preserve endpoint configuration and resolve builtin aliases", () => {
  const { access, config } = fixture();
  applySettingsLink({ version: 1, defaultModel: "gpt-4o-mini" });
  expect(access.useCustomConfig).toBe(false);
  expect(config.modelConfig).toEqual({
    model: "openai/gpt-4o-mini",
    providerName: "OpenAI",
    temperature: 0.5,
  });
});

test("an explicit backend model ID is preserved even if it resembles a builtin alias", () => {
  const { config } = fixture();
  applySettingsLink({
    version: 1,
    customModels: "gpt-4o-mini@OpenAI=Deployment",
    defaultModel: "gpt-4o-mini",
  });
  expect(config.modelConfig.model).toBe("gpt-4o-mini");
});
