/**
 * Provider-specific settings fields (API keys, endpoints).
 * Simplified for unified proxy architecture — only OpenAI, Azure, and Stability remain.
 */

import { useMemo, useState } from "react";

import { ListItem, PasswordInput, Select } from "./ui-lib";
import Locale from "../locales";
import { useAccessStore } from "../store";
import { getClientConfig } from "../config/client";
import {
  ApiPath,
  Azure,
  RAGFLOW_BASE_URL,
  OPENAI_BASE_URL,
  ServiceProvider,
  StabilityConfig,
} from "../constant";
import { IconButton } from "./button";
import { EndpointInput } from "./endpoint-input";
import clsx from "clsx";
import formStyles from "./form-controls.module.scss";

/**
 * Renders access-code + custom-endpoint toggle + provider-specific
 * config fields. Used inside the Settings page.
 */
function AccessStatus() {
  const accessStore = useAccessStore();
  const verified =
    accessStore.authorizationStatus === "authorized" &&
    accessStore.isAuthorized();
  const message = accessStore.authorizationError
    ? Locale.Auth.Validation[accessStore.authorizationError]
    : verified
      ? Locale.Auth.AccessVerified
      : accessStore.configError
        ? Locale.Auth.ConfigError
        : "";
  return (
    <div role="status">
      {message && (
        <div
          className={clsx(
            formStyles.message,
            verified
              ? formStyles["message-success"]
              : formStyles["message-error"],
          )}
        >
          {message}
        </div>
      )}
    </div>
  );
}

export function ProviderConfigSection(props: { showAccessCode: boolean }) {
  const accessStore = useAccessStore();
  const clientConfig = useMemo(() => getClientConfig(), []);
  const [checkingAccess, setCheckingAccess] = useState(false);

  // ---- Access code ----
  const accessCodeComponent = props.showAccessCode && (
    <ListItem
      title={Locale.Settings.Access.AccessCode.Title}
      subTitle={Locale.Settings.Access.AccessCode.SubTitle}
    >
      <div className={formStyles.field}>
        <PasswordInput
          value={accessStore.accessCode}
          type="text"
          placeholder={Locale.Settings.Access.AccessCode.Placeholder}
          onChange={(e) => {
            accessStore.update((access) => {
              access.accessCode = e.currentTarget.value;
              access.authorizationStatus = "idle";
              access.authorizationError = "";
            });
          }}
        />
        <div className={formStyles.actions}>
          <IconButton
            className={formStyles["small-button"]}
            bordered
            type="primary"
            text={Locale.Auth.CheckAccess}
            disabled={checkingAccess}
            onClick={async () => {
              setCheckingAccess(true);
              try {
                await accessStore.verifyAuthorization();
              } catch {
                /* store exposes config errors */
              } finally {
                setCheckingAccess(false);
              }
            }}
          />
        </div>
        <AccessStatus />
      </div>
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
        <EndpointInput
          ariaLabel={Locale.Settings.Access.OpenAI.Endpoint.Title}
          placeholder={OPENAI_BASE_URL}
          apiKey={accessStore.openaiApiKey}
          provider={ServiceProvider.OpenAI}
          defaultValue={clientConfig?.isApp ? OPENAI_BASE_URL : ApiPath.OpenAI}
          value={accessStore.openaiUrl}
          onChange={(value) =>
            accessStore.update((access) => (access.openaiUrl = value))
          }
        />
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
        <EndpointInput
          ariaLabel={Locale.Settings.Access.Azure.Endpoint.Title}
          placeholder={Azure.ExampleEndpoint}
          apiKey={accessStore.azureApiKey}
          provider={ServiceProvider.Azure}
          defaultValue={""}
          apiVersion={accessStore.azureApiVersion}
          value={accessStore.azureUrl}
          onChange={(value) =>
            accessStore.update((access) => (access.azureUrl = value))
          }
        />
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
        <EndpointInput
          ariaLabel={Locale.Settings.Access.Stability.Endpoint.Title}
          placeholder={StabilityConfig.ExampleEndpoint}
          apiKey={accessStore.stabilityApiKey}
          provider={ServiceProvider.Stability}
          defaultValue={StabilityConfig.ExampleEndpoint}
          value={accessStore.stabilityUrl}
          onChange={(value) =>
            accessStore.update((access) => (access.stabilityUrl = value))
          }
        />
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

  const ragflowConfigComponent = accessStore.provider ===
    ServiceProvider.RAGFlow && (
    <>
      <ListItem title="RAGFlow Endpoint">
        <EndpointInput
          ariaLabel="RAGFlow Endpoint"
          value={accessStore.ragflowUrl}
          apiKey={accessStore.ragflowApiKey}
          provider={ServiceProvider.RAGFlow}
          placeholder={RAGFLOW_BASE_URL}
          defaultValue={
            clientConfig?.isApp ? RAGFLOW_BASE_URL : ApiPath.RAGFlow
          }
          onChange={(value) =>
            accessStore.update((access) => (access.ragflowUrl = value))
          }
        />
      </ListItem>
      <ListItem title="RAGFlow API Key">
        <PasswordInput
          aria-label="RAGFlow API Key"
          value={accessStore.ragflowApiKey}
          onChange={(event) =>
            accessStore.update(
              (access) => (access.ragflowApiKey = event.currentTarget.value),
            )
          }
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
              {ragflowConfigComponent}
            </>
          )}
        </>
      )}
    </>
  );
}
