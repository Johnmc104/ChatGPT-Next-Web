"use client";

import Locale from "../../locales";

/**
 * BaseOpenAICompatibleApi — shared base for all providers that follow the
 * OpenAI-compatible REST API shape.
 *
 * Subclasses only need to supply a small config object; everything else
 * (path construction, extractMessage, streaming, tool calls, error handling)
 * is handled here.
 */

import {
  useAccessStore,
  useAppConfig,
  ChatMessageTool,
  usePluginStore,
  ModelConfig,
} from "@/app/store";
import { streamWithThink } from "@/app/services/chat/stream";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  MultimodalContent,
  SpeechOptions,
} from "../api";
import {
  getMessageTextContent,
  getTimeoutMSByModel,
  isVisionModel,
} from "@/app/utils";
import { preProcessImageContent } from "@/app/services/media/image";
import {
  accumulateToolCalls,
  emptyOutputError,
  isEmptyOutput,
  readJsonResponse,
} from "@/app/services/chat/response";
import type { StreamChunk } from "@/app/services/chat/stream";
import {
  parseChatCompletionChunk,
  textFromContent,
} from "@/app/domain/chat/sse";
import { stripThinkingFromContent } from "@/app/utils/message";
import { logger } from "@/app/utils/logger";

// ---------------------------------------------------------------------------
// RequestPayload — shared by base and openai.ts (defined here to avoid cycle)
// ---------------------------------------------------------------------------

export interface RequestPayload {
  messages: {
    role: "developer" | "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  model: string;
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  modalities?: string[];
}

// ---------------------------------------------------------------------------
// Provider configuration — the only thing each subclass must supply
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** Human-readable name used in log lines, e.g. "OpenAI" */
  providerName: string;

  /**
   * Key on `useAccessStore.getState()` that holds the user-configured
   * base URL for this provider, e.g. `"openaiUrl"`.
   */
  urlConfigKey: string;

  /** Same-origin API route prefix, e.g. `/api/openai`. */
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
   * When true the server holds the provider key (e.g. RAGFlow), so the
   * user's OpenAI key is never attached to these requests.
   */
  serverManagedAuth?: boolean;
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
      baseUrl =
        (accessStore as unknown as Record<string, string>)[
          this.config.urlConfigKey
        ] ?? "";
    }

    if (baseUrl.length === 0) {
      baseUrl = this.config.apiPath;
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

    logger.info("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  protected requestHeaders() {
    return getHeaders(false, undefined, {
      omitUserApiKey: !!this.config.serverManagedAuth,
    });
  }

  // ---- Response extraction -----------------------------------------------

  extractMessage(res: any): string | Promise<string | MultimodalContent[]> {
    return textFromContent(res?.choices?.at(0)?.message?.content);
  }

  // ---- Speech stub -------------------------------------------------------

  speech(_options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  // ---- Message pre-processing (overridable) ------------------------------

  /**
   * Build the `messages` array for the request payload.
   * Override in subclasses that need provider-specific message handling.
   */
  protected async buildMessages(
    messages: ChatOptions["messages"],
    modelName?: string,
    providerName?: string,
  ): Promise<RequestPayload["messages"]> {
    const result: RequestPayload["messages"] = [];

    const useVision =
      this.config.supportsVision === true ||
      (this.config.supportsVision === "auto" &&
        !!modelName &&
        isVisionModel(modelName, providerName));

    for (const v of messages) {
      let content: string | MultimodalContent[];
      if (useVision) {
        content = await preProcessImageContent(v.content);
      } else {
        content = getMessageTextContent(v);
      }
      if (v.role === "assistant") content = stripThinkingFromContent(content);
      result.push({ role: v.role, content });
    }

    return result;
  }

  // ---- Ensure messages end with a user message ----------------------------

  /**
   * Some models (e.g. Claude via OpenAI-compatible API) do not support
   * "assistant message prefill" — the conversation must end with a user
   * message. This method strips trailing non-user messages to prevent the
   * error while preserving conversation context.
   */
  protected ensureLastMessageIsUser(
    messages: RequestPayload["messages"],
  ): RequestPayload["messages"] {
    if (messages.length === 0) return messages;

    // If the last message is already from the user, no change needed.
    if (messages[messages.length - 1].role === "user") {
      return messages;
    }

    // Remove trailing assistant/system messages until we find a user message
    // or run out of messages.
    const trimmed = [...messages];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== "user") {
      trimmed.pop();
    }

    // If we removed everything, fall back to original messages to avoid
    // sending an empty payload (the API will return a different error anyway).
    if (trimmed.length === 0) {
      return messages;
    }

    return trimmed;
  }

  // ---- Build request payload (overridable) --------------------------------

  protected buildPayload(
    messages: RequestPayload["messages"],
    modelConfig: Pick<
      ModelConfig,
      | "model"
      | "temperature"
      | "presence_penalty"
      | "frequency_penalty"
      | "top_p"
    >,
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

  // ---- Stream frame parsing ----------------------------------------------

  /**
   * Parse one stream frame and accumulate tool-call deltas into `runTools`.
   * Reasoning is dropped for providers that do not render thinking.
   */
  protected parseStreamChunk(
    data: string,
    runTools: ChatMessageTool[],
    event?: string,
  ): StreamChunk | null {
    const chunk = parseChatCompletionChunk(data, event);
    if (!chunk) return null;
    accumulateToolCalls(chunk.toolCalls, runTools);
    return {
      error: chunk.error,
      reasoning: this.config.supportsThinking ? chunk.reasoning : "",
      content: chunk.content,
      finishReason: chunk.finishReason,
      usage: chunk.usage,
    };
  }

  // ---- Standard tool-message processor -----------------------------------

  protected processToolMessage(
    requestPayload: RequestPayload,
    toolCallMessage: Record<string, unknown>,
    toolCallResult: Record<string, unknown>[],
  ): void {
    (requestPayload.messages as unknown[]).splice(
      requestPayload.messages.length,
      0,
      toolCallMessage,
      ...toolCallResult,
    );
  }

  // ---- Chat (template method) -------------------------------------------

  async chat(options: ChatOptions): Promise<void> {
    let processedMessages: RequestPayload["messages"];
    try {
      processedMessages = await this.buildMessages(
        options.messages,
        options.config.model,
        options.config.providerName,
      );
    } catch {
      options.onError?.(new Error(Locale.Chat.Images.ReadFailed));
      return;
    }

    const modelConfig = {
      // Request-scoped: the caller passes the target session's config.
      ...useAppConfig.getState().modelConfig,
      ...options.config,
    };

    const shouldStream = !!options.config.stream;
    const safeMessages = this.ensureLastMessageIsUser(processedMessages);
    const requestPayload = this.buildPayload(
      safeMessages,
      modelConfig,
      shouldStream,
    );

    logger.info(
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
        headers: this.requestHeaders(),
      };

      if (shouldStream) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(options.plugins ?? []);

        return streamWithThink(
          chatPath,
          requestPayload,
          this.requestHeaders(),
          tools as ChatMessageTool[],
          funcs,
          controller,
          (data: string, runTools: ChatMessageTool[], event?: string) =>
            this.parseStreamChunk(data, runTools, event),
          (
            rp: object,
            toolCallMessage: Record<string, unknown>,
            toolCallResult: Record<string, unknown>[],
          ) =>
            this.processToolMessage(
              rp as RequestPayload,
              toolCallMessage,
              toolCallResult,
            ),
          options,
        );
      } else {
        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await readJsonResponse(res);
        const message = await this.extractMessage(resJson);
        if (isEmptyOutput(message)) {
          throw emptyOutputError(resJson);
        }
        options.onFinish(message, res);
      }
    } catch (e) {
      logger.info("[Request] failed to make a chat request", e);
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
