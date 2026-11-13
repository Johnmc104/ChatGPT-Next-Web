/**
 * Validation of model-generated conversation titles.
 *
 * Title generation used to store whatever text came back, which let raw
 * response JSON, code fences and reasoning blocks become session names.
 * A title is accepted only if it looks like a short line of prose.
 */

import { stripThinkingBlocks } from "../../utils/message";

export const MAX_TOPIC_LENGTH = 50;

/** Keys that only appear when a response body or error leaked into a title. */
const LEAKED_JSON_PATTERN =
  /"(?:id|object|choices|error|model|usage|message|created)"\s*:/;

const EDGE_QUOTES = /^["'`“”‘’「」『』《》*#\s]+|["'`“”‘’「」『』《》*#\s]+$/g;
const TRAILING_PUNCTUATION = /[，。！？、；：,.!?;:]+$/;
const LABEL_PREFIX = /^(?:title|topic|标题|主题)\s*[:：]\s*/i;

/** True when a stored topic is a leaked response/JSON rather than a title. */
export function looksLikeLeakedTopic(topic: string): boolean {
  const text = topic.trim();
  return (
    text.startsWith("{") ||
    text.startsWith("[") ||
    text.startsWith("```") ||
    LEAKED_JSON_PATTERN.test(text)
  );
}

function titleFromJson(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string") return parsed;
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const value = record.title ?? record.topic;
      if (typeof value === "string") return value;
    }
  } catch {}
  return null;
}

/**
 * Normalise a model's title reply. Returns `null` when the reply is not
 * usable as a title (empty, JSON payload, error dump).
 */
export function sanitizeTopic(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  let text = stripThinkingBlocks(raw)
    .replace(/```[\w-]*\n?/g, "")
    .trim();
  if (!text) return null;

  // Models occasionally answer `{"title": "…"}`; accept that, reject others.
  if (text.startsWith("{") || text.startsWith("[")) {
    const fromJson = titleFromJson(text);
    if (fromJson === null) return null;
    text = fromJson.trim();
  }

  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const title = firstLine
    .replace(LABEL_PREFIX, "")
    .replace(EDGE_QUOTES, "")
    .replace(TRAILING_PUNCTUATION, "")
    .replace(EDGE_QUOTES, "")
    .trim();
  if (!title || looksLikeLeakedTopic(title)) return null;

  const chars = Array.from(title);
  return chars.length > MAX_TOPIC_LENGTH
    ? chars.slice(0, MAX_TOPIC_LENGTH).join("").trim()
    : title;
}
