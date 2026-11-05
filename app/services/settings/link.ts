import { ServiceProvider } from "../../constant";
import { useAccessStore, useAppConfig } from "../../store";
import { resolveConfiguredModel } from "../../utils/model";
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
        const selection = resolveConfiguredModel(
          payload.defaultModel,
          state.models,
          state.customModels,
          access.customModels,
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
