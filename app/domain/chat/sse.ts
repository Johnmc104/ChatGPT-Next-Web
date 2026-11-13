/**
 * Parsing of OpenAI-compatible chat-completion stream frames.
 *
 * Compatible gateways differ in small ways that used to make the client drop
 * content silently: errors sent as a `data:` frame after a 200 response,
 * `reasoning` instead of `reasoning_content`, reasoning and answer text in the
 * same delta, array-shaped `content`, and usage-only frames without choices.
 * This module normalises one frame into a flat structure and never throws on
 * well-formed JSON.
 */

export interface ToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface StreamUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionChunk {
  /** Readable upstream error carried inside the stream, if any. */
  error?: string;
  reasoning: string;
  content: string;
  finishReason?: string;
  toolCalls: ToolCallDelta[];
  usage?: StreamUsage;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collect text from a string or an array of `{ type, text }` parts. */
export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (typeof part === "string") {
      text += part;
    } else if (
      isRecord(part) &&
      (part.type === "text" || part.type === "output_text") &&
      typeof part.text === "string"
    ) {
      text += part.text;
    }
  }
  return text;
}

/**
 * Turn the many upstream error shapes into one readable line:
 * `"msg"`, `{ message }`, `{ error: { message, code } }`, `{ msg }`.
 */
export function describeUpstreamError(error: unknown): string {
  if (typeof error === "string") return error.trim() || "upstream error";
  if (!isRecord(error)) return "upstream error";
  if (error.error !== undefined && error.error !== true) {
    return describeUpstreamError(error.error);
  }
  const message = [error.message, error.msg, error.detail].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  const code = [error.code, error.type].find(
    (value): value is string | number =>
      (typeof value === "string" && value.length > 0) ||
      typeof value === "number",
  );
  if (message && code !== undefined) return `${message} (${code})`;
  if (message) return message;
  if (code !== undefined) return `upstream error (${code})`;
  return "upstream error";
}

function parseUsage(usage: unknown): StreamUsage | undefined {
  if (!isRecord(usage)) return undefined;
  const num = (value: unknown) => (typeof value === "number" ? value : 0);
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    totalTokens: num(usage.total_tokens),
  };
}

/**
 * Parse one SSE `data:` payload. Returns `null` when the payload is not JSON
 * (keep-alive noise); every JSON payload yields a chunk.
 *
 * @param event the SSE `event:` name, when the server sent one.
 */
export function parseChatCompletionChunk(
  data: string,
  event?: string,
): ChatCompletionChunk | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    if (event === "error") {
      return {
        error: data.trim() || "upstream error",
        reasoning: "",
        content: "",
        toolCalls: [],
      };
    }
    return null;
  }

  const chunk: ChatCompletionChunk = {
    reasoning: "",
    content: "",
    toolCalls: [],
  };
  if (!isRecord(json)) {
    if (event === "error") chunk.error = describeUpstreamError(json);
    return chunk;
  }

  chunk.usage = parseUsage(json.usage);

  if (json.error === true) {
    // `{ error: true, message }` — the shape this app's own routes return.
    chunk.error = describeUpstreamError(json);
  } else if (
    json.error !== undefined &&
    json.error !== null &&
    json.error !== false
  ) {
    chunk.error = describeUpstreamError(json.error);
  } else if (event === "error") {
    chunk.error = describeUpstreamError(json);
  }

  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  if (!isRecord(choice)) return chunk;

  if (!chunk.error && choice.error !== undefined && choice.error !== null) {
    chunk.error = describeUpstreamError(choice.error);
  }
  if (typeof choice.finish_reason === "string") {
    chunk.finishReason = choice.finish_reason;
    if (!chunk.error && choice.finish_reason === "error") {
      chunk.error = "upstream stream error";
    }
  }

  // Some gateways put a full `message` into stream frames instead of `delta`.
  const delta = isRecord(choice.delta)
    ? choice.delta
    : isRecord(choice.message)
      ? choice.message
      : undefined;
  if (!delta) return chunk;

  const reasoning = delta.reasoning_content ?? delta.reasoning;
  chunk.reasoning = typeof reasoning === "string" ? reasoning : "";
  chunk.content = textFromContent(delta.content);
  if (Array.isArray(delta.tool_calls)) {
    chunk.toolCalls = delta.tool_calls.filter(isRecord) as ToolCallDelta[];
  }
  return chunk;
}
