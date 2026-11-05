import { ServiceProvider } from "../../constant";
import { validateEndpointUrl } from "../endpoint/config";
import { parseCustomModels } from "../model/custom";

export interface SettingsLink {
  version: 1;
  url?: string;
  key?: string;
  provider?: ServiceProvider;
  customModels?: string;
  defaultModel?: string;
}

export type SettingsLinkError =
  | "invalid"
  | "version"
  | "provider"
  | "url"
  | "models";

export type SettingsLinkResult =
  | { ok: true; value: SettingsLink }
  | { ok: false; error: SettingsLinkError };

/** Parse untrusted URL input without logging or echoing secret values. */
export function parseSettingsLink(text: string): SettingsLinkResult {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "invalid" };
    }
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (raw.version !== undefined && raw.version !== 1) {
    return { ok: false, error: "version" };
  }
  const fields = ["url", "key", "provider", "customModels", "defaultModel"];
  if (
    Object.keys(raw).some(
      (key) => key !== "version" && !fields.includes(key),
    ) ||
    fields.some(
      (key) => raw[key] !== undefined && typeof raw[key] !== "string",
    ) ||
    !fields.some((key) => raw[key] !== undefined)
  ) {
    return { ok: false, error: "invalid" };
  }
  const value: SettingsLink = { version: 1 };
  if (typeof raw.provider === "string") {
    const provider = Object.values(ServiceProvider).find(
      (p) => p.toLowerCase() === (raw.provider as string).trim().toLowerCase(),
    );
    if (!provider) return { ok: false, error: "provider" };
    value.provider = provider;
  }
  if (typeof raw.url === "string") {
    const result = validateEndpointUrl(raw.url);
    if (!result.valid) return { ok: false, error: "url" };
    value.url = result.normalized;
  }
  if (typeof raw.key === "string") {
    if (!raw.key.trim()) return { ok: false, error: "invalid" };
    value.key = raw.key.trim();
  }
  if (value.url !== undefined || value.key !== undefined) {
    // Legacy links always configured the OpenAI-compatible endpoint.
    value.provider ??= ServiceProvider.OpenAI;
  }
  if (typeof raw.customModels === "string") {
    if (parseCustomModels(raw.customModels).errors.length) {
      return { ok: false, error: "models" };
    }
    value.customModels = raw.customModels.trim();
  }
  if (typeof raw.defaultModel === "string") {
    const model = raw.defaultModel.trim();
    if (!model || model.endsWith("@") || model.startsWith("@")) {
      return { ok: false, error: "models" };
    }
    value.defaultModel = model;
  }
  return { ok: true, value };
}

/** Hide keys and URL query/fragment values even in confirmation dialogs. */
export function previewSettingsLink(value: SettingsLink): string {
  const preview = { ...value };
  if (preview.key !== undefined) preview.key = "••••••••";
  if (preview.url) {
    preview.url = preview.url.split(/[?#]/)[0];
    if (/[?#]/.test(value.url!)) preview.url += "?••••••••";
  }
  return JSON.stringify(preview, null, 2);
}
