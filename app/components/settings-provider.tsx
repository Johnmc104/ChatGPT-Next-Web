/**
 * Provider-specific settings fields (API keys, endpoints).
 * Extracted from settings.tsx — Sprint 2.2 (Phase 2).
 *
 * Renders the correct config fields based on the selected provider.
 */

import { useMemo } from "react";

import { ListItem, PasswordInput, Select } from "./ui-lib";
import Locale from "../locales";
import { useAccessStore } from "../store";
import { getClientConfig } from "../config/client";
import {
  Anthropic,
  Azure,
  Baidu,
  Tencent,
  ByteDance,
  Alibaba,
  Moonshot,
  XAI,
  Google,
  GoogleSafetySettingsThreshold,
  OPENAI_BASE_URL,
  ServiceProvider,
  Stability,
  Iflytek,
  ChatGLM,
  DeepSeek,
  SiliconFlow,
  AI302,
} from "../constant";

/**
 * Renders access-code + custom-endpoint toggle + all provider-specific
 * config fields. Used inside the Settings page `<List id={SlotID.CustomModel}>`.
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

  // ---- Google ----
  const googleConfigComponent = accessStore.provider ===
    ServiceProvider.Google && (
    <>
      <ListItem
        title={Locale.Settings.Access.Google.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Google.Endpoint.SubTitle +
          Google.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Google.Endpoint.Title}
          type="text"
          value={accessStore.googleUrl}
          placeholder={Google.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.googleUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Google.ApiKey.Title}
        subTitle={Locale.Settings.Access.Google.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Google.ApiKey.Title}
          value={accessStore.googleApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Google.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.googleApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Google.ApiVersion.Title}
        subTitle={Locale.Settings.Access.Google.ApiVersion.SubTitle}
      >
        <input
          aria-label={Locale.Settings.Access.Google.ApiVersion.Title}
          type="text"
          value={accessStore.googleApiVersion}
          placeholder="2023-08-01-preview"
          onChange={(e) =>
            accessStore.update(
              (access) => (access.googleApiVersion = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Google.GoogleSafetySettings.Title}
        subTitle={Locale.Settings.Access.Google.GoogleSafetySettings.SubTitle}
      >
        <Select
          aria-label={Locale.Settings.Access.Google.GoogleSafetySettings.Title}
          value={accessStore.googleSafetySettings}
          onChange={(e) => {
            accessStore.update(
              (access) =>
                (access.googleSafetySettings = e.target
                  .value as GoogleSafetySettingsThreshold),
            );
          }}
        >
          {Object.entries(GoogleSafetySettingsThreshold).map(([k, v]) => (
            <option value={v} key={k}>
              {k}
            </option>
          ))}
        </Select>
      </ListItem>
    </>
  );

  // ---- Anthropic ----
  const anthropicConfigComponent = accessStore.provider ===
    ServiceProvider.Anthropic && (
    <>
      <ListItem
        title={Locale.Settings.Access.Anthropic.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Anthropic.Endpoint.SubTitle +
          Anthropic.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Anthropic.Endpoint.Title}
          type="text"
          value={accessStore.anthropicUrl}
          placeholder={Anthropic.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.anthropicUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Anthropic.ApiKey.Title}
        subTitle={Locale.Settings.Access.Anthropic.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Anthropic.ApiKey.Title}
          value={accessStore.anthropicApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Anthropic.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.anthropicApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Anthropic.ApiVerion.Title}
        subTitle={Locale.Settings.Access.Anthropic.ApiVerion.SubTitle}
      >
        <input
          aria-label={Locale.Settings.Access.Anthropic.ApiVerion.Title}
          type="text"
          value={accessStore.anthropicApiVersion}
          placeholder={Anthropic.Vision}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.anthropicApiVersion = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
    </>
  );

  // ---- Baidu ----
  const baiduConfigComponent = accessStore.provider ===
    ServiceProvider.Baidu && (
    <>
      <ListItem
        title={Locale.Settings.Access.Baidu.Endpoint.Title}
        subTitle={Locale.Settings.Access.Baidu.Endpoint.SubTitle}
      >
        <input
          aria-label={Locale.Settings.Access.Baidu.Endpoint.Title}
          type="text"
          value={accessStore.baiduUrl}
          placeholder={Baidu.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.baiduUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Baidu.ApiKey.Title}
        subTitle={Locale.Settings.Access.Baidu.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Baidu.ApiKey.Title}
          value={accessStore.baiduApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Baidu.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.baiduApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Baidu.SecretKey.Title}
        subTitle={Locale.Settings.Access.Baidu.SecretKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Baidu.SecretKey.Title}
          value={accessStore.baiduSecretKey}
          type="text"
          placeholder={Locale.Settings.Access.Baidu.SecretKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.baiduSecretKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- Tencent ----
  const tencentConfigComponent = accessStore.provider ===
    ServiceProvider.Tencent && (
    <>
      <ListItem
        title={Locale.Settings.Access.Tencent.Endpoint.Title}
        subTitle={Locale.Settings.Access.Tencent.Endpoint.SubTitle}
      >
        <input
          aria-label={Locale.Settings.Access.Tencent.Endpoint.Title}
          type="text"
          value={accessStore.tencentUrl}
          placeholder={Tencent.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.tencentUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Tencent.ApiKey.Title}
        subTitle={Locale.Settings.Access.Tencent.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Tencent.ApiKey.Title}
          value={accessStore.tencentSecretId}
          type="text"
          placeholder={Locale.Settings.Access.Tencent.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.tencentSecretId = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Tencent.SecretKey.Title}
        subTitle={Locale.Settings.Access.Tencent.SecretKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Tencent.SecretKey.Title}
          value={accessStore.tencentSecretKey}
          type="text"
          placeholder={Locale.Settings.Access.Tencent.SecretKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.tencentSecretKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- ByteDance ----
  const byteDanceConfigComponent = accessStore.provider ===
    ServiceProvider.ByteDance && (
    <>
      <ListItem
        title={Locale.Settings.Access.ByteDance.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.ByteDance.Endpoint.SubTitle +
          ByteDance.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.ByteDance.Endpoint.Title}
          type="text"
          value={accessStore.bytedanceUrl}
          placeholder={ByteDance.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.bytedanceUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.ByteDance.ApiKey.Title}
        subTitle={Locale.Settings.Access.ByteDance.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.ByteDance.ApiKey.Title}
          value={accessStore.bytedanceApiKey}
          type="text"
          placeholder={Locale.Settings.Access.ByteDance.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.bytedanceApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- Alibaba ----
  const alibabaConfigComponent = accessStore.provider ===
    ServiceProvider.Alibaba && (
    <>
      <ListItem
        title={Locale.Settings.Access.Alibaba.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Alibaba.Endpoint.SubTitle +
          Alibaba.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Alibaba.Endpoint.Title}
          type="text"
          value={accessStore.alibabaUrl}
          placeholder={Alibaba.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.alibabaUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Alibaba.ApiKey.Title}
        subTitle={Locale.Settings.Access.Alibaba.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Alibaba.ApiKey.Title}
          value={accessStore.alibabaApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Alibaba.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.alibabaApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- Moonshot ----
  const moonshotConfigComponent = accessStore.provider ===
    ServiceProvider.Moonshot && (
    <>
      <ListItem
        title={Locale.Settings.Access.Moonshot.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Moonshot.Endpoint.SubTitle +
          Moonshot.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Moonshot.Endpoint.Title}
          type="text"
          value={accessStore.moonshotUrl}
          placeholder={Moonshot.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.moonshotUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Moonshot.ApiKey.Title}
        subTitle={Locale.Settings.Access.Moonshot.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Moonshot.ApiKey.Title}
          value={accessStore.moonshotApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Moonshot.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.moonshotApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- DeepSeek ----
  const deepseekConfigComponent = accessStore.provider ===
    ServiceProvider.DeepSeek && (
    <>
      <ListItem
        title={Locale.Settings.Access.DeepSeek.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.DeepSeek.Endpoint.SubTitle +
          DeepSeek.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.DeepSeek.Endpoint.Title}
          type="text"
          value={accessStore.deepseekUrl}
          placeholder={DeepSeek.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.deepseekUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.DeepSeek.ApiKey.Title}
        subTitle={Locale.Settings.Access.DeepSeek.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.DeepSeek.ApiKey.Title}
          value={accessStore.deepseekApiKey}
          type="text"
          placeholder={Locale.Settings.Access.DeepSeek.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.deepseekApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- XAI ----
  const XAIConfigComponent = accessStore.provider === ServiceProvider.XAI && (
    <>
      <ListItem
        title={Locale.Settings.Access.XAI.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.XAI.Endpoint.SubTitle + XAI.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.XAI.Endpoint.Title}
          type="text"
          value={accessStore.xaiUrl}
          placeholder={XAI.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.xaiUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.XAI.ApiKey.Title}
        subTitle={Locale.Settings.Access.XAI.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.XAI.ApiKey.Title}
          value={accessStore.xaiApiKey}
          type="text"
          placeholder={Locale.Settings.Access.XAI.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.xaiApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- ChatGLM ----
  const chatglmConfigComponent = accessStore.provider ===
    ServiceProvider.ChatGLM && (
    <>
      <ListItem
        title={Locale.Settings.Access.ChatGLM.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.ChatGLM.Endpoint.SubTitle +
          ChatGLM.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.ChatGLM.Endpoint.Title}
          type="text"
          value={accessStore.chatglmUrl}
          placeholder={ChatGLM.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.chatglmUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.ChatGLM.ApiKey.Title}
        subTitle={Locale.Settings.Access.ChatGLM.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.ChatGLM.ApiKey.Title}
          value={accessStore.chatglmApiKey}
          type="text"
          placeholder={Locale.Settings.Access.ChatGLM.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.chatglmApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- SiliconFlow ----
  const siliconflowConfigComponent = accessStore.provider ===
    ServiceProvider.SiliconFlow && (
    <>
      <ListItem
        title={Locale.Settings.Access.SiliconFlow.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.SiliconFlow.Endpoint.SubTitle +
          SiliconFlow.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.SiliconFlow.Endpoint.Title}
          type="text"
          value={accessStore.siliconflowUrl}
          placeholder={SiliconFlow.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.siliconflowUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.SiliconFlow.ApiKey.Title}
        subTitle={Locale.Settings.Access.SiliconFlow.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.SiliconFlow.ApiKey.Title}
          value={accessStore.siliconflowApiKey}
          type="text"
          placeholder={Locale.Settings.Access.SiliconFlow.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.siliconflowApiKey = e.currentTarget.value),
            );
          }}
        />
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
          Stability.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Stability.Endpoint.Title}
          type="text"
          value={accessStore.stabilityUrl}
          placeholder={Stability.ExampleEndpoint}
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

  // ---- Iflytek ----
  const lflytekConfigComponent = accessStore.provider ===
    ServiceProvider.Iflytek && (
    <>
      <ListItem
        title={Locale.Settings.Access.Iflytek.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.Iflytek.Endpoint.SubTitle +
          Iflytek.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.Iflytek.Endpoint.Title}
          type="text"
          value={accessStore.iflytekUrl}
          placeholder={Iflytek.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.iflytekUrl = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.Iflytek.ApiKey.Title}
        subTitle={Locale.Settings.Access.Iflytek.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Iflytek.ApiKey.Title}
          value={accessStore.iflytekApiKey}
          type="text"
          placeholder={Locale.Settings.Access.Iflytek.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.iflytekApiKey = e.currentTarget.value),
            );
          }}
        />
      </ListItem>

      <ListItem
        title={Locale.Settings.Access.Iflytek.ApiSecret.Title}
        subTitle={Locale.Settings.Access.Iflytek.ApiSecret.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.Iflytek.ApiSecret.Title}
          value={accessStore.iflytekApiSecret}
          type="text"
          placeholder={Locale.Settings.Access.Iflytek.ApiSecret.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.iflytekApiSecret = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  // ---- 302.AI ----
  const ai302ConfigComponent = accessStore.provider ===
    ServiceProvider["302.AI"] && (
    <>
      <ListItem
        title={Locale.Settings.Access.AI302.Endpoint.Title}
        subTitle={
          Locale.Settings.Access.AI302.Endpoint.SubTitle + AI302.ExampleEndpoint
        }
      >
        <input
          aria-label={Locale.Settings.Access.AI302.Endpoint.Title}
          type="text"
          value={accessStore.ai302Url}
          placeholder={AI302.ExampleEndpoint}
          onChange={(e) =>
            accessStore.update(
              (access) => (access.ai302Url = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.Access.AI302.ApiKey.Title}
        subTitle={Locale.Settings.Access.AI302.ApiKey.SubTitle}
      >
        <PasswordInput
          aria-label={Locale.Settings.Access.AI302.ApiKey.Title}
          value={accessStore.ai302ApiKey}
          type="text"
          placeholder={Locale.Settings.Access.AI302.ApiKey.Placeholder}
          onChange={(e) => {
            accessStore.update(
              (access) => (access.ai302ApiKey = e.currentTarget.value),
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
              {googleConfigComponent}
              {anthropicConfigComponent}
              {baiduConfigComponent}
              {byteDanceConfigComponent}
              {alibabaConfigComponent}
              {tencentConfigComponent}
              {moonshotConfigComponent}
              {deepseekConfigComponent}
              {stabilityConfigComponent}
              {lflytekConfigComponent}
              {XAIConfigComponent}
              {chatglmConfigComponent}
              {siliconflowConfigComponent}
              {ai302ConfigComponent}
            </>
          )}
        </>
      )}
    </>
  );
}
