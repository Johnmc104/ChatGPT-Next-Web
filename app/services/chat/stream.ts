import { REQUEST_TIMEOUT_MS } from "@/app/constant";
import { ChatOptions } from "@/app/client/api";
import { ChatMessageTool } from "@/app/store";
import Locale from "@/app/locales";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { prettyObject } from "@/app/utils/format";
import { fetch as tauriFetch } from "@/app/utils/stream";
import { logger } from "@/app/utils/logger";

export function stream(
  chatPath: string,
  requestPayload: object,
  headers: Record<string, string>,
  tools: ChatMessageTool[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseSSE: (text: string, runTools: ChatMessageTool[]) => string | undefined,
  processToolMessage: (
    requestPayload: object,
    toolCallMessage: Record<string, unknown>,
    toolCallResult: Record<string, unknown>[],
  ) => void,
  options: ChatOptions,
) {
  // Delegate to streamWithThink by wrapping the simple parseSSE callback
  // into the { isThinking, content } format. Thinking markers are never
  // emitted because isThinking is always false.
  return streamWithThink(
    chatPath,
    requestPayload,
    headers,
    tools,
    funcs,
    controller,
    (text: string, runTools: ChatMessageTool[]) => ({
      isThinking: false,
      content: parseSSE(text, runTools),
    }),
    processToolMessage,
    options,
  );
}

export function streamWithThink(
  chatPath: string,
  requestPayload: object,
  headers: Record<string, string>,
  tools: ChatMessageTool[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseSSE: (
    text: string,
    runTools: ChatMessageTool[],
  ) => {
    isThinking: boolean;
    content: string | undefined;
  },
  processToolMessage: (
    requestPayload: object,
    toolCallMessage: Record<string, unknown>,
    toolCallResult: Record<string, unknown>[],
  ) => void,
  options: ChatOptions,
) {
  let responseText = "";
  let remainText = "";
  let finished = false;
  let running = false;
  let runTools: ChatMessageTool[] = [];
  let responseRes: Response;
  let isInThinkingMode = false;
  let lastIsThinking = false;
  let lastIsThinkingTagged = false; //between <think> and </think> tags
  let usageData:
    | { promptTokens: number; completionTokens: number; totalTokens: number }
    | undefined;

  // animate response to make it looks smooth
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  function animateResponseText() {
    if (finished || controller.signal.aborted) {
      // flush remaining text immediately
      if (remainText.length > 0) {
        responseText += remainText;
        remainText = "";
        options.onUpdate?.(responseText, "");
      }
      logger.info("[Response Animation] finished");
      if (responseText?.length === 0) {
        options.onError?.(new Error("empty response from server"));
      }
      animTimer = null;
      return;
    }

    if (remainText.length > 0) {
      const fetchCount = Math.max(1, Math.round(remainText.length / 60));
      const fetchText = remainText.slice(0, fetchCount);
      responseText += fetchText;
      remainText = remainText.slice(fetchCount);
      options.onUpdate?.(responseText, fetchText);
    }

    // Schedule next frame only if there's more to render or stream isn't done
    if (remainText.length > 0) {
      animTimer = setTimeout(animateResponseText, 33); // ~30fps
    } else {
      animTimer = null;
    }
  }

  /** Kick off animation when new text arrives from SSE */
  function scheduleAnimation() {
    if (animTimer === null) {
      animTimer = setTimeout(animateResponseText, 33);
    }
  }

  const finish = () => {
    if (!finished) {
      if (!running && runTools.length > 0) {
        const toolCallMessage = {
          role: "assistant",
          tool_calls: [...runTools],
        };
        running = true;
        runTools.splice(0, runTools.length); // empty runTools
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
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
                if (res.status >= 300) {
                  return Promise.reject(content);
                }
                return content;
              })
              .then((content) => {
                options?.onAfterTool?.({
                  ...tool,
                  content,
                  isError: false,
                });
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
            // call again
            logger.debug("[ChatAPI] restart");
            running = false;
            chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
          }, 60);
        });
        return;
      }
      if (running) {
        return;
      }
      logger.debug("[ChatAPI] end");
      finished = true;
      // Close thinking marker if stream ends while still in thinking mode
      if (isInThinkingMode) {
        remainText += "\n<!--/THINKING-->";
      }
      // Flush remaining text through animation
      animateResponseText();
      options.onFinish(responseText + remainText, responseRes, usageData);
    }
  };

  controller.signal.onabort = finish;

  function chatApi(
    chatPath: string,
    headers: Record<string, string>,
    requestPayload: object,
    tools: ChatMessageTool[],
  ) {
    const chatPayload = {
      method: "POST",
      body: JSON.stringify({
        ...requestPayload,
        tools: tools && tools.length ? tools : undefined,
      }),
      signal: controller.signal,
      headers,
    };
    const requestTimeoutId = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    fetchEventSource(chatPath, {
      fetch: tauriFetch as typeof globalThis.fetch,
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type");
        logger.info("[Request] response content type: ", contentType);
        responseRes = res;

        if (contentType?.startsWith("text/plain")) {
          responseText = await res.clone().text();
          return finish();
        }

        if (
          !res.ok ||
          !res.headers
            .get("content-type")
            ?.startsWith(EventStreamContentType) ||
          res.status !== 200
        ) {
          const responseTexts = [responseText];
          let extraInfo = await res.clone().text();
          try {
            const resJson = await res.clone().json();
            extraInfo = prettyObject(resJson);
          } catch {}

          if (res.status === 401) {
            responseTexts.push(Locale.Error.Unauthorized);
          }

          if (extraInfo) {
            responseTexts.push(extraInfo);
          }

          responseText = responseTexts.join("\n\n");

          return finish();
        }
      },
      onmessage(msg) {
        if (msg.data === "[DONE]" || finished) {
          return finish();
        }
        const text = msg.data;
        // Skip empty messages
        if (!text || text.trim().length === 0) {
          return;
        }
        try {
          // Try to extract usage data from SSE chunk
          try {
            const json = JSON.parse(text);
            if (json.usage) {
              usageData = {
                promptTokens: json.usage.prompt_tokens ?? 0,
                completionTokens: json.usage.completion_tokens ?? 0,
                totalTokens: json.usage.total_tokens ?? 0,
              };
            }
          } catch {}

          const chunk = parseSSE(text, runTools);
          // Skip if content is empty
          if (!chunk?.content || chunk.content.length === 0) {
            return;
          }

          // deal with <think> and </think> tags start
          if (!chunk.isThinking) {
            if (chunk.content.startsWith("<think>")) {
              chunk.isThinking = true;
              chunk.content = chunk.content.slice(7).trim();
              lastIsThinkingTagged = true;
            } else if (chunk.content.endsWith("</think>")) {
              chunk.isThinking = false;
              chunk.content = chunk.content.slice(0, -8).trim();
              lastIsThinkingTagged = false;
            } else if (lastIsThinkingTagged) {
              chunk.isThinking = true;
            }
          }
          // deal with <think> and </think> tags end

          // Check if thinking mode changed
          const isThinkingChanged = lastIsThinking !== chunk.isThinking;
          lastIsThinking = chunk.isThinking;

          if (chunk.isThinking) {
            // If in thinking mode
            if (!isInThinkingMode || isThinkingChanged) {
              // If this is a new thinking block or mode changed, add prefix
              isInThinkingMode = true;
              if (remainText.length > 0) {
                remainText += "\n";
              }
              remainText += "<!--THINKING-->\n> " + chunk.content;
            } else {
              // Handle newlines in thinking content
              if (chunk.content.includes("\n\n")) {
                const lines = chunk.content.split("\n\n");
                remainText += lines.join("\n\n> ");
              } else {
                remainText += chunk.content;
              }
            }
          } else {
            // If in normal mode
            if (isInThinkingMode || isThinkingChanged) {
              // If switching from thinking mode to normal mode
              isInThinkingMode = false;
              remainText += "\n<!--/THINKING-->\n\n" + chunk.content;
            } else {
              remainText += chunk.content;
            }
          }
          scheduleAnimation();
        } catch (e) {
          console.error("[Request] parse error", text, msg, e);
          // Don't throw error for parse failures, just log them
        }
      },
      onclose() {
        finish();
      },
      onerror(e) {
        options?.onError?.(e);
        throw e;
      },
      openWhenHidden: true,
    });
  }
  logger.debug("[ChatAPI] start");
  chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
}
