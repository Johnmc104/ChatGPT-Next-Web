import { useEffect, useState } from "react";
import {
  parseCustomModels,
  type CustomModelSpec,
} from "../domain/model/custom";
import { IconButton } from "./button";
import Locale from "../locales";
import clsx from "clsx";
import styles from "./form-controls.module.scss";
import { useModelInfo } from "../hooks/useModelInfo";
import { formatModelPricing } from "../domain/model/pricing";

const serialize = (models: CustomModelSpec[]) =>
  models
    .map((model) => {
      const display = model.internalName
        ? `${model.displayName ?? model.id}#${model.internalName}`
        : model.displayName;
      return `${model.enabled ? "+" : "-"}${model.id}${
        model.provider ? `@${model.provider}` : ""
      }${display ? `=${display}` : ""}`;
    })
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
  const [internalName, setInternalName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [editing, setEditing] = useState<number>();
  const models = parseCustomModels(props.value).models;
  const { getModelInfo } = useModelInfo();
  const draftPricing = formatModelPricing(getModelInfo(internalName.trim()));
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
      displayName.includes(",") ||
      /[,#=\s]/.test(internalName.trim())
    ) {
      setError(labels.Invalid);
      return;
    }
    const record: CustomModelSpec = {
      id: id.trim(),
      provider: provider.trim() || undefined,
      displayName: displayName.trim() || undefined,
      internalName: internalName.trim() || undefined,
      enabled,
    };
    const next = [...models];
    if (editing === undefined) next.push(record);
    else next[editing] = record;
    if (commit(serialize(next))) {
      setId("");
      setDisplayName("");
      setInternalName("");
      setEditing(undefined);
    }
  };
  const reset = () => {
    setEditing(undefined);
    setId("");
    setDisplayName("");
    setInternalName("");
  };
  return (
    <div className={clsx(styles.field, styles["field-full"])}>
      <div className={styles.hint}>{labels.Hint}</div>
      <div className={styles["model-form"]}>
        <input
          type="text"
          aria-label={labels.ID}
          placeholder={labels.ID}
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          type="text"
          aria-label={labels.Provider}
          placeholder={labels.Provider}
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        />
        <input
          type="text"
          aria-label={labels.Name}
          placeholder={labels.Name}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label className={styles["check-label"]}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {labels.Enabled}
        </label>
        <div className={styles["model-form-actions"]}>
          {editing !== undefined && (
            <IconButton
              className={styles["small-button"]}
              bordered
              text={Locale.UI.Cancel}
              onClick={reset}
            />
          )}
          <IconButton
            className={styles["small-button"]}
            type="primary"
            text={editing === undefined ? Locale.UI.Create : Locale.UI.Confirm}
            onClick={save}
          />
        </div>
      </div>
      <div className={styles["model-internal"]}>
        <input
          type="text"
          aria-label={labels.Internal}
          placeholder={labels.InternalPlaceholder}
          value={internalName}
          onChange={(e) => setInternalName(e.target.value)}
        />
        <span className={styles["model-price"]}>
          {internalName.trim()
            ? draftPricing
              ? labels.Price(draftPricing)
              : labels.PriceUnknown
            : labels.InternalHint}
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className={clsx(styles.message, styles["message-error"])}
        >
          {error}
        </div>
      )}
      {models.length > 0 ? (
        <ul className={styles["model-list"]}>
          {models.map((model, index) => (
            <li
              key={`${index}:${model.id}`}
              className={clsx(styles["model-row"], {
                [styles["model-row-editing"]]: editing === index,
                [styles["model-row-disabled"]]: !model.enabled,
              })}
            >
              <label className={styles["model-row-main"]}>
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
                <span className={styles["model-row-name"]}>
                  {model.displayName || model.id}
                </span>
                <span className={styles["model-row-meta"]}>
                  {model.id}
                  {model.provider ? ` @ ${model.provider}` : ""}
                  {model.internalName ? ` → ${model.internalName}` : ""}
                  {(() => {
                    const price = formatModelPricing(
                      getModelInfo(model.internalName ?? ""),
                    );
                    return price ? ` · ${labels.Price(price)}` : "";
                  })()}
                </span>
              </label>
              <div className={styles["model-row-actions"]}>
                {model.id !== "all" && (
                  <IconButton
                    className={styles["small-button"]}
                    text={Locale.UI.Edit}
                    onClick={() => {
                      setId(model.id);
                      setProvider(model.provider ?? "");
                      setDisplayName(model.displayName ?? "");
                      setInternalName(model.internalName ?? "");
                      setEnabled(model.enabled);
                      setEditing(index);
                    }}
                  />
                )}
                <IconButton
                  className={styles["small-button"]}
                  type="danger"
                  text={labels.Delete}
                  onClick={() => {
                    commit(serialize(models.filter((_m, i) => i !== index)));
                    setEditing(undefined);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={clsx(styles["model-list"], styles.empty)}>
          {labels.Empty}
        </div>
      )}
      <details className={styles.advanced}>
        <summary>{labels.Advanced}</summary>
        <textarea
          aria-label={Locale.Settings.Access.CustomModel.Title}
          value={draft}
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
