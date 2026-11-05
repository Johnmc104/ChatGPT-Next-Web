import { useEffect, useState } from "react";
import {
  parseCustomModels,
  type CustomModelSpec,
} from "../domain/model/custom";
import { IconButton } from "./button";
import Locale from "../locales";

const serialize = (models: CustomModelSpec[]) =>
  models
    .map(
      (model) =>
        `${model.enabled ? "+" : "-"}${model.id}${
          model.provider ? `@${model.provider}` : ""
        }${model.displayName ? `=${model.displayName}` : ""}`,
    )
    .join(",");

export function CustomModelEditor(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const labels = Locale.Settings.CustomModelEditor;
  const [draft, setDraft] = useState(props.value);
  const [error, setError] = useState("");
  const [id, setId] = useState("");
  const [provider, setProvider] = useState("OpenAI");
  const [displayName, setDisplayName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [editing, setEditing] = useState<number>();
  const models = parseCustomModels(props.value).models;
  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);
  const commit = (value: string) => {
    const result = parseCustomModels(value);
    setError(result.errors.length ? labels.Invalid : "");
    if (result.errors.length) return false;
    props.onChange(value);
    setDraft(value);
    return true;
  };
  const save = () => {
    if (
      !id.trim() ||
      id.trim() === "all" ||
      /[,=\s]/.test(id.trim()) ||
      /[,@=\s]/.test(provider.trim()) ||
      displayName.includes(",")
    ) {
      setError(labels.Invalid);
      return;
    }
    const record: CustomModelSpec = {
      id: id.trim(),
      provider: provider.trim() || undefined,
      displayName: displayName.trim() || undefined,
      enabled,
    };
    const next = [...models];
    if (editing === undefined) next.push(record);
    else next[editing] = record;
    if (commit(serialize(next))) {
      setId("");
      setDisplayName("");
      setEditing(undefined);
    }
  };
  return (
    <div style={{ width: "100%" }}>
      <p style={{ fontSize: 12 }}>{labels.Hint}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          aria-label={labels.ID}
          placeholder={labels.ID}
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          aria-label={labels.Provider}
          placeholder={labels.Provider}
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        />
        <input
          aria-label={labels.Name}
          placeholder={labels.Name}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {labels.Enabled}
        </label>
        <IconButton
          text={editing === undefined ? Locale.UI.Create : Locale.UI.Confirm}
          onClick={save}
        />
        {editing !== undefined && (
          <IconButton
            text={Locale.UI.Cancel}
            onClick={() => {
              setEditing(undefined);
              setId("");
              setDisplayName("");
            }}
          />
        )}
      </div>
      {error && (
        <div role="alert" style={{ color: "var(--error)", fontSize: 12 }}>
          {error}
        </div>
      )}
      <ul style={{ paddingLeft: 16 }}>
        {models.map((model, index) => (
          <li key={`${index}:${model.id}`} style={{ marginTop: 8 }}>
            <label>
              <input
                type="checkbox"
                aria-label={`${labels.Enabled}: ${model.id}`}
                checked={model.enabled}
                onChange={(e) =>
                  commit(
                    serialize(
                      models.map((m, i) =>
                        i === index ? { ...m, enabled: e.target.checked } : m,
                      ),
                    ),
                  )
                }
              />
              {model.displayName || model.id}{" "}
              <small>
                ({model.id}
                {model.provider ? ` @ ${model.provider}` : ""})
              </small>
            </label>
            {model.id !== "all" && (
              <IconButton
                text={Locale.UI.Edit}
                onClick={() => {
                  setId(model.id);
                  setProvider(model.provider ?? "");
                  setDisplayName(model.displayName ?? "");
                  setEnabled(model.enabled);
                  setEditing(index);
                }}
              />
            )}
            <IconButton
              text={labels.Delete}
              onClick={() => {
                commit(serialize(models.filter((_m, i) => i !== index)));
                setEditing(undefined);
              }}
            />
          </li>
        ))}
      </ul>
      <details>
        <summary>{labels.Advanced}</summary>
        <textarea
          aria-label={Locale.Settings.Access.CustomModel.Title}
          value={draft}
          style={{ width: "100%" }}
          placeholder="+model-id@Provider=Display Name"
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={() => commit(draft)}
        />
      </details>
    </div>
  );
}
