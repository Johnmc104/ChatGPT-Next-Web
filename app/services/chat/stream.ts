import { ChatOptions } from "@/app/client/api";
import { ChatMessageTool } from "@/app/store";
import Locale from "@/app/locales";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { describeUpstreamError, type StreamUsage } from "@/app/domain/chat/sse";
import { stripThinkingBlocks } from "@/app/utils/message";
import { getTimeoutMSByModel } from "@/app/utils/model-detection";
import { logger } from "@/app/utils/logger";

/** One parsed stream frame, as returned by a provider's frame parser. */
export interface StreamChunk {
  /** Upstream error carried inside the stream; ends the request. */
  error?: string;
  /** Reasoning text, rendered as a collapsible thinking block. */
  reasoning?: string;
  /** Answer text. */
  content?: string;
  finishReason?: string;
  usage?: StreamUsage;
}

export type StreamChunkParser = (
  data: string,
  runTools: ChatMessageTool[],
  event?: string,
) => StreamChunk | null;

type ToolMessageProcessor = (
  requestPayload: object,
  toolCallMessage: Record<string, unknown>,
  toolCallResult: Record<string, unknown>[],
) => void;

const THINKING_START = "<!--THINKING-->";
const THINKING_END = "<!--/THINKING-->";
export const USER_ABORT_MESSAGE = "The user aborted a request.";

/** Build a readable error from a non-SSE or non-2xx response. */
async function describeHttpFailure(res: Response): Promise<string> {
  let detail = "";
  try {
    const text = (await res.clone().text()).trim();
    try {
      detail = describeUpstreamError(JSON.parse(text));
    } catch {
      detail = text.slice(0, 500);
    }
  } catch {}
  if (res.status === 401) {
    detail = [Locale.Error.Unauthorized, detail].filter(Boolean).join("\n\n");
  }
  return Locale.Chat.Stream.HttpError(res.status, detail);
}

/**
 * Stream an OpenAI-compatible chat completion, rendering reasoning and answer
 * text progressively and running tool calls.
 *
 * Exactly one of `options.onFinish` / `options.onError` is called per request:
 * - upstream error frame or non-2xx/non-SSE response → onError(upstream text)
 * - no answer text → onError(timeout / length / empty, with finish_reason)
 * - user stop before any text → onError(USER_ABORT_MESSAGE)
 * - otherwise → onFinish(full text, response, usage)
 */
export function streamWithThink(
  chatPath: string,
  requestPayload: object,
  headers: Record<string, string>,
  tools: ChatMessageTool[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseChunk: StreamChunkParser,
  processToolMessage: ToolMessageProcessor,
  options: ChatOptions,
) {
  let responseText = "";
  let remainText = "";
  let finished = false;
  let running = false;
  let toolsRan = false;
  let timedOut = false;
  let upstreamError: string | undefined;
  let finishReason: string | undefined;
  let runTools: ChatMessageTool[] = [];
  let responseRes: Response | undefined;
  let isInThinkingMode = false;
  let inThinkTag = false; // between raw <think> and </think> tags
  let usageData: StreamUsage | undefined;
  let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

  const model = (requestPayload as { model?: string }).model ?? "";
  const connectTimeoutMs = getTimeoutMSByModel(model);

  // Animate the response so long chunks render smoothly.
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  function animateResponseText() {
    animTimer = null;
    if (finished || remainText.length === 0) return;
    const fetchCount = Math.max(1, Math.round(remainText.length / 60));
    const fetchText = remainText.slice(0, fetchCount);
    responseText += fetchText;
    remainText = remainText.slice(fetchCount);
    options.onUpdate?.(responseText, fetchText);
    if (remainText.length > 0) {
      animTimer = setTimeout(animateResponseText, 33); // ~30fps
    }
  }

  function scheduleAnimation() {
    if (animTimer === null) {
      animTimer = setTimeout(animateResponseText, 33);
    }
  }

  function appendReasoning(text: string) {
    if (!isInThinkingMode) {
      isInThinkingMode = true;
      if (remainText.length > 0 || responseText.length > 0) remainText += "\n";
      remainText += `${THINKING_START}\n> `;
    }
    remainText += text.replace(/\n\n/g, "\n\n> ");
  }

  function appendAnswer(text: string) {
    if (isInThinkingMode) {
      isInThinkingMode = false;
      remainText += `\n${THINKING_END}\n\n`;
    }
    remainText += text;
  }

  /** Route raw `<think>…</think>` tags inside answer text to reasoning. */
  function appendContent(text: string) {
    let rest = text;
    while (rest.length > 0) {
      if (inThinkTag) {
        const end = rest.indexOf("</think>");
        if (end < 0) {
          appendReasoning(rest);
          return;
        }
        if (end > 0) appendReasoning(rest.slice(0, end));
        inThinkTag = false;
        rest = rest.slice(end + "</think>".length).replace(/^\s+/, "");
      } else {
        const start = rest.indexOf("<think>");
        if (start < 0) {
          appendAnswer(rest);
          return;
        }
        if (start > 0) appendAnswer(rest.slice(0, start));
        inThinkTag = true;
        rest = rest.slice(start + "<think>".length).replace(/^\s+/, "");
      }
    }
  }

  function runToolCalls() {
    const toolCallMessage = {
      role: "assistant",
      tool_calls: [...runTools],
    };
    running = true;
    toolsRan = true;
    runTools.splice(0, runTools.length);
    return Promise.all(
      toolCallMessage.tool_calls.map((tool) => {
        options?.onBeforeTool?.(tool);
        return Promise.resolve(
          // @ts-ignore
          funcs[tool.function.name](
            // @ts-ignore
            tool?.function?.arguments
              ? JSON.parse(tool?.function?.arguments)
              : {},
          ),
        )
          .then((res) => {
            let content = res.data || res?.statusText;
            // hotfix #5614
            content =
              typeof content === "string" ? content : JSON.stringify(content);
            if (res.status >= 300) {
              return Promise.reject(content);
            }
            return content;
          })
          .then((content) => {
            options?.onAfterTool?.({ ...tool, content, isError: false });
            return content;
          })
          .catch((e) => {
            options?.onAfterTool?.({
              ...tool,
              isError: true,
              errorMsg: e.toString(),
            });
            return e.toString();
          })
          .then((content) => ({
            name: tool.function!.name,
            role: "tool",
            content,
            tool_call_id: tool.id,
          }));
      }),
    ).then((toolCallResult) => {
      processToolMessage(requestPayload, toolCallMessage, toolCallResult);
      setTimeout(() => {
        running = false;
        if (finished || controller.signal.aborted) return finish();
        logger.debug("[ChatAPI] restart");
        chatApi();
      }, 60);
    });
  }

  function emptyResultError(): Error {
    if (timedOut) {
      return new Error(
        Locale.Chat.Stream.Timeout(Math.round(connectTimeoutMs / 1000)),
      );
    }
    if (controller.signal.aborted) return new Error(USER_ABORT_MESSAGE);
    if (finishReason === "length") return new Error(Locale.Chat.Stream.Length);
    return new Error(Locale.Chat.Stream.Empty(finishReason));
  }

  function finish() {
    if (finished) return;
    if (!upstreamError && !controller.signal.aborted && runTools.length > 0) {
      if (!running) runToolCalls();
      return;
    }
    if (running && !controller.signal.aborted) return;

    logger.debug("[ChatAPI] end");
    finished = true;
    clearTimeout(requestTimeoutId);
    if (animTimer !== null) {
      clearTimeout(animTimer);
      animTimer = null;
    }
    if (isInThinkingMode) remainText += `\n${THINKING_END}`;
    if (remainText.length > 0) {
      const flushed = remainText;
      responseText += remainText;
      remainText = "";
      options.onUpdate?.(responseText, flushed);
    }

    if (upstreamError) {
      options.onError?.(new Error(upstreamError));
      return;
    }
    const hasAnswer = stripThinkingBlocks(responseText).trim().length > 0;
    if (!hasAnswer && !toolsRan) {
      options.onError?.(emptyResultError());
      return;
    }
    options.onFinish(responseText, responseRes as Response, usageData);
  }

  controller.signal.onabort = finish;

  function chatApi() {
    const chatPayload = {
      method: "POST",
      body: JSON.stringify({
        ...requestPayload,
        tools: tools && tools.length ? tools : undefined,
      }),
      signal: controller.signal,
      headers,
    };
    requestTimeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, connectTimeoutMs);

    fetchEventSource(chatPath, {
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type") ?? "";
        logger.info("[Request] response content type: ", contentType);
        responseRes = res;

        if (res.ok && contentType.startsWith("text/plain")) {
          appendAnswer(await res.clone().text());
          return finish();
        }
        if (!res.ok || !contentType.startsWith(EventStreamContentType)) {
          upstreamError = await describeHttpFailure(res);
          return finish();
        }
      },
      onmessage(msg) {
        if (finished) return;
        if (msg.data === "[DONE]") return finish();
        if (!msg.data || msg.data.trim().length === 0) return;

        let chunk: StreamChunk | null;
        try {
          chunk = parseChunk(msg.data, runTools, msg.event);
        } catch (e) {
          console.error("[Request] parse error", msg.data, e);
          return;
        }
        if (!chunk) return;

        if (chunk.usage) usageData = chunk.usage;
        if (chunk.finishReason) finishReason = chunk.finishReason;
        if (chunk.error) {
          upstreamError = chunk.error;
          return finish();
        }
        if (chunk.reasoning) appendReasoning(chunk.reasoning);
        if (chunk.content) appendContent(chunk.content);
        if (chunk.reasoning || chunk.content) scheduleAnimation();
      },
      onclose() {
        finish();
      },
      onerror(e) {
        if (!finished) {
          upstreamError = e?.message || String(e);
          finish();
        }
        throw e;
      },
      openWhenHidden: true,
    });
  }

  logger.debug("[ChatAPI] start");
  chatApi();
}
