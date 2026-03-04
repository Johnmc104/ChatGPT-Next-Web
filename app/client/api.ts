import { getClientConfig } from "../config/client";
import {
  ACCESS_CODE_PREFIX,
  ModelProvider,
  ServiceProvider,
} from "../constant";
import {
  ChatMessageTool,
  ChatMessage,
  ModelType,
  useAccessStore,
  useChatStore,
} from "../store";
import { ChatGPTApi, DalleRequestPayload } from "./platforms/openai";
import { RAGFlowApi } from "./platforms/ragflow";

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export const Models = ["gpt-3.5-turbo", "gpt-4"] as const;
export const TTSModels = ["tts-1", "tts-1-hd"] as const;
export type ChatModel = ModelType;

export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface MultimodalContentForAlibaba {
  text?: string;
  image?: string;
}

export interface RequestMessage {
  role: MessageRole;
  content: string | MultimodalContent[];
}

export interface LLMConfig {
  model: string;
  providerName?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  size?: DalleRequestPayload["size"];
  quality?: DalleRequestPayload["quality"];
  style?: DalleRequestPayload["style"];
}

export interface SpeechOptions {
  model: string;
  input: string;
  voice: string;
  response_format?: string;
  speed?: number;
  onController?: (controller: AbortController) => void;
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (message: string, chunk: string) => void;
  onFinish: (
    message: string,
    responseRes: Response,
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    },
  ) => void;
  onError?: (err: Error) => void;
  onController?: (controller: AbortController) => void;
  onBeforeTool?: (tool: ChatMessageTool) => void;
  onAfterTool?: (tool: ChatMessageTool) => void;
}

export interface LLMUsage {
  used: number;
  total: number;
}

export interface LLMModel {
  name: string;
  displayName?: string;
  available: boolean;
  provider: LLMModelProvider;
  sorted: number;
}

export interface LLMModelProvider {
  id: string;
  providerName: string;
  sorted: number;
}

export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract speech(options: SpeechOptions): Promise<ArrayBuffer>;
  abstract usage(): Promise<LLMUsage>;
  abstract models(): Promise<LLMModel[]>;
}

type ProviderName = "openai" | "azure" | "claude" | "palm";

interface Model {
  name: string;
  provider: ProviderName;
  ctxlen: number;
}

interface ChatProvider {
  name: ProviderName;
  apiConfig: {
    baseUrl: string;
    apiKey: string;
    summaryModel: Model;
  };
  models: Model[];

  chat: () => void;
  usage: () => void;
}

export class ClientApi {
  public llm: LLMApi;

  constructor(provider: ModelProvider = ModelProvider.GPT) {
    // In unified proxy mode, only two paths are active:
    // - RAGFlow: dedicated client with its own upstream URL
    // - Everything else: OpenAI-compatible client (routes through BASE_URL proxy)
    switch (provider) {
      case ModelProvider.RAGFlow:
        this.llm = new RAGFlowApi();
        break;
      default:
        this.llm = new ChatGPTApi();
    }
  }

  config() {}

  prompts() {}

  masks() {}

  async share(messages: ChatMessage[], avatarUrl: string | null = null) {
    const msgs = messages
      .map((m) => ({
        from: m.role === "user" ? "human" : "gpt",
        value: m.content,
      }))
      .concat([
        {
          from: "human",
          value:
            "Share from [NextChat]: https://github.com/Yidadaa/ChatGPT-Next-Web",
        },
      ]);
    // 敬告二开开发者们，为了开源大模型的发展，请不要修改上述消息，此消息用于后续数据清洗使用
    // Please do not modify this message

    console.log("[Share]", messages, msgs);
    const clientConfig = getClientConfig();
    const proxyUrl = "/sharegpt";
    const rawUrl = "https://sharegpt.com/api/conversations";
    const shareUrl = clientConfig?.isApp ? rawUrl : proxyUrl;
    const res = await fetch(shareUrl, {
      body: JSON.stringify({
        avatarUrl,
        items: msgs,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const resJson = await res.json();
    console.log("[Share]", resJson);
    if (resJson.id) {
      return `https://shareg.pt/${resJson.id}`;
    }
  }
}

export function getBearerToken(
  apiKey: string,
  noBearer: boolean = false,
): string {
  return validString(apiKey)
    ? `${noBearer ? "" : "Bearer "}${apiKey.trim()}`
    : "";
}

export function validString(x: string): boolean {
  return x?.length > 0;
}

export function getHeaders(
  ignoreHeaders: boolean = false,
  customBaseUrl?: string,
) {
  const accessStore = useAccessStore.getState();
  const chatStore = useChatStore.getState();
  let headers: Record<string, string> = {};
  if (!ignoreHeaders) {
    headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  // Add X-Base-URL header for proxy when using custom config
  if (customBaseUrl) {
    headers["X-Base-URL"] = customBaseUrl;
  }

  // ---------------------------------------------------------------------------
  // Simplified header logic for unified proxy architecture:
  //   - All non-RAGFlow models route through BASE_URL (unified proxy)
  //   - RAGFlow auth is entirely server-side (RAGFLOW_API_KEY env var)
  //   - Users may provide their own openaiApiKey for custom endpoints
  // ---------------------------------------------------------------------------

  const modelConfig = chatStore.currentSession().mask.modelConfig;
  const isRAGFlow = modelConfig.providerName === ServiceProvider.RAGFlow;

  // RAGFlow: no client-side key needed (server injects RAGFLOW_API_KEY).
  // Everything else: user's openaiApiKey (for custom endpoint) or empty
  // (server will inject OPENAI_API_KEY via access code auth).
  const apiKey = isRAGFlow ? "" : accessStore.openaiApiKey;

  // 1. Always send access code if available (for server-side authentication)
  if (validString(accessStore.accessCode)) {
    headers["Authorization"] = getBearerToken(
      ACCESS_CODE_PREFIX + accessStore.accessCode,
    );
  }

  // 2. Send user's API key in custom header (server uses this for upstream calls)
  if (validString(apiKey)) {
    headers["X-User-Api-Key"] = apiKey;
  }

  // 3. If no access code but has API key, set Authorization directly
  if (!validString(accessStore.accessCode) && validString(apiKey)) {
    headers["Authorization"] = getBearerToken(apiKey);
  }

  return headers;
}

/**
 * Check if custom BASE_URL is configured (e.g., OpenRouter, Cloudflare AI Gateway)
 * When custom BASE_URL is set, all models should use OpenAI-compatible API
 */
export function hasCustomBaseUrl(): boolean {
  const accessStore = useAccessStore.getState();
  // Check if server has custom BASE_URL configured (via environment variable)
  if (accessStore.hasCustomBaseUrl) {
    return true;
  }
  // Check if user enabled custom config with a custom URL (via settings page)
  if (accessStore.useCustomConfig && accessStore.openaiUrl) {
    return true;
  }
  return false;
}

export function getClientApi(provider: ServiceProvider): ClientApi {
  // RAGFlow always uses its own client — it has its own upstream URL
  // and must not be routed through the unified proxy (BASE_URL/OpenRouter).
  if (provider === ServiceProvider.RAGFlow) {
    return new ClientApi(ModelProvider.RAGFlow);
  }

  // In unified proxy mode (BASE_URL set), all non-RAGFlow models go through
  // OpenAI-compatible client. This is the dominant path in production.
  if (hasCustomBaseUrl()) {
    return new ClientApi(ModelProvider.GPT);
  }

  // Fallback: direct provider access (no unified proxy configured).
  // Kept for completeness but not reached in current deployment.
  return new ClientApi(ModelProvider.GPT);
}
