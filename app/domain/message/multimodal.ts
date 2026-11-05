export type ImageSource =
  | { type: "url"; value: string }
  | { type: "base64"; value: string };

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

function dataUriParts(value: string):
  | { source: ImageSource; mimeType?: string }
  | undefined {
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

function imageSource(
  value: string,
  mimeType?: string,
): ImagePart {
  const data = dataUriParts(value);
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
  if (value.type === "text" && typeof value.text === "string") {
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
    return {
      kind: "image",
      source: { type: "base64", value: inline.data },
      mimeType,
    };
  }

  const anthropic = value.source as Record<string, unknown> | undefined;
  if (value.type === "image" && anthropic) {
    if (
      anthropic.type === "base64" &&
      typeof anthropic.data === "string"
    ) {
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

/** Convert normalized parts to the OpenAI-compatible chat content shape. */
export function toOpenAIContent(parts: NormalizedPart[]) {
  return parts.flatMap((part) => {
    if (part.kind === "text") {
      return [{ type: "text" as const, text: part.text }];
    }
    if (part.kind === "image") {
      const url =
        part.source.type === "base64"
          ? `data:${part.mimeType ?? "application/octet-stream"};base64,${part.source.value}`
          : part.source.value;
      return [{ type: "image_url" as const, image_url: { url } }];
    }
    return [];
  });
}

/** Convert normalized parts to Gemini's camelCase content shape. */
export function toGeminiContent(parts: NormalizedPart[]) {
  return parts.flatMap((part) => {
    if (part.kind === "text") {
      return [{ text: part.text }];
    }
    if (part.kind === "image" && part.source.type === "base64") {
      return [
        {
          inlineData: {
            mimeType: part.mimeType ?? "application/octet-stream",
            data: part.source.value,
          },
        },
      ];
    }
    return part.kind === "image"
      ? [{ fileData: { fileUri: part.source.value } }]
      : [];
  });
}

/** Convert normalized parts to Anthropic's content block shape. */
export function toAnthropicContent(parts: NormalizedPart[]) {
  return parts.flatMap((part) => {
    if (part.kind === "text") {
      return [{ type: "text" as const, text: part.text }];
    }
    if (part.kind === "image") {
      if (part.source.type === "base64") {
        return [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: part.mimeType ?? "application/octet-stream",
              data: part.source.value,
            },
          },
        ];
      }
      return [
        {
          type: "image" as const,
          source: { type: "url" as const, url: part.source.value },
        },
      ];
    }
    return [];
  });
}
