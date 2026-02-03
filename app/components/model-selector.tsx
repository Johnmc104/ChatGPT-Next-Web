import { useState, useMemo } from "react";
import styles from "./model-selector.module.scss";
import { IconButton } from "./button";
import CloseIcon from "../icons/close.svg";
import Locale from "../locales";

export interface ModelItem {
  name: string;
  displayName: string;
  provider?: {
    id: string;
    providerName: string;
    providerType: string;
  };
  isCustom?: boolean;
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

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelItem[]> = {};
    
    // First add custom models group
    const customModels = models.filter((m) => m.isCustom);
    if (customModels.length > 0) {
      groups[Locale.Settings.ModelSelector.CustomGroup] = customModels;
    }

    // Then group by provider
    models
      .filter((m) => !m.isCustom)
      .forEach((model) => {
        const providerName = model.provider?.providerName || "Other";
        if (!groups[providerName]) {
          groups[providerName] = [];
        }
        groups[providerName].push(model);
      });

    return groups;
  }, [models]);

  const providerNames = Object.keys(groupedModels);

  // Find initial provider based on selected model
  const initialProvider = useMemo(() => {
    for (const [provider, items] of Object.entries(groupedModels)) {
      if (items.some((m) => m.name === selectedModel)) {
        return provider;
      }
    }
    return providerNames[0] || "";
  }, [groupedModels, selectedModel, providerNames]);

  const [activeProvider, setActiveProvider] = useState(initialProvider);

  const currentModels = groupedModels[activeProvider] || [];

  const handleModelClick = (model: ModelItem) => {
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
          <IconButton
            icon={<CloseIcon />}
            onClick={onClose}
            bordered
          />
        </div>

        {/* Two-column layout */}
        <div className={styles["model-selector-body"]}>
          {/* Left column: Provider list */}
          <div className={styles["provider-list"]}>
            {providerNames.map((provider) => {
              const isActive = provider === activeProvider;
              const hasSelected = groupedModels[provider]?.some(
                (m) => m.name === selectedModel
              );
              return (
                <div
                  key={provider}
                  className={`${styles["provider-item"]} ${
                    isActive ? styles["provider-item-active"] : ""
                  } ${hasSelected ? styles["provider-item-has-selected"] : ""}`}
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
                  }`}
                  onClick={() => handleModelClick(model)}
                >
                  <div className={styles["model-info"]}>
                    <span className={styles["model-name"]}>
                      {model.displayName}
                    </span>
                  </div>
                  {isSelected && (
                    <div className={styles["model-check"]}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
