/**
 * LLM call logic, summarization, and MCP actions for the chat store.
 *
 * Extracted from chat.ts (F-11a) to keep the store file focused on
 * state definitions and CRUD operations.
 */

import {
  getMessageTextContent,
  isDalle3,
  isImageModel,
  trimTopic,
} from "../utils";

import type { ClientApi, MultimodalContent } from "../client/api";
import { getClientApi } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { showToast } from "../utils/toast";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  KnowledgeCutOffDate,
  MCP_SYSTEM_TEMPLATE,
  MCP_TOOLS_TEMPLATE,
  ServiceProvider,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import { countTokens } from "../utils/tiktoken";
import { ModelConfig, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel } from "../utils/model";
import { executeMcpAction, getAllTools, isMcpEnabled } from "../mcp/actions";
import { extractMcpJson, isMcpJson } from "../mcp/utils";

import type { ChatMessage, ChatMessageTool, ChatSession } from "./chat-types";
import { createMessage, DEFAULT_TOPIC } from "./chat-types";
import { logger } from "@/app/utils/logger";

// ---------------------------------------------------------------------------
// Public interface — used by chat.ts for proper TypeScript inference
// ---------------------------------------------------------------------------

export interface ChatActions {
  onNewMessage(message: ChatMessage, targetSession: ChatSession): void;
  onUserInput(
    content: string,
    attachImages?: string[],
    isMcpResponse?: boolean,
  ): Promise<void>;
  getMemoryPrompt(): ChatMessage | undefined;
  getMessagesWithMemory(): Promise<ChatMessage[]>;
  summarizeSession(refreshTitle: boolean, targetSession: ChatSession): void;
  updateStat(message: ChatMessage, session: ChatSession): void;
  checkMcpJson(message: ChatMessage): void;
}

// ---------------------------------------------------------------------------
// Standalone helper functions
// ---------------------------------------------------------------------------

export function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // if it is using gpt-* models, force to use 4o-mini to summarize
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }

  return [currentModel, providerName];
}

export function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + countTokens(getMessageTextContent(cur)),
    0,
  );
}

export function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

export async function getMcpSystemPrompt(): Promise<string> {
  const tools = await getAllTools();

  let toolsStr = "";

  tools.forEach((i) => {
    // error client has no tools
    if (!i.tools) return;

    toolsStr += MCP_TOOLS_TEMPLATE.replace(
      "{{ clientId }}",
      i.clientId,
    ).replace(
      "{{ tools }}",
      i.tools.tools.map((p: object) => JSON.stringify(p, null, 2)).join("\n"),
    );
  });

  return MCP_SYSTEM_TEMPLATE.replace("{{ MCP_TOOLS }}", toolsStr);
}

// ---------------------------------------------------------------------------
// Factory: create action methods that close over the store's set / get
// ---------------------------------------------------------------------------

/**
 * Returns the action methods (LLM calls, summarisation, MCP) that are
 * mixed into the chat Zustand store.
 *
 * `get()` must return the full store (state + all methods, including CRUD
 * methods defined in chat.ts).
 */
export function createChatActions(
  set: (...args: any[]) => void,
  get: () => any,
): ChatActions {
  // -- onNewMessage --------------------------------------------------------

  function onNewMessage(message: ChatMessage, targetSession: ChatSession) {
    get().updateTargetSession(targetSession, (session: ChatSession) => {
      session.messages = session.messages.concat();
      session.lastUpdate = Date.now();
    });

    updateStat(message, targetSession);

    checkMcpJson(message);

    summarizeSession(false, targetSession);
  }

  // -- onUserInput ---------------------------------------------------------

  async function onUserInput(
    content: string,
    attachImages?: string[],
    isMcpResponse?: boolean,
  ) {
    const session = get().currentSession();
    const modelConfig = session.mask.modelConfig;

    // MCP Response no need to fill template
    let mContent: string | MultimodalContent[] = isMcpResponse
      ? content
      : fillTemplateWith(content, modelConfig);

    if (!isMcpResponse && attachImages && attachImages.length > 0) {
      mContent = [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachImages.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
      ];
    }

    let userMessage: ChatMessage = createMessage({
      role: "user",
      content: mContent,
      isMcpResponse,
    });

    const botMessage: ChatMessage = createMessage({
      role: "assistant",
      streaming: true,
      model: modelConfig.model,
    });

    // get recent messages
    const recentMessages = await getMessagesWithMemory();
    const sendMessages = recentMessages.concat(userMessage);
    const messageIndex = session.messages.length + 1;

    // save user's and bot's message
    get().updateTargetSession(session, (session: ChatSession) => {
      const savedUserMessage = {
        ...userMessage,
        content: mContent,
      };
      session.messages = session.messages.concat([
        savedUserMessage,
        botMessage,
      ]);
    });

    // getClientApi internally handles BASE_URL routing
    const api: ClientApi = getClientApi(modelConfig.providerName);
    // make request
    api.llm.chat({
      messages: sendMessages,
      config: { ...modelConfig, stream: true },
      onUpdate(message) {
        botMessage.streaming = true;
        if (message) {
          botMessage.content = message;
        }
        get().updateTargetSession(session, (session: ChatSession) => {
          session.messages = session.messages.concat();
        });
      },
      async onFinish(message, _responseRes, usage) {
        botMessage.streaming = false;
        if (message) {
          botMessage.content = message;
          botMessage.date = new Date().toLocaleString();
          if (usage) {
            botMessage.usage = {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            };
          }
          onNewMessage(botMessage, session);
        }
        ChatControllerPool.remove(session.id, botMessage.id);
      },
      onBeforeTool(tool: ChatMessageTool) {
        (botMessage.tools = botMessage?.tools || []).push(tool);
        get().updateTargetSession(session, (session: ChatSession) => {
          session.messages = session.messages.concat();
        });
      },
      onAfterTool(tool: ChatMessageTool) {
        botMessage?.tools?.forEach((t, i, tools) => {
          if (tool.id == t.id) {
            tools[i] = { ...tool };
          }
        });
        get().updateTargetSession(session, (session: ChatSession) => {
          session.messages = session.messages.concat();
        });
      },
      onError(error) {
        const isAborted = error.message?.includes?.("aborted");
        botMessage.content +=
          "\n\n" +
          prettyObject({
            error: true,
            message: error.message,
          });
        botMessage.streaming = false;
        userMessage.isError = !isAborted;
        botMessage.isError = !isAborted;
        get().updateTargetSession(session, (session: ChatSession) => {
          session.messages = session.messages.concat();
        });
        ChatControllerPool.remove(session.id, botMessage.id ?? messageIndex);

        console.error("[Chat] failed ", error);
      },
      onController(controller) {
        // collect controller for stop/retry
        ChatControllerPool.addController(
          session.id,
          botMessage.id ?? messageIndex,
          controller,
        );
      },
    });
  }

  // -- getMemoryPrompt -----------------------------------------------------

  function getMemoryPrompt() {
    const session = get().currentSession();

    if (session.memoryPrompt.length) {
      return {
        role: "system",
        content: Locale.Store.Prompt.History(session.memoryPrompt),
        date: "",
      } as ChatMessage;
    }
  }

  // -- getMessagesWithMemory -----------------------------------------------

  async function getMessagesWithMemory() {
    const session = get().currentSession();
    const modelConfig = session.mask.modelConfig;
    const clearContextIndex = session.clearContextIndex ?? 0;
    const messages = session.messages.slice();
    const totalMessageCount = session.messages.length;

    // in-context prompts
    const contextPrompts = session.mask.context.slice();

    // system prompts, to get close to OpenAI Web ChatGPT
    const shouldInjectSystemPrompts =
      modelConfig.enableInjectSystemPrompts &&
      (session.mask.modelConfig.model.startsWith("gpt-") ||
        session.mask.modelConfig.model.startsWith("chatgpt-"));

    const mcpEnabled = await isMcpEnabled();
    const mcpSystemPrompt = mcpEnabled ? await getMcpSystemPrompt() : "";

    var systemPrompts: ChatMessage[] = [];

    if (shouldInjectSystemPrompts) {
      systemPrompts = [
        createMessage({
          role: "system",
          content:
            fillTemplateWith("", {
              ...modelConfig,
              template: DEFAULT_SYSTEM_TEMPLATE,
            }) + mcpSystemPrompt,
        }),
      ];
    } else if (mcpEnabled) {
      systemPrompts = [
        createMessage({
          role: "system",
          content: mcpSystemPrompt,
        }),
      ];
    }

    if (shouldInjectSystemPrompts || mcpEnabled) {
      logger.info(
        "[Global System Prompt] ",
        systemPrompts.at(0)?.content ?? "empty",
      );
    }
    const memoryPrompt = getMemoryPrompt();
    // long term memory
    const shouldSendLongTermMemory =
      modelConfig.sendMemory &&
      session.memoryPrompt &&
      session.memoryPrompt.length > 0 &&
      session.lastSummarizeIndex > clearContextIndex;
    const longTermMemoryPrompts =
      shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];
    const longTermMemoryStartIndex = session.lastSummarizeIndex;

    // short term memory
    const shortTermMemoryStartIndex = Math.max(
      0,
      totalMessageCount - modelConfig.historyMessageCount,
    );

    // lets concat send messages, including 4 parts:
    // 0. system prompt: to get close to OpenAI Web ChatGPT
    // 1. long term memory: summarized memory messages
    // 2. pre-defined in-context prompts
    // 3. short term memory: latest n messages
    // 4. newest input message
    const memoryStartIndex = shouldSendLongTermMemory
      ? Math.min(longTermMemoryStartIndex, shortTermMemoryStartIndex)
      : shortTermMemoryStartIndex;
    // and if user has cleared history messages, we should exclude the memory too.
    const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);
    const maxTokenThreshold = modelConfig.max_tokens;

    // get recent messages as much as possible
    const reversedRecentMessages = [];
    for (
      let i = totalMessageCount - 1, tokenCount = 0;
      i >= contextStartIndex && tokenCount < maxTokenThreshold;
      i -= 1
    ) {
      const msg = messages[i];
      if (!msg || msg.isError) continue;
      tokenCount += countTokens(getMessageTextContent(msg));
      reversedRecentMessages.push(msg);
    }
    // concat all messages
    const recentMessages = [
      ...systemPrompts,
      ...longTermMemoryPrompts,
      ...contextPrompts,
      ...reversedRecentMessages.reverse(),
    ];

    return recentMessages;
  }

  // -- summarizeSession ----------------------------------------------------

  function summarizeSession(
    refreshTitle: boolean = false,
    targetSession: ChatSession,
  ) {
    const config = useAppConfig.getState();
    const session = targetSession;
    const modelConfig = session.mask.modelConfig;
    // skip summarize when using image generation models
    if (isDalle3(modelConfig.model) || isImageModel(modelConfig.model)) {
      return;
    }

    // if not config compressModel, then using getSummarizeModel
    const [model, providerName] = modelConfig.compressModel
      ? [modelConfig.compressModel, modelConfig.compressProviderName]
      : getSummarizeModel(
          session.mask.modelConfig.model,
          session.mask.modelConfig.providerName,
        );
    // getClientApi internally handles BASE_URL routing
    const api: ClientApi = getClientApi(providerName as ServiceProvider);

    // remove error messages if any
    const messages = session.messages;

    // should summarize topic after chating more than 50 words
    const SUMMARIZE_MIN_LEN = 50;
    if (
      (config.enableAutoGenerateTitle &&
        session.topic === DEFAULT_TOPIC &&
        countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
      refreshTitle
    ) {
      const startIndex = Math.max(
        0,
        messages.length - modelConfig.historyMessageCount,
      );
      const topicMessages = messages
        .slice(
          startIndex < messages.length ? startIndex : messages.length - 1,
          messages.length,
        )
        .concat(
          createMessage({
            role: "user",
            content: Locale.Store.Prompt.Topic,
          }),
        );
      api.llm.chat({
        messages: topicMessages,
        config: {
          model,
          stream: false,
          providerName,
        },
        onFinish(message, responseRes) {
          if (responseRes?.status === 200) {
            // summarize uses text-only model, message is always string
            const text = typeof message === "string" ? message : "";
            get().updateTargetSession(
              session,
              (session: ChatSession) =>
                (session.topic =
                  text.length > 0 ? trimTopic(text) : DEFAULT_TOPIC),
            );
          }
        },
        onError(error) {
          console.error("[Title] error generating title:", error);
        },
      });
    }
    const summarizeIndex = Math.max(
      session.lastSummarizeIndex,
      session.clearContextIndex ?? 0,
    );
    let toBeSummarizedMsgs = messages
      .filter((msg) => !msg.isError)
      .slice(summarizeIndex);

    const historyMsgLength = countMessages(toBeSummarizedMsgs);

    if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
      const n = toBeSummarizedMsgs.length;
      toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
        Math.max(0, n - modelConfig.historyMessageCount),
      );
    }
    const memoryPrompt = getMemoryPrompt();
    if (memoryPrompt) {
      // add memory prompt
      toBeSummarizedMsgs.unshift(memoryPrompt);
    }

    const lastSummarizeIndex = session.messages.length;

    logger.info(
      "[Chat History] ",
      toBeSummarizedMsgs,
      historyMsgLength,
      modelConfig.compressMessageLengthThreshold,
    );

    if (
      historyMsgLength > modelConfig.compressMessageLengthThreshold &&
      modelConfig.sendMemory
    ) {
      /** Destruct max_tokens while summarizing
       * this param is just shit
       **/
      const { max_tokens, ...modelcfg } = modelConfig;
      api.llm.chat({
        messages: toBeSummarizedMsgs.concat(
          createMessage({
            role: "system",
            content: Locale.Store.Prompt.Summarize,
            date: "",
          }),
        ),
        config: {
          ...modelcfg,
          stream: true,
          model,
          providerName,
        },
        onUpdate(message) {
          if (typeof message === "string") {
            session.memoryPrompt = message;
          }
        },
        onFinish(message, responseRes) {
          if (responseRes?.status === 200) {
            // memory summary uses text-only model
            const text = typeof message === "string" ? message : "";
            logger.info("[Memory] ", text);
            get().updateTargetSession(session, (session: ChatSession) => {
              session.lastSummarizeIndex = lastSummarizeIndex;
              session.memoryPrompt = text; // Update the memory prompt for stored it in local storage
            });
          }
        },
        onError(err) {
          console.error("[Summarize] ", err);
        },
      });
    }
  }

  // -- updateStat ----------------------------------------------------------

  function updateStat(message: ChatMessage, session: ChatSession) {
    get().updateTargetSession(session, (session: ChatSession) => {
      session.stat.charCount += message.content.length;
      // TODO: should update chat count and word count
    });
  }

  // -- checkMcpJson --------------------------------------------------------

  function checkMcpJson(message: ChatMessage) {
    const mcpEnabled = isMcpEnabled();
    if (!mcpEnabled) return;
    const content = getMessageTextContent(message);
    if (isMcpJson(content)) {
      try {
        const mcpRequest = extractMcpJson(content);
        if (mcpRequest) {
          logger.debug("[MCP Request]", mcpRequest);

          executeMcpAction(mcpRequest.clientId, mcpRequest.mcp)
            .then((result) => {
              logger.info("[MCP Response]", result);
              const mcpResponse =
                typeof result === "object"
                  ? JSON.stringify(result)
                  : String(result);
              onUserInput(
                `\`\`\`json:mcp-response:${mcpRequest.clientId}\n${mcpResponse}\n\`\`\``,
                [],
                true,
              );
            })
            .catch((error) => showToast("MCP execution failed", error));
        }
      } catch (error) {
        console.error("[Check MCP JSON]", error);
      }
    }
  }

  // -- public surface ------------------------------------------------------

  return {
    onNewMessage,
    onUserInput,
    getMemoryPrompt,
    getMessagesWithMemory,
    summarizeSession,
    updateStat,
    checkMcpJson,
  };
}
