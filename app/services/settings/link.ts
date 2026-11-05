import { ServiceProvider } from "../../constant";
import { useAccessStore, useAppConfig } from "../../store";
import { resolveModelSelection } from "../../domain/model/selection";
import { parseCustomModels } from "../../domain/model/custom";
import type { SettingsLink } from "../../domain/settings/link";

/** Called only after the user has reviewed and confirmed the import. */
export function applySettingsLink(payload: SettingsLink) {
  const access = useAccessStore.getState();
  const config = useAppConfig.getState();
  const fields = {
    [ServiceProvider.OpenAI]: ["openaiUrl", "openaiApiKey"],
    [ServiceProvider.Azure]: ["azureUrl", "azureApiKey"],
    [ServiceProvider.Stability]: ["stabilityUrl", "stabilityApiKey"],
    [ServiceProvider.RAGFlow]: ["ragflowUrl", "ragflowApiKey"],
  } as const;

  if (payload.provider) {
    access.update((state) => {
      state.provider = payload.provider!;
      if (payload.url !== undefined || payload.key !== undefined) {
        const [urlField, keyField] = fields[payload.provider!];
        if (payload.url !== undefined) state[urlField] = payload.url;
        if (payload.key !== undefined) state[keyField] = payload.key;
        state.useCustomConfig = true;
      }
    });
  }

  if (
    payload.customModels !== undefined ||
    payload.defaultModel !== undefined
  ) {
    config.update((state) => {
      if (payload.customModels !== undefined) {
        state.customModels = payload.customModels;
      }
      if (payload.defaultModel !== undefined) {
        // Explicit custom IDs take precedence over built-in aliases.
        const custom = parseCustomModels(
          [access.customModels, state.customModels].join(","),
        ).models;
        const records = custom
          .filter((m) => m.id !== "all")
          .map((m) => ({
            name: m.id,
            available: m.enabled,
            sorted: 0,
            provider: {
              id: (m.provider ?? "OpenAI").toLowerCase(),
              providerName: m.provider ?? "OpenAI",
              sorted: 0,
            },
          }));
        const exactCustom = records.filter((m) =>
          [m.name, `${m.name}@${m.provider.providerName}`].includes(
            payload.defaultModel!,
          ),
        );
        const selection = resolveModelSelection(
          payload.defaultModel,
          exactCustom.length ? exactCustom : state.models,
        );
        state.modelConfig = {
          ...state.modelConfig,
          model: selection.model,
          providerName: (selection.providerName ?? "OpenAI") as ServiceProvider,
        };
      }
    });
  }
}
