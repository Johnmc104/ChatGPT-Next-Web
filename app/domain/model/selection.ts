import type { LLMModel } from "@/app/client/api";

export interface ResolvedModelSelection {
  model: string;
  providerName?: string;
  providerId?: string;
}

function sameProvider(value: string | undefined, model: LLMModel) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return (
    model.provider.id.toLowerCase() === normalized ||
    model.provider.providerName.toLowerCase() === normalized
  );
}

/**
 * Resolve backend aliases and UI values to one canonical model selection.
 * Supported inputs include `provider/model`, `model@Provider`, and bare IDs.
 */
export function resolveModelSelection(
  value: string,
  models: readonly LLMModel[],
): ResolvedModelSelection {
  const input = value.trim();
  const separator = input.lastIndexOf("@");
  const requestedModel =
    separator >= 0 ? input.slice(0, separator).trim() : input;
  const requestedProvider =
    separator >= 0 ? input.slice(separator + 1).trim() : undefined;

  const exact = models.filter(
    (model) =>
      (model.name === requestedModel ||
        model.name === input ||
        model.name.endsWith(`/${requestedModel}`)) &&
      sameProvider(requestedProvider, model),
  );
  const selected = exact.length === 1 ? exact[0] : undefined;

  if (selected) {
    return {
      model: selected.name,
      providerName: selected.provider.providerName,
      providerId: selected.provider.id,
    };
  }

  return {
    model: requestedModel,
    providerName: requestedProvider,
  };
}

export function modelSelectionMatches(
  selection: ResolvedModelSelection,
  model: LLMModel,
): boolean {
  if (model.name !== selection.model) return false;
  return sameProvider(selection.providerName, model);
}
