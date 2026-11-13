import {
  ACCESS_CODE_PREFIX,
  ModelProvider,
  ServiceProvider,
} from "../constant";
import {
  DalleStyle,
  ImageOutputFormat,
  ImageQuality,
  ModelSize,
} from "../typing";
import {
  ChatMessageTool,
  useAccessStore,
} from "../store";
import { ChatGPTApi } from "./platforms/openai";
import { RAGFlowApi } from "./platforms/ragflow";

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];


export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
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
  // Image generation parameters (only used for image models)
  size?: ModelSize;
  quality?: ImageQuality;
  style?: DalleStyle;
  outputFormat?: ImageOutputFormat;
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
  /** Plugin ids whose tools may be called; omit for tool-less requests. */
  plugins?: string[];

  onUpdate?: (message: string | MultimodalContent[], chunk: string) => void;
  // `message` may be a plain string for text completions, or a
  // MultimodalContent[] for image-generation responses (DALL-E /
  // gpt-image / OpenRouter image models). Callers must handle both.
  onFinish: (
    message: string | MultimodalContent[],
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

export class ClientApi {
  public llm: LLMApi;

  constructor(provider: ModelProvider = ModelProvider.GPT) {
    switch (provider) {
      case ModelProvider.RAGFlow:
        this.llm = new RAGFlowApi();
        break;
      default:
        this.llm = new ChatGPTApi();
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

function validString(x: string): boolean {
  return x?.length > 0;
}

export function getHeaders(
  ignoreHeaders: boolean = false,
  customBaseUrl?: string,
  options: {
    /** Providers whose key is held by the server (RAGFlow) skip user keys. */
    omitUserApiKey?: boolean;
  } = {},
) {
  const accessStore = useAccessStore.getState();
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

  const apiKey =
    options.omitUserApiKey || accessStore.hideUserApiKey
      ? ""
      : accessStore.openaiApiKey;

  // 1. Always send access code if available (for server-side authentication)
  if (validString(accessStore.accessCode)) {
    headers["Authorization"] = getBearerToken(
      ACCESS_CODE_PREFIX + accessStore.accessCode.trim(),
    );
  }

  // 2. Send user's API key in custom header (server uses this for upstream calls)
  if (validString(apiKey)) {
    headers["X-User-Api-Key"] = apiKey.trim();
  }

  // 3. An explicitly allowed user key takes precedence, matching site verification.
  if (validString(apiKey)) {
    headers["Authorization"] = getBearerToken(apiKey);
  }

  return headers;
}

export function getClientApi(provider: ServiceProvider): ClientApi {
  // RAGFlow has its own client with a dedicated upstream URL.
  if (provider === ServiceProvider.RAGFlow) {
    return new ClientApi(ModelProvider.RAGFlow);
  }
  // Everything else routes through the unified OpenAI-compatible client.
  return new ClientApi(ModelProvider.GPT);
}
