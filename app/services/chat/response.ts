import Locale from "@/app/locales";
import type { ChatMessageTool } from "@/app/store";
import {
  describeUpstreamError,
  type ToolCallDelta,
} from "@/app/domain/chat/sse";

/**
 * Merge streamed tool-call deltas into `runTools`: a delta with an `id`
 * starts a new call, later deltas append argument fragments by `index`.
 */
export function accumulateToolCalls(
  deltas: ToolCallDelta[],
  runTools: ChatMessageTool[],
) {
  for (const delta of deltas) {
    const args = delta.function?.arguments ?? "";
    if (delta.id) {
      runTools.push({
        id: delta.id,
        index: delta.index,
        type: delta.type,
        function: {
          name: delta.function?.name ?? "",
          arguments: args,
        },
      });
      continue;
    }
    const target =
      runTools.find((tool) => tool.index === delta.index) ??
      runTools[delta.index ?? runTools.length - 1];
    if (target?.function) {
      target.function.arguments = (target.function.arguments ?? "") + args;
    }
  }
}

/**
 * Read a non-streaming JSON response. Throws a readable error for non-2xx
 * statuses, non-JSON bodies, and 2xx bodies that carry an `error` field, so
 * callers report failures through onError instead of rendering the body.
 */
export async function readJsonResponse(
  res: Response,
): Promise<Record<string, unknown>> {
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      Locale.Chat.Stream.HttpError(res.status, text.trim().slice(0, 500)),
    );
  }
  const record =
    typeof json === "object" && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : undefined;
  const hasError =
    record?.error !== undefined &&
    record.error !== null &&
    record.error !== false;
  if (!res.ok || hasError) {
    throw new Error(
      Locale.Chat.Stream.HttpError(
        res.status,
        hasError ? describeUpstreamError(record) : text.trim().slice(0, 500),
      ),
    );
  }
  if (!record) {
    throw new Error(Locale.Chat.Stream.Empty());
  }
  return record;
}

/** True when a non-streaming extraction produced neither text nor parts. */
export function isEmptyOutput(message: unknown): boolean {
  if (typeof message === "string") return message.trim().length === 0;
  if (Array.isArray(message)) return message.length === 0;
  return true;
}

/** Error for a successful response that carried no output. */
export function emptyOutputError(res: Record<string, unknown>): Error {
  const reason = getFinishReason(res);
  return new Error(
    reason === "length"
      ? Locale.Chat.Stream.Length
      : Locale.Chat.Stream.Empty(reason),
  );
}

/** `choices[0].finish_reason` of a non-streaming response, if present. */
export function getFinishReason(
  res: Record<string, unknown>,
): string | undefined {
  const choices = res.choices;
  if (!Array.isArray(choices)) return undefined;
  const reason = (choices[0] as { finish_reason?: unknown } | undefined)
    ?.finish_reason;
  return typeof reason === "string" ? reason : undefined;
}
