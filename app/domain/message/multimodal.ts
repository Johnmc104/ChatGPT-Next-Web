export type ImageSource =
  { type: "url"; value: string } | { type: "base64"; value: string };

export interface TextPart {
  kind: "text";
  text: string;
}

export interface ImagePart {
  kind: "image";
  source: ImageSource;
  mimeType?: string;
}

export interface UnknownPart {
  kind: "unknown";
  raw: unknown;
}

export type NormalizedPart = TextPart | ImagePart | UnknownPart;

function dataUriParts(
  value: string,
): { source: ImageSource; mimeType?: string } | undefined {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return undefined;
  return {
    source: {
      type: match[2] ? "base64" : "url",
      value: match[3],
    },
    mimeType: match[1],
  };
}

const supportedMime = /^image\/(?:png|jpe?g|webp|gif|heic|heif)$/i;

function imageSource(
  value: string,
  mimeType?: string,
): ImagePart | UnknownPart {
  const data = dataUriParts(value);
  if (
    !value ||
    (value.startsWith("data:") &&
      (!data ||
        data.source.type !== "base64" ||
        !supportedMime.test(data.mimeType ?? "") ||
        !data.source.value))
  ) {
    return { kind: "unknown", raw: value };
  }
  return {
    kind: "image",
    source: data?.source ?? { type: "url", value },
    mimeType: data?.mimeType ?? mimeType,
  };
}

function fromPart(part: unknown): NormalizedPart {
  if (!part || typeof part !== "object") {
    return { kind: "unknown", raw: part };
  }

  const value = part as Record<string, unknown>;
  if (
    (value.type === "text" || value.type === undefined) &&
    typeof value.text === "string"
  ) {
    return { kind: "text", text: value.text };
  }

  const openai = value.image_url as Record<string, unknown> | undefined;
  if (value.type === "image_url" && typeof openai?.url === "string") {
    return imageSource(openai.url);
  }

  const inline =
    (value.inline_data as Record<string, unknown> | undefined) ??
    (value.inlineData as Record<string, unknown> | undefined);
  if (inline && typeof inline.data === "string") {
    const mimeType =
      typeof inline.mime_type === "string"
        ? inline.mime_type
        : typeof inline.mimeType === "string"
          ? inline.mimeType
          : undefined;
    return mimeType && supportedMime.test(mimeType) && inline.data
      ? {
          kind: "image",
          source: { type: "base64", value: inline.data },
          mimeType,
        }
      : { kind: "unknown", raw: part };
  }

  const anthropic = value.source as Record<string, unknown> | undefined;
  if (value.type === "image" && anthropic) {
    if (anthropic.type === "base64" && typeof anthropic.data === "string") {
      return {
        kind: "image",
        source: { type: "base64", value: anthropic.data },
        mimeType:
          typeof anthropic.media_type === "string"
            ? anthropic.media_type
            : undefined,
      };
    }
    if (anthropic.type === "url" && typeof anthropic.url === "string") {
      return imageSource(anthropic.url);
    }
  }

  return { kind: "unknown", raw: part };
}

/** Normalize common provider-specific multimodal parts into one internal form. */
export function normalizeMultimodalContent(content: unknown): NormalizedPart[] {
  if (typeof content === "string") {
    return [{ kind: "text", text: content }];
  }
  if (!Array.isArray(content)) return [];
  return content.map(fromPart);
}

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Convert normalized parts to the OpenAI-compatible chat content shape. */
export function toOpenAIContent(parts: NormalizedPart[]) {
  return parts.flatMap<OpenAIContentPart>((part) => {
    if (part.kind === "text") {
      return [{ type: "text" as const, text: part.text }];
    }
    if (part.kind === "image") {
      const url =
        part.source.type === "base64"
          ? `data:${part.mimeType ?? "application/octet-stream"};base64,${
              part.source.value
            }`
          : part.source.value;
      return [{ type: "image_url" as const, image_url: { url } }];
    }
    return [];
  });
}
