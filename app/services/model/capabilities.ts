import { findCapabilityOverride } from "../../domain/model/overrides";

/** Lazy store access keeps model detection safe during module initialization. */
export function getConfiguredCapabilities(model: string, provider?: string) {
  const { useAppConfig } =
    require("../../store/config") as typeof import("../../store/config");
  return findCapabilityOverride(
    useAppConfig.getState().modelCapabilityOverrides ?? {},
    model,
    provider,
  );
}
