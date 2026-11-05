import { useEffect, useState } from "react";
import { useAppConfig } from "../store/config";
import {
  modelCapabilityKey,
  validImageLimit,
  type ModelCapabilityOverride,
} from "../domain/model/overrides";
import { ListItem, Select } from "./ui-lib";
import Locale from "../locales";

export function ModelCapabilitiesEditor({
  model,
  provider,
}: {
  model: string;
  provider: string;
}) {
  const config = useAppConfig();
  const key = modelCapabilityKey(model, provider);
  const override = config.modelCapabilityOverrides?.[key] ?? {};
  const [limit, setLimit] = useState(String(override.maxInputImages ?? ""));
  const [error, setError] = useState("");
  useEffect(() => {
    setLimit(String(override.maxInputImages ?? ""));
    setError("");
  }, [key, override.maxInputImages]);
  const update = (
    field: keyof ModelCapabilityOverride,
    value: boolean | number | string | undefined,
  ) => {
    config.update((state) => {
      const next = { ...state.modelCapabilityOverrides?.[key], [field]: value };
      if (value === undefined) delete next[field];
      state.modelCapabilityOverrides = {
        ...state.modelCapabilityOverrides,
        [key]: next,
      };
    });
  };
  const labels = Locale.Settings.ModelCapabilities;
  return (
    <>
      {(["imageInput", "imageOutput"] as const).map((field) => (
        <ListItem
          key={field}
          title={labels[field]}
          subTitle={labels.Scope(model, provider)}
        >
          <Select
            aria-label={labels[field]}
            value={
              override[field] === undefined ? "auto" : String(override[field])
            }
            onChange={(event) =>
              update(
                field,
                event.target.value === "auto"
                  ? undefined
                  : event.target.value === "true",
              )
            }
          >
            <option value="auto">{labels.Auto}</option>
            <option value="true">{labels.Yes}</option>
            <option value="false">{labels.No}</option>
          </Select>
        </ListItem>
      ))}
      <ListItem title={labels.Protocol} subTitle={labels.ProtocolHint}>
        <Select
          aria-label={labels.Protocol}
          value={override.imageOutputProtocol ?? "auto"}
          onChange={(event) =>
            update(
              "imageOutputProtocol",
              event.target.value === "auto" ? undefined : event.target.value,
            )
          }
        >
          <option value="auto">{labels.Auto}</option>
          <option value="images">Images API</option>
          <option value="chat">Chat Completions</option>
        </Select>
      </ListItem>
      <ListItem title={labels.Limit} subTitle={labels.LimitHint}>
        <div>
          <input
            type="number"
            aria-label={labels.Limit}
            min={1}
            max={32}
            placeholder="3"
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
              setError("");
            }}
            onBlur={() => {
              if (!limit.trim()) update("maxInputImages", undefined);
              else if (validImageLimit(Number(limit)))
                update("maxInputImages", Number(limit));
              else setError(labels.InvalidLimit);
            }}
          />
          {error && <div role="alert">{error}</div>}
        </div>
      </ListItem>
    </>
  );
}
