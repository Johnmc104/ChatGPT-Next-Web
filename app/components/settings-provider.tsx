/**
 * Provider-specific settings fields (API keys, endpoints).
 * Simplified for unified proxy architecture — only OpenAI, Azure, and Stability remain.
 */

import { useMemo } from "react";

import { ListItem, PasswordInput, Select } from "./ui-lib";
import Locale from "../locales";
import { useAccessStore } from "../store";
import { getClientConfig } from "../config/client";
import {
  Azure,
  OPENAI_BASE_URL,
  ServiceProvider,
  StabilityConfig,
} from "../constant";

/**
 * Renders access-code + custom-endpoint toggle + provider-specific
 * config fields. Used inside the Settings page.
 */
export function ProviderConfigSection(props: { showAccessCode: boolean }) {
  const accessStore = useAccessStore();
  const clientConfig = useMemo(() => getClientConfig(), []);

  // ---- Access code ----
  const accessCodeComponent = props.showAccessCode && (
    <ListItem
      title={Locale.Settings.Access.AccessCode.Title}
      subTitle={Locale.Settings.Access.AccessCode.SubTitle}
    >
      <PasswordInput
        value={accessStore.accessCode}
        type="text"
        placeholder={Locale.Settings.Access.AccessCode.Placeholder}
        onChange={(e) => {
          accessStore.update(
            (access) => (access.accessCode = e.currentTarget.value),
          );
        }}
      />
    </ListItem>
  );

  // ---- Custom endpoint toggle ----
  const useCustomConfigComponent = !clientConfig?.isApp && (
    <ListItem
      title={Locale.Settings.Access.CustomEndpoint.Title}
      subTitle={Locale.Settings.Access.CustomEndpoint.SubTitle}
    >
      <input
        aria-label={Locale.Settings.Access.CustomEndpoint.Title}
        type="checkbox"
        checked={accessStore.useCustomConfig}
        onChange={(e) =>
          accessStore.update(
            (access) => (access.useCustomConfig = e.currentTarget.checked),
          )
        }
      ></input>
    </ListItem>
  );

  // ---- OpenAI ----
  const openAIConfigComponent = accessStore.provider ===
    ServiceProvider.OpenAI && (
    <>
      <ListItem
        title={Locale.Settings.Access.OpenAI.Endpoint.Title}
        subTitle={Locale.Settings.Access.OpenAI.Endpoint.SubTitle}
      >
        <input
          aria-label={Locale.Settings.Access.OpenAI.Endpoint.Title}
          type="text"
          value={accessStore.openaiUrl}
          placeholder={OPENAI_BASE_URL}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.openaiUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.OpenAI.ApiKey.Title}
        subTitle={Locale.Settings.Access.OpenAI.ApiKey.SubTitle}
      >
        <PasswordInput
          aria={Locale.Settings.ShowPassword}
          aria-label={Locale.Settings.Access.OpenAI.ApiKey.Title}
          value={accessStore.openaiApiKey}
          type="text"
          placeholder={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.openaiApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- Azure ----
  const azureConfigComponent = accessStore.provider ===
    ServiceProvider.Azure && (
    <>
      <ListItem
        title={Locale.Settings.Access.Azure.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Azure.Endpoint.SubTitle + Azure.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Azure.Endpoint.Title}
          type="text"
          value={accessStore.azureUrl}
          placeholder={Azure.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.azureUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Azure.ApiKey.Title}
        subTitle={Locale.Settings.Access.Azure.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Azure.ApiKey.Title}
          value={accessStore.azureApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Azure.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.azureApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Azure.ApiVerion.Title}
        subTitle={Locale.Settings.Access.Azure.ApiVerion.SubTitle}
      >
        <input
          aria-label={Locale.Settings.Access.Azure.ApiVerion.Title}
          type="text"
          value={accessStore.azureApiVersion}
          placeholder="2023-08-01-preview"
          onChange={(e) =>
            accessStore.update(
              (access) => (access.azureApiVersion = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
    </>
  );

  // ---- Stability ----
  const stabilityConfigComponent = accessStore.provider ===
    ServiceProvider.Stability && (
    <>
      <ListItem
        title={Locale.Settings.Access.Stability.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Stability.Endpoint.SubTitle +
          StabilityConfig.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Stability.Endpoint.Title}
          type="text"
          value={accessStore.stabilityUrl}
          placeholder={StabilityConfig.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.stabilityUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Stability.ApiKey.Title}
        subTitle={Locale.Settings.Access.Stability.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Stability.ApiKey.Title}
          value={accessStore.stabilityApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Stability.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.stabilityApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  return (
    <>
      {accessCodeComponent}

      {!accessStore.hideUserApiKey && (
        <>
          {useCustomConfigComponent}

          {accessStore.useCustomConfig && (
            <>
              <ListItem
                title={Locale.Settings.Access.Provider.Title}
                subTitle={Locale.Settings.Access.Provider.SubTitle}
              >
                <Select
                  aria-label={Locale.Settings.Access.Provider.Title}
                  value={accessStore.provider}
                  onChange={(e) => {
                    accessStore.update(
                      (access) =>
                        (access.provider = e.target.value as ServiceProvider),
                    );
                  }}
                >
                  {Object.entries(ServiceProvider).map(([k, v]) => (
                    <option value={v} key={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </ListItem>

              {openAIConfigComponent}
              {azureConfigComponent}
              {stabilityConfigComponent}
            </>
          )}
        </>
      )}
    </>
  );
}
