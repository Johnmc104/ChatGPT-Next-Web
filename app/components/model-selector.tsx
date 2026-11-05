import { useState, useMemo, useEffect } from "react";
import styles from "./model-selector.module.scss";
import { IconButton } from "./button";
import CloseIcon from "../icons/close.svg";
import Locale from "../locales";
import { useModelInfo } from "../hooks/useModelInfo";

export interface ModelItem {
  name: string;
  displayName: string;
  provider?: {
    id: string;
    providerName: string;
  };
  isCustom?: boolean;
  source?: "builtin" | "custom" | "server" | "missing";
  available?: boolean;
}

interface ModelSelectorProps {
  models: ModelItem[];
  selectedModel: string;
  selectedProvider: string;
  onSelect: (model: string, provider: string) => void;
  onClose: () => void;
}

export function ModelSelector(props: ModelSelectorProps) {
  const { models, selectedModel, selectedProvider, onSelect, onClose } = props;

  const { getModelInfo } = useModelInfo();

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelItem[]> = {};

    models.forEach((model) => {
      const providerName = model.provider?.providerName || "Other";
      (groups[providerName] ??= []).push(model);
    });

    return groups;
  }, [models]);

  const providerNames = useMemo(
    () => Object.keys(groupedModels),
    [groupedModels],
  );

  // Find initial provider based on selected model
  const initialProvider = useMemo(() => {
    for (const [provider, items] of Object.entries(groupedModels)) {
      if (
        items.some(
          (m) =>
            m.name === selectedModel &&
            m.provider?.providerName === selectedProvider,
        )
      ) {
        return provider;
      }
    }
    return providerNames[0] || "";
  }, [groupedModels, selectedModel, selectedProvider, providerNames]);

  const [activeProvider, setActiveProvider] = useState(initialProvider);

  useEffect(() => {
    setActiveProvider(initialProvider);
  }, [initialProvider]);

  const currentModels = groupedModels[activeProvider] || [];

  const handleModelClick = (model: ModelItem) => {
    if (model.available === false) return;
    onSelect(model.name, model.provider?.providerName || "");
    onClose();
  };

  return (
    <div className={styles["model-selector-overlay"]} onClick={onClose}>
      <div
        className={styles["model-selector-container"]}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles["model-selector-header"]}>
          <span className={styles["model-selector-title"]}>
            {Locale.Settings.Model}
          </span>
          <IconButton icon={<CloseIcon />} onClick={onClose} bordered />
        </div>

        {/* Two-column layout */}
        <div className={styles["model-selector-body"]}>
          {/* Left column: Provider list */}
          <div className={styles["provider-list"]}>
            {providerNames.map((provider) => {
              const isActive = provider === activeProvider;
              const hasSelected = groupedModels[provider]?.some(
                (m) =>
                  m.name === selectedModel &&
                  m.provider?.providerName === selectedProvider,
              );
              return (
                <div
                  key={provider}
                  className={`${styles["provider-item"]} ${
                    isActive ? styles["provider-item-active"] : ""
                  } ${hasSelected ? styles["provider-item-has-selected"] : ""}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveProvider(provider);
                    }
                  }}
                  onClick={() => setActiveProvider(provider)}
                >
                  <span className={styles["provider-name"]}>{provider}</span>
                  <span className={styles["provider-count"]}>
                    {groupedModels[provider]?.length || 0}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right column: Model list */}
          <div className={styles["model-list"]}>
            {currentModels.map((model, index) => {
              const isSelected =
                model.name === selectedModel &&
                model.provider?.providerName === selectedProvider;
              return (
                <div
                  key={`${model.name}-${index}`}
                  className={`${styles["model-item"]} ${
                    isSelected ? styles["model-item-selected"] : ""
                  } ${
                    model.available === false
                      ? styles["model-item-unavailable"]
                      : ""
                  }`}
                  role="button"
                  tabIndex={model.available === false ? -1 : 0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleModelClick(model);
                    }
                  }}
                  aria-disabled={model.available === false}
                  onClick={() => handleModelClick(model)}
                >
                  <div className={styles["model-info"]}>
                    <span className={styles["model-name"]}>
                      {model.displayName}
                      {model.available === false
                        ? ` (${Locale.Settings.ModelSelector.Unavailable})`
                        : ""}
                    </span>
                    <div className={styles["model-tags"]}>
                      <span>
                        {
                          Locale.Settings.ModelSelector.Sources[
                            model.source ??
                              (model.isCustom ? "custom" : "builtin")
                          ]
                        }
                      </span>
                      {(getModelInfo(model.name)?.capabilities ?? []).map(
                        (capability) => (
                          <span key={capability}>
                            {
                              Locale.Settings.ModelSelector.Capabilities[
                                capability
                              ]
                            }
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  {isSelected && <div className={styles["model-check"]}>✓</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
