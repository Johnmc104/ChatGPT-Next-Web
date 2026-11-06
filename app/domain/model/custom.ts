export interface CustomModelSpec {
  id: string;
  provider?: string;
  displayName?: string;
  /** Internal/canonical model name used to look up pricing and capabilities. */
  internalName?: string;
  enabled: boolean;
}

export interface CustomModelParseResult {
  models: CustomModelSpec[];
  errors: string[];
}

function splitModelProvider(value: string) {
  const separator = value.lastIndexOf("@");
  if (separator < 0) return { id: value.trim() };
  return {
    id: value.slice(0, separator).trim(),
    provider: value.slice(separator + 1).trim(),
  };
}

/** Parse CUSTOM_MODELS while retaining the existing +, -, @ and = syntax. */
export function parseCustomModels(
  value: string,
  allowOverrides = false,
): CustomModelParseResult {
  const models: CustomModelSpec[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const enabled = !item.startsWith("-");
      const body =
        item.startsWith("+") || item.startsWith("-")
          ? item.slice(1).trim()
          : item;
      const equal = body.indexOf("=");
      const modelValue = equal >= 0 ? body.slice(0, equal).trim() : body;
      const displaySegment =
        equal >= 0 ? body.slice(equal + 1).trim() : undefined;
      // Optional "#internalName" suffix maps a custom model to a canonical
      // name used for pricing and capability lookups.
      const hash = displaySegment?.indexOf("#") ?? -1;
      const displayName =
        displaySegment === undefined
          ? undefined
          : hash >= 0
            ? displaySegment.slice(0, hash).trim()
            : displaySegment;
      const internalName =
        hash >= 0
          ? displaySegment!.slice(hash + 1).trim() || undefined
          : undefined;
      const { id, provider } = splitModelProvider(modelValue);

      if (!id) {
        errors.push(`空模型 ID: ${item}`);
        return;
      }
      if (provider === "" || /\s/.test(id)) {
        errors.push(`模型 ID 或 Provider 格式无效: ${item}`);
        return;
      }
      if (id === "all") {
        models.push({ id, provider, displayName, enabled });
        return;
      }
      if (displayName === "") {
        errors.push(`展示名不能为空: ${item}`);
        return;
      }

      const key = `${id.toLowerCase()}@${(provider ?? "").toLowerCase()}`;
      if (seen.has(key) && !allowOverrides) {
        errors.push(`模型重复: ${modelValue}`);
        return;
      }
      seen.add(key);
      models.push({
        id,
        provider,
        displayName,
        ...(internalName ? { internalName } : {}),
        enabled,
      });
    });

  return { models, errors };
}
