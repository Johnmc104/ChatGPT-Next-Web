"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  OPENAI_BASE_URL,
  DEFAULT_MODELS,
  OpenaiPath,
  Azure,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
} from "@/app/constant";
import {
  ChatMessageTool,
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
} from "@/app/store";
import { collectModelsWithDefaultModel } from "@/app/utils/model";
import {
  preProcessImageContent,
  uploadImage,
  base64Image2Blob,
  cacheBase64Image,
  streamWithThink,
} from "@/app/utils/chat";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { ModelSize, DalleStyle, ImageQuality } from "@/app/typing";

import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
  SpeechOptions,
} from "../api";
import Locale from "../../locales";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageImages,
  isVisionModel,
  isDalle3 as _isDalle3,
  isImageModel as _isImageModel,
  isGptImageModel as _isGptImageModel,
  isGpt5Model,
  isReasoningModel,
  getTimeoutMSByModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

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

export interface ImageGenerationPayload {
  model: string;
  prompt: string;
  response_format?: "url" | "b64_json";
  output_format?: "png" | "jpeg" | "webp";
  output_compression?: number;
  n: number;
  size: ModelSize;
  quality?: ImageQuality;
  style?: DalleStyle;
  partial_images?: number;
}

export class ChatGPTApi implements LLMApi {
  private disableListModels = true;

  path(path: string, customHeaders?: Record<string, string>): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    const isAzure = path.includes("deployments");
    if (accessStore.useCustomConfig) {
      baseUrl = isAzure ? accessStore.azureUrl : accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = isAzure ? ApiPath.Azure : ApiPath.OpenAI;
      baseUrl = isApp ? OPENAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !isAzure &&
      !baseUrl.startsWith(ApiPath.OpenAI)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    // When using custom config with external URL, use proxy to avoid CORS
    const isApp = !!getClientConfig()?.isApp;
    if (
      !isApp &&
      accessStore.useCustomConfig &&
      baseUrl.startsWith("http") &&
      !baseUrl.startsWith(location.origin)
    ) {
      // Use server-side proxy for external URLs
      const targetUrl = cloudflareAIGatewayUrl([baseUrl, path].join("/"));
      if (customHeaders) {
        customHeaders["X-Base-URL"] = baseUrl;
      }
      // Return proxy path with the actual path
      return `/api/proxy/${path}`;
    }

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  /**
   * Get the base URL for custom config (used for X-Base-URL header)
   */
  getCustomBaseUrl(): string | undefined {
    const accessStore = useAccessStore.getState();
    const isApp = !!getClientConfig()?.isApp;

    if (!isApp && accessStore.useCustomConfig) {
      let baseUrl = accessStore.openaiUrl;
      if (baseUrl.endsWith("/")) {
        baseUrl = baseUrl.slice(0, baseUrl.length - 1);
      }
      if (!baseUrl.startsWith("http")) {
        baseUrl = "https://" + baseUrl;
      }
      if (baseUrl.startsWith("http") && !baseUrl.startsWith(location.origin)) {
        return baseUrl;
      }
    }
    return undefined;
  }

  async extractMessage(res: any) {
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }
    // dalle3 model return url, using url create image message
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        // uploadImage — cache in ServiceWorker (async blob conversion)
        url = await cacheBase64Image(b64_json, "image/png");
      }
      const parts: MultimodalContent[] = [];
      // Capture revised_prompt from DALL-E
      const revisedPrompt = res.data?.at(0)?.revised_prompt;
      if (revisedPrompt) {
        parts.push({ type: "text", text: revisedPrompt });
      }
      parts.push({ type: "image_url", image_url: { url } });
      return parts;
    }

    const message = res.choices?.at(0)?.message;
    if (!message) {
      // No choices — return stringified response, never a raw object
      return typeof res === "string" ? res : JSON.stringify(res);
    }

    // Handle image generation responses:
    // 1. OpenRouter format: message.images[].image_url.url
    // 2. Multimodal content: message.content as array with image_url items
    let textContent = "";

    // Collect raw image URLs from both formats
    const rawUrls: string[] = [];

    // Check for OpenRouter-style images field
    if (Array.isArray(message.images)) {
      for (const img of message.images) {
        const url = img?.image_url?.url ?? img?.url ?? "";
        if (url) rawUrls.push(url);
      }
    }

    // Check if content is multimodal array (may contain images + text)
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "image_url" && part.image_url?.url) {
          rawUrls.push(part.image_url.url);
        } else if (part.type === "text" && part.text) {
          textContent += part.text;
        }
      }
    } else if (typeof message.content === "string") {
      textContent = message.content;
    }

    // Cache all base64 data URIs in parallel (non-blocking blob conversion)
    if (rawUrls.length > 0) {
      const cachedUrls = await Promise.all(
        rawUrls.map(async (url) => {
          if (url.startsWith("data:")) {
            try {
              const mime = url.split(";")[0].split(":")[1] || "image/png";
              return await cacheBase64Image(url.split(",")[1], mime);
            } catch (e) {
              console.warn("[Image] failed to cache base64 image", e);
              return url; // keep original data URI as fallback
            }
          }
          return url;
        }),
      );

      const images: MultimodalContent[] = cachedUrls.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      }));

      const parts: MultimodalContent[] = [];
      if (textContent) {
        parts.push({ type: "text", text: textContent });
      }
      parts.push(...images);
      return parts;
    }

    // Always return a string — never a raw API response object,
    // which would break getMessageTextContent ("content is not iterable")
    return textContent || (typeof res === "string" ? res : JSON.stringify(res));
  }

  async speech(options: SpeechOptions): Promise<ArrayBuffer> {
    const requestPayload = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.response_format,
      speed: options.speed,
    };

    console.log("[Request] openai speech payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const customBaseUrl = this.getCustomBaseUrl();
      const speechPath = this.path(OpenaiPath.SpeechPath);
      const speechPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(false, customBaseUrl),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(speechPath, speechPayload);
      clearTimeout(requestTimeoutId);
      return await res.arrayBuffer();
    } catch (e) {
      console.log("[Request] failed to make a speech request", e);
      throw e;
    }
  }

  /**
   * Build the payload for image generation requests (DALL-E 3, gpt-image-*, cogview, etc.)
   */
  private buildImageGenPayload(
    options: ChatOptions,
    flags: {
      isDalle3: boolean;
      isGptImageModel: boolean;
      isImageEdit: boolean;
    },
  ): ImageGenerationPayload {
    const prompt = getMessageTextContent(
      options.messages.slice(-1)?.pop() as any,
    );
    return {
      model: options.config.model,
      prompt,
      n: 1,
      size: options.config?.size ?? "1024x1024",
      // GPT Image models use output_format (png/jpeg/webp); DALL-E uses response_format.
      ...(flags.isGptImageModel
        ? {
            output_format: options.config?.outputFormat ?? "png",
            ...((options.config?.outputFormat === "jpeg" ||
              options.config?.outputFormat === "webp") && {
              output_compression: 100,
            }),
          }
        : flags.isDalle3
        ? { response_format: "b64_json" as const }
        : { response_format: "b64_json" as const }),
      // Quality & style mapping per model family
      ...(flags.isDalle3
        ? {
            quality: options.config?.quality ?? "standard",
            style: options.config?.style ?? "vivid",
          }
        : flags.isGptImageModel
        ? {
            quality: (["low", "medium", "high", "auto"] as string[]).includes(
              options.config?.quality ?? "",
            )
              ? options.config!.quality
              : options.config?.quality === "hd"
              ? "high"
              : "auto",
          }
        : {}),
      // partial_images for progressive preview (GPT Image only, not edits)
      ...(flags.isGptImageModel && !flags.isImageEdit
        ? { partial_images: 2 }
        : {}),
    };
  }

  /**
   * Parse an SSE stream containing partial_images events (progressive preview).
   * Returns the final JSON payload for extractMessage().
   */
  private async parsePartialImageStream(
    body: ReadableStream<Uint8Array>,
    onUpdate?: ChatOptions["onUpdate"],
  ): Promise<any> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let prevBlobUrl = "";
    let finalJson: any = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (delimited by \n\n)
        while (buffer.includes("\n\n")) {
          const idx = buffer.indexOf("\n\n");
          const eventBlock = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          // Skip heartbeat comments and empty blocks
          if (!eventBlock.trim() || eventBlock.trim().startsWith(":")) continue;

          // Parse SSE event lines
          let eventData = "";
          for (const line of eventBlock.split("\n")) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6);
              if (payload === "[DONE]") continue;
              eventData += payload;
            }
          }

          if (!eventData) continue;

          try {
            const json = JSON.parse(eventData);

            if (json.type === "partial_image" && json.b64_json) {
              // Convert partial preview to blob URL for display
              const fmt = json.output_format || "png";
              const blob = base64Image2Blob(json.b64_json, `image/${fmt}`);
              const blobUrl = URL.createObjectURL(blob);

              // Revoke previous preview to free memory
              if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl);
              prevBlobUrl = blobUrl;

              // Update UI with progressive preview
              const parts: MultimodalContent[] = [
                { type: "image_url", image_url: { url: blobUrl } },
              ];
              onUpdate?.(parts, "");
            } else if (json.type === "completed" && json.b64_json) {
              finalJson = {
                data: [
                  {
                    b64_json: json.b64_json,
                    revised_prompt: json.revised_prompt,
                  },
                ],
              };
            } else if (json.data) {
              // Standard wrapped JSON (fallback if partial_images not honored)
              finalJson = json;
            }
          } catch (e) {
            console.warn("[SSE] failed to parse event data", e);
          }
        }
      }
    } finally {
      // Always clean up preview blob URLs — even on abort/error
      if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl);
    }

    return finalJson || {};
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    let requestPayload: RequestPayload | ImageGenerationPayload;

    const isDalle3 = _isDalle3(options.config.model);
    const isImageGen = _isImageModel(options.config.model);
    const isO1OrO3 = isReasoningModel(options.config.model);
    const isGpt5 = isGpt5Model(options.config.model);
    const isGptImageModel = _isGptImageModel(options.config.model);

    // Detect image edit: last message has attached images + is a GPT Image model
    const lastMessage = options.messages[options.messages.length - 1];
    const attachedImages = lastMessage
      ? getMessageImages(lastMessage as any)
      : [];
    const isImageEdit =
      isImageGen && isGptImageModel && attachedImages.length > 0;
    if (isImageGen) {
      requestPayload = this.buildImageGenPayload(options, {
        isDalle3,
        isGptImageModel,
        isImageEdit,
      });
    } else {
      const visionModel = isVisionModel(options.config.model);
      const messages: ChatOptions["messages"] = [];
      for (const v of options.messages) {
        const content = visionModel
          ? await preProcessImageContent(v.content)
          : getMessageTextContent(v);
        if (!(isO1OrO3 && v.role === "system"))
          messages.push({ role: v.role, content });
      }

      // O1 not support image, tools (plugin in ChatGPTNextWeb) and system, stream, logprobs, temperature, top_p, n, presence_penalty, frequency_penalty yet.
      requestPayload = {
        messages,
        stream: options.config.stream,
        model: modelConfig.model,
        temperature: !isO1OrO3 && !isGpt5 ? modelConfig.temperature : 1,
        presence_penalty: !isO1OrO3 ? modelConfig.presence_penalty : 0,
        frequency_penalty: !isO1OrO3 ? modelConfig.frequency_penalty : 0,
        top_p: !isO1OrO3 ? modelConfig.top_p : 1,
        // max_tokens: Math.max(modelConfig.max_tokens, 1024),
        // Please do not ask me why not send max_tokens, no reason, this param is just shit, I dont want to explain anymore.
        ...(options.config.stream
          ? { stream_options: { include_usage: true } }
          : {}),
      };

      if (isGpt5) {
        // Remove max_tokens if present
        delete requestPayload.max_tokens;
        // Add max_completion_tokens (or max_completion_tokens if that's what you meant)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      } else if (isO1OrO3) {
        // by default the o1/o3 models will not attempt to produce output that includes markdown formatting
        // manually add "Formatting re-enabled" developer message to encourage markdown inclusion in model responses
        // (https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/reasoning?tabs=python-secure#markdown-output)
        requestPayload["messages"].unshift({
          role: "developer",
          content: "Formatting re-enabled",
        });

        // o1/o3 uses max_completion_tokens to control the number of tokens (https://platform.openai.com/docs/guides/reasoning#controlling-costs)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      }

      // add max_tokens to vision model
      if (visionModel && !isO1OrO3 && !isGpt5) {
        requestPayload["max_tokens"] = Math.max(modelConfig.max_tokens, 4000);
      }
    }

    console.log("[Request] openai payload: ", requestPayload);

    // ALL image-generation models (isImageGen covers DALL-E + gpt-image + cogview)
    // use the non-streaming images/generations endpoint. Force non-stream here.
    const shouldStream = !isImageGen && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      let chatPath = "";
      if (modelConfig.providerName === ServiceProvider.Azure) {
        // find model, and get displayName as deployName
        const { models: configModels, customModels: configCustomModels } =
          useAppConfig.getState();
        const {
          defaultModel,
          customModels: accessCustomModels,
          useCustomConfig,
        } = useAccessStore.getState();
        const models = collectModelsWithDefaultModel(
          configModels,
          [configCustomModels, accessCustomModels].join(","),
          defaultModel,
        );
        const model = models.find(
          (model) =>
            model.name === modelConfig.model &&
            model?.provider?.providerName === ServiceProvider.Azure,
        );
        chatPath = this.path(
          (isImageGen ? Azure.ImagePath : Azure.ChatPath)(
            (model?.displayName ?? model?.name) as string,
            useCustomConfig ? useAccessStore.getState().azureApiVersion : "",
          ),
        );
      } else {
        chatPath = this.path(
          isImageEdit
            ? OpenaiPath.ImageEditPath
            : isImageGen
            ? OpenaiPath.ImagePath
            : OpenaiPath.ChatPath,
        );
      }
      const customBaseUrl = this.getCustomBaseUrl();

      // For image generation/edit via our own server proxy (not custom BASE_URL),
      // route through /api/image-gen or /api/image-edit which use Node.js runtime
      // (60s limit) instead of Edge Runtime (25s limit). This prevents Vercel timeout.
      if (isImageGen && !customBaseUrl) {
        chatPath = isImageEdit ? "/api/image-edit" : "/api/image-gen";
      }

      if (shouldStream) {
        let index = -1;
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        // console.log("getAsTools", tools, funcs);
        streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(false, customBaseUrl),
          tools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
            }>;

            if (!choices?.length) return { isThinking: false, content: "" };

            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                index += 1;
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

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: content,
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // reset index value
            index = -1;
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const headers = getHeaders(false, customBaseUrl);
        // For image generation, ask the server to wrap the response in SSE
        // with heartbeat comments to keep the connection alive through
        // Cloudflare and other reverse proxies (100s timeout).
        if (isImageGen) {
          headers["X-Stream-Heartbeat"] = "1";
        }

        let chatPayload: RequestInit;

        if (isImageEdit) {
          // Image edit: build FormData with image files + text params.
          // Fetch raw blobs from ServiceWorker cache (don't compress).
          const formData = new FormData();
          for (const imageUrl of attachedImages) {
            const resp = await globalThis.fetch(imageUrl);
            const blob = await resp.blob();
            const ext =
              blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            formData.append("image[]", blob, `image.${ext}`);
          }
          formData.append(
            "prompt",
            (requestPayload as ImageGenerationPayload).prompt,
          );
          formData.append("model", options.config.model);
          formData.append("n", "1");
          const size = options.config?.size ?? "1024x1024";
          if (size !== "auto") {
            formData.append("size", size);
          }
          const quality = (requestPayload as ImageGenerationPayload).quality;
          if (quality) {
            formData.append("quality", quality);
          }
          const outputFormat =
            (requestPayload as ImageGenerationPayload).output_format ?? "png";
          formData.append("output_format", outputFormat);

          // Don't set Content-Type — browser will add multipart boundary
          delete headers["Content-Type"];

          chatPayload = {
            method: "POST",
            body: formData,
            signal: controller.signal,
            headers,
          };
        } else {
          chatPayload = {
            method: "POST",
            body: JSON.stringify(requestPayload),
            signal: controller.signal,
            headers,
          };
        }

        // make a fetch request
        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );

        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        let resJson: any;

        // If the server wrapped the response in SSE heartbeat stream,
        // parse out the actual data payload (skip `: heartbeat` comments).
        const contentType = res.headers.get("content-type") ?? "";

        // Detect partial_images streaming: GPT Image model with partial_images
        // in the request payload. The server will passthrough upstream SSE events.
        const hasPartialImages =
          isGptImageModel &&
          !isImageEdit &&
          (requestPayload as ImageGenerationPayload).partial_images &&
          (requestPayload as ImageGenerationPayload).partial_images! > 0;

        if (
          hasPartialImages &&
          isImageGen &&
          contentType.includes("text/event-stream") &&
          res.body
        ) {
          resJson = await this.parsePartialImageStream(
            res.body,
            options.onUpdate,
          );
        } else if (isImageGen && contentType.includes("text/event-stream")) {
          // Non-partial SSE: collect-all mode (heartbeat-wrapped JSON)
          const text = await res.text();
          const lines = text.split("\n");
          let jsonPayload = "";
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              jsonPayload += line.slice(6);
            }
          }
          resJson = JSON.parse(jsonPayload || "{}");
        } else {
          resJson = await res.json();
        }

        const message = await this.extractMessage(resJson);
        // Extract usage from non-streaming response
        const usage = resJson.usage
          ? {
              promptTokens: resJson.usage.prompt_tokens ?? 0,
              completionTokens: resJson.usage.completion_tokens ?? 0,
              totalTokens: resJson.usage.total_tokens ?? 0,
            }
          : undefined;
        options.onFinish(message, res, usage);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const customBaseUrl = this.getCustomBaseUrl();
    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(false, customBaseUrl),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(false, customBaseUrl),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const customBaseUrl = this.getCustomBaseUrl();
    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(false, customBaseUrl),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data?.filter(
      (m) => m.id.startsWith("gpt-") || m.id.startsWith("chatgpt-"),
    );
    console.log("[Models]", chatModels);

    if (!chatModels) {
      return [];
    }

    //由于目前 OpenAI 的 disableListModels 默认为 true，所以当前实际不会运行到这场
    let seq = 1000; //同 Constant.ts 中的排序保持一致
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        sorted: 1,
      },
    }));
  }
}
export { OpenaiPath };
