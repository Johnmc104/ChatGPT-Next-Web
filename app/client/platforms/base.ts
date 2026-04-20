"use client";

/**
 * BaseOpenAICompatibleApi — shared base for all providers that follow the
 * OpenAI-compatible REST API shape.
 *
 * Subclasses only need to supply a small config object; everything else
 * (path construction, extractMessage, streaming, tool calls, error handling)
 * is handled here.
 *
 * Sprint 2.3 (Phase 2) — platform client abstraction.
 */

import { REQUEST_TIMEOUT_MS } from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import { stream, streamWithThink } from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getTimeoutMSByModel,
  isVisionModel,
} from "@/app/utils";
import { preProcessImageContent } from "@/app/utils/chat";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

// ---------------------------------------------------------------------------
// Provider configuration — the only thing each subclass must supply
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** Human-readable name used in log lines, e.g. "Moonshot" */
  providerName: string;

  /**
   * Key on `useAccessStore.getState()` that holds the user-configured
   * base URL for this provider, e.g. `"moonshotUrl"`.
   */
  urlConfigKey: string;

  /** Fallback base URL used in the native (Tauri) app. */
  baseUrl: string;

  /** Proxy API path prefix used in the web build (Next.js rewrites). */
  apiPath: string;

  /** Path appended for chat completions, e.g. `"/v1/chat/completions"`. */
  chatPath: string;

  /**
   * When true, uses `streamWithThink()` instead of `stream()` and the
   * parseSSE callback handles `reasoning_content`.
   */
  supportsThinking?: boolean;

  /**
   * When true, sends `stream_options: { include_usage: true }` in
   * streaming requests.
   */
  includeUsageInStream?: boolean;

  /**
   * Vision support mode:
   * - false/undefined: text only (getMessageTextContent)
   * - true: always preprocess images (preProcessImageContent)
   * - "auto": check isVisionModel(model) to decide
   */
  supportsVision?: boolean | "auto";

  /**
   * When true, assistant messages are processed with
   * getMessageTextContentWithoutThinking to strip <think> blocks.
   */
  stripAssistantThinking?: boolean;
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export class BaseOpenAICompatibleApi implements LLMApi {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // ---- URL construction (previously ~20 lines × N files) -----------------

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = (accessStore as any)[this.config.urlConfigKey] ?? "";
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? this.config.baseUrl : this.config.apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !baseUrl.startsWith(this.config.apiPath)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  // ---- Response extraction -----------------------------------------------

  extractMessage(res: any): string {
    return res.choices?.at(0)?.message?.content ?? "";
  }

  // ---- Speech stub -------------------------------------------------------

  speech(_options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  // ---- Message pre-processing (overridable) ------------------------------

  /**
   * Build the `messages` array for the request payload.
   * Override in subclasses that need special handling (e.g. DeepSeek filters
   * ordering, Alibaba needs different image format, etc.).
   */
  protected async buildMessages(
    messages: ChatOptions["messages"],
    modelName?: string,
  ): Promise<RequestPayload["messages"]> {
    const result: RequestPayload["messages"] = [];

    const useVision =
      this.config.supportsVision === true ||
      (this.config.supportsVision === "auto" &&
        !!modelName &&
        isVisionModel(modelName));

    for (const v of messages) {
      let content: any;
      if (v.role === "assistant" && this.config.stripAssistantThinking) {
        content = getMessageTextContentWithoutThinking(v);
      } else if (useVision) {
        content = await preProcessImageContent(v.content);
      } else {
        content = getMessageTextContent(v);
      }
      result.push({ role: v.role, content });
    }

    return result;
  }

  // ---- Build request payload (overridable) --------------------------------

  protected buildPayload(
    messages: RequestPayload["messages"],
    modelConfig: any,
    shouldStream: boolean,
  ): RequestPayload {
    const payload: RequestPayload = {
      messages,
      stream: shouldStream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
    };

    if (shouldStream && this.config.includeUsageInStream) {
      payload.stream_options = { include_usage: true };
    }

    return payload;
  }

  // ---- Standard OpenAI parseSSE ------------------------------------------

  protected parseSSE(text: string, runTools: ChatMessageTool[]): string {
    const json = JSON.parse(text);
    const choices = json.choices as Array<{
      delta: {
        content: string;
        tool_calls: ChatMessageTool[];
      };
    }>;
    const tool_calls = choices[0]?.delta?.tool_calls;
    if (tool_calls?.length > 0) {
      const index = tool_calls[0]?.index;
      const id = tool_calls[0]?.id;
      const args = tool_calls[0]?.function?.arguments;
      if (id) {
        runTools.push({
          id,
          type: tool_calls[0]?.type,
          function: {
            name: tool_calls[0]?.function?.name as string,
            arguments: args,
          },
        });
      } else {
        // @ts-ignore
        runTools[index]["function"]["arguments"] += args;
      }
    }
    return choices[0]?.delta?.content;
  }

  // ---- Standard OpenAI parseSSE with thinking ----------------------------

  protected parseSSEWithThink(
    text: string,
    runTools: ChatMessageTool[],
  ): { isThinking: boolean; content: string } {
    const json = JSON.parse(text);
    const choices = json.choices as Array<{
      delta: {
        content: string | null;
        tool_calls: ChatMessageTool[];
        reasoning_content: string | null;
      };
    }>;
    const tool_calls = choices[0]?.delta?.tool_calls;
    if (tool_calls?.length > 0) {
      const index = tool_calls[0]?.index;
      const id = tool_calls[0]?.id;
      const args = tool_calls[0]?.function?.arguments;
      if (id) {
        runTools.push({
          id,
          type: tool_calls[0]?.type,
          function: {
            name: tool_calls[0]?.function?.name as string,
            arguments: args,
          },
        });
      } else {
        // @ts-ignore
        runTools[index]["function"]["arguments"] += args;
      }
    }
    const reasoning = choices[0]?.delta?.reasoning_content;
    const content = choices[0]?.delta?.content;

    if (
      (!reasoning || reasoning.length === 0) &&
      (!content || content.length === 0)
    ) {
      return { isThinking: false, content: "" };
    }

    if (reasoning && reasoning.length > 0) {
      return { isThinking: true, content: reasoning };
    } else if (content && content.length > 0) {
      return { isThinking: false, content };
    }

    return { isThinking: false, content: "" };
  }

  // ---- Standard tool-message processor -----------------------------------

  protected processToolMessage(
    requestPayload: RequestPayload,
    toolCallMessage: any,
    toolCallResult: any[],
  ): void {
    // @ts-ignore
    requestPayload?.messages?.splice(
      // @ts-ignore
      requestPayload?.messages?.length,
      0,
      toolCallMessage,
      ...toolCallResult,
    );
  }

  // ---- Chat (template method) -------------------------------------------

  async chat(options: ChatOptions): Promise<void> {
    const processedMessages = await this.buildMessages(
      options.messages,
      options.config.model,
    );

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const shouldStream = !!options.config.stream;
    const requestPayload = this.buildPayload(
      processedMessages,
      modelConfig,
      shouldStream,
    );

    console.log(
      `[Request] ${this.config.providerName} payload: `,
      requestPayload,
    );

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(this.config.chatPath);
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );

        const streamFn = this.config.supportsThinking
          ? streamWithThink
          : stream;

        const parseSSEFn = this.config.supportsThinking
          ? (text: string, runTools: ChatMessageTool[]) =>
              this.parseSSEWithThink(text, runTools)
          : (text: string, runTools: ChatMessageTool[]) =>
              this.parseSSE(text, runTools);

        return streamFn(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          parseSSEFn as any,
          (rp: RequestPayload, toolCallMessage: any, toolCallResult: any[]) =>
            this.processToolMessage(rp, toolCallMessage, toolCallResult),
          options,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }

  // ---- Usage & models stubs (overridable) --------------------------------

  async usage() {
    return { used: 0, total: 0 };
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
