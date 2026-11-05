import {
  DEFAULT_MODELS,
  VISION_MODEL_REGEXES,
  EXCLUDE_VISION_MODEL_REGEXES,
} from "../domain/model/catalog";
import type { LLMModel } from "../client/api";
import {
  modelSelectionMatches,
  resolveModelSelection,
} from "../domain/model/selection";

import { parseCustomModels } from "../domain/model/custom";

const CustomSeq = {
  val: -1000, //To ensure the custom model located at front, start from -1000, refer to constant.ts
  cache: new Map<string, number>(),
  next: (id: string) => {
    if (CustomSeq.cache.has(id)) {
      return CustomSeq.cache.get(id) as number;
    } else {
      let seq = CustomSeq.val++;
      CustomSeq.cache.set(id, seq);
      return seq;
    }
  },
};

const customProvider = (providerName: string) => ({
  id: providerName.toLowerCase(),
  providerName: providerName,
  sorted: CustomSeq.next(providerName),
});

/**
 * Sorts an array of models based on specified rules.
 *
 * First, sorted by provider; if the same, sorted by model
 */
const sortModelTable = (models: ReturnType<typeof collectModels>) =>
  models.sort((a, b) => {
    if (a.provider && b.provider) {
      let cmp = a.provider.sorted - b.provider.sorted;
      return cmp === 0 ? a.sorted - b.sorted : cmp;
    } else {
      return a.sorted - b.sorted;
    }
  });

/**
 * get model name and provider from a formatted string,
 * e.g. `gpt-4@OpenAi` or `claude-3-5-sonnet@20240620@Google`
 * @param modelWithProvider model name with provider separated by last `@` char,
 * @returns [model, provider] tuple, if no `@` char found, provider is undefined
 */
export function getModelProvider(modelWithProvider: string): [string, string?] {
  const [model, provider] = modelWithProvider.split(/@(?!.*@)/);
  return [model, provider];
}

export interface ModelRecord extends LLMModel {
  displayName: string;
  source: "builtin" | "custom" | "server" | "missing";
  isDefault?: boolean;
  isCustom?: boolean;
}

export function collectModelTable(
  models: readonly LLMModel[],
  customModels: string,
  serverModels = "",
): Record<string, ModelRecord> {
  const table: Record<string, ModelRecord> = {};
  for (const model of models) {
    table[`${model.name}@${model.provider.id.toLowerCase()}`] = {
      ...model,
      provider: { ...model.provider },
      displayName: model.displayName || model.name,
      source: "builtin",
      isCustom: false,
    };
  }
  for (const [rules, source] of [
    [customModels, "custom"],
    [serverModels, "server"],
  ] as const) {
    for (const rule of parseCustomModels(rules, true).models) {
      if (rule.id === "all") {
        Object.values(table).forEach(
          (model) => (model.available = rule.enabled),
        );
        continue;
      }
      const matches = Object.values(table).filter(
        (model) =>
          model.name === rule.id &&
          (!rule.provider ||
            [model.provider.id, model.provider.providerName].some(
              (p) => p.toLowerCase() === rule.provider!.toLowerCase(),
            )),
      );
      if (matches.length) {
        matches.forEach((model) => {
          model.available = rule.enabled;
          model.source = source;
          if (rule.displayName) model.displayName = rule.displayName;
        });
      } else {
        const provider =
          models.find((m) =>
            [m.provider.id, m.provider.providerName].some(
              (p) => p.toLowerCase() === rule.provider?.toLowerCase(),
            ),
          )?.provider ?? customProvider(rule.provider || rule.id);
        const key = `${rule.id}@${provider.id.toLowerCase()}`;
        table[key] = {
          name: rule.id,
          displayName: rule.displayName || rule.id,
          available: rule.enabled,
          provider: { ...provider },
          sorted: CustomSeq.next(key),
          source,
          isCustom: true,
        };
      }
    }
  }
  return table;
}

/** Resolve against the same records used by the selector, preserving explicit backend IDs. */
export function resolveConfiguredModel(
  value: string,
  models: readonly LLMModel[],
  customModels: string,
  serverModels: string,
  preferredProvider?: string,
) {
  return resolveModelSelection(
    value,
    Object.values(collectModelTable(models, customModels, serverModels)),
    preferredProvider,
  );
}

/** Keep the current selection visible even if it disappears from a refreshed catalog. */
export function retainSelectedModel(
  models: ModelRecord[],
  name: string,
  providerName: string,
): ModelRecord[] {
  const visible = models.filter(
    (m) =>
      m.available ||
      (m.name === name && m.provider.providerName === providerName),
  );
  if (
    !visible.some(
      (m) => m.name === name && m.provider.providerName === providerName,
    )
  ) {
    visible.push({
      name,
      displayName: name,
      provider: { id: providerName.toLowerCase(), providerName, sorted: 0 },
      available: false,
      sorted: 0,
      source: "missing",
      isCustom: true,
    });
  }
  return visible;
}

export function collectModelTableWithDefaultModel(
  models: readonly LLMModel[],
  customModels: string,
  defaultModel: string,
  serverModels = "",
) {
  const modelTable = collectModelTable(models, customModels, serverModels);
  if (defaultModel && defaultModel !== "") {
    const selection = resolveModelSelection(
      defaultModel,
      Object.values(modelTable),
    );
    for (const key of Object.keys(modelTable)) {
      const model = modelTable[key];
      if (
        model.available &&
        modelSelectionMatches(selection, model as LLMModel)
      ) {
        model.isDefault = true;
        break;
      }
    }
  }
  return modelTable;
}

/**
 * Generate full model table.
 */
export function collectModels(
  models: readonly LLMModel[],
  customModels: string,
) {
  const modelTable = collectModelTable(models, customModels);
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}

export function collectModelsWithDefaultModel(
  models: readonly LLMModel[],
  customModels: string,
  defaultModel: string,
  serverModels = "",
) {
  const modelTable = collectModelTableWithDefaultModel(
    models,
    customModels,
    defaultModel,
    serverModels,
  );
  let allModels = Object.values(modelTable);

  allModels = sortModelTable(allModels);

  return allModels;
}

export function isModelAvailableInServer(
  customModels: string,
  modelName: string,
  providerName: string,
) {
  const fullName = `${modelName}@${providerName}`;
  const modelTable = collectModelTable(DEFAULT_MODELS, customModels);
  return modelTable[fullName]?.available === false;
}

/**
 * Check if the model name is a GPT-4 related model
 *
 * @param modelName The name of the model to check
 * @returns True if the model is a GPT-4 related model (excluding gpt-4o-mini)
 */
export function isGPT4Model(modelName: string): boolean {
  return (
    (modelName.startsWith("gpt-4") ||
      modelName.startsWith("chatgpt-4o") ||
      modelName.startsWith("o1")) &&
    !modelName.startsWith("gpt-4o-mini")
  );
}

/**
 * Checks if a model is not available on any of the specified providers in the server.
 *
 * @param {string} customModels - A string of custom models, comma-separated.
 * @param {string} modelName - The name of the model to check.
 * @param {string|string[]} providerNames - A string or array of provider names to check against.
 *
 * @returns {boolean} True if the model is not available on any of the specified providers, false otherwise.
 */
export function isModelNotavailableInServer(
  customModels: string,
  modelName: string,
  providerNames: string | string[],
): boolean {
  // Check DISABLE_GPT4 environment variable
  if (
    process.env.DISABLE_GPT4 === "1" &&
    isGPT4Model(modelName.toLowerCase())
  ) {
    return true;
  }

  const modelTable = collectModelTable(DEFAULT_MODELS, customModels);

  const providerNamesArray = Array.isArray(providerNames)
    ? providerNames
    : [providerNames];
  for (const providerName of providerNamesArray) {
    const fullName = `${modelName}@${providerName.toLowerCase()}`;
    if (modelTable?.[fullName]?.available === true) return false;
  }
  return true;
}

/**
 * Pure server-compatible check for whether a model supports vision.
 * Reads VISION_MODELS from process.env (set at server boot / in tests),
 * then falls back to regex matching.
 */
export function isVisionModel(model: string): boolean {
  const envVisionModels = process.env.VISION_MODELS;
  if (envVisionModels) {
    const models = envVisionModels.split(",").map((m) => m.trim());
    if (models.includes(model)) return true;
  }
  return (
    !EXCLUDE_VISION_MODEL_REGEXES.some((regex) => regex.test(model)) &&
    VISION_MODEL_REGEXES.some((regex) => regex.test(model))
  );
}
