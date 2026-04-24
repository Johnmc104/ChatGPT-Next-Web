export const OWNER = "ChatGPTNextWeb";
export const REPO = "ChatGPT-Next-Web";
export const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
export const PLUGINS_REPO_URL = `https://github.com/${OWNER}/NextChat-Awesome-Plugins`;
export const ISSUE_URL = `https://github.com/${OWNER}/${REPO}/issues`;
export const UPDATE_URL = `${REPO_URL}#keep-updated`;
export const RELEASE_URL = `${REPO_URL}/releases`;
export const FETCH_COMMIT_URL = `https://api.github.com/repos/${OWNER}/${REPO}/commits?per_page=1`;
export const FETCH_TAG_URL = `https://api.github.com/repos/${OWNER}/${REPO}/tags?per_page=1`;
export const RUNTIME_CONFIG_DOM = "danger-runtime-config";

export const OPENAI_BASE_URL = "https://api.openai.com";
export const RAGFLOW_BASE_URL = "http://git.johndaily.cn:8081";

export const CACHE_URL_PREFIX = "/api/cache";
export const UPLOAD_URL = `${CACHE_URL_PREFIX}/upload`;

export enum Path {
  Home = "/",
  Chat = "/chat",
  Settings = "/settings",
  NewChat = "/new-chat",
  Masks = "/masks",
  Plugins = "/plugins",
  Auth = "/auth",
  Sd = "/sd",
  SdNew = "/sd-new",
  RAGFlow = "/ragflow",
  Artifacts = "/artifacts",
  SearchChat = "/search-chat",
  McpMarket = "/mcp-market",
}

export enum ApiPath {
  Cors = "",
  Azure = "/api/azure",
  OpenAI = "/api/openai",
  Stability = "/api/stability",
  RAGFlow = "/api/ragflow",
  Artifacts = "/api/artifacts",
}

export enum SlotID {
  AppBody = "app-body",
  CustomModel = "custom-model",
}

export enum FileName {
  Masks = "masks.json",
  Prompts = "prompts.json",
}

export enum StoreKey {
  Chat = "chat-next-web-store",
  Plugin = "chat-next-web-plugin",
  Access = "access-control",
  Config = "app-config",
  Mask = "mask-store",
  Prompt = "prompt-store",
  Update = "chat-update",
  Sync = "sync",
  SdList = "sd-list",
  Mcp = "mcp-store",
}

export const DEFAULT_SIDEBAR_WIDTH = 300;
export const MAX_SIDEBAR_WIDTH = 500;
export const MIN_SIDEBAR_WIDTH = 230;
export const NARROW_SIDEBAR_WIDTH = 100;

export const ACCESS_CODE_PREFIX = "nk-";

export const LAST_INPUT_KEY = "last-input";
export const UNFINISHED_INPUT = (id: string) => "unfinished-input-" + id;

export const STORAGE_KEY = "chatgpt-next-web";

export const REQUEST_TIMEOUT_MS = 60000;
export const REQUEST_TIMEOUT_MS_FOR_THINKING = REQUEST_TIMEOUT_MS * 5;

export const EXPORT_MESSAGE_CLASS_NAME = "export-markdown";

export enum ServiceProvider {
  OpenAI = "OpenAI",
  Azure = "Azure",
  Stability = "Stability",
  RAGFlow = "RAGFlow",
}

export enum ModelProvider {
  Stability = "Stability",
  GPT = "GPT",
  RAGFlow = "RAGFlow",
}

export const StabilityConfig = {
  GeneratePath: "v2beta/stable-image/generate",
  ExampleEndpoint: "https://api.stability.ai",
};

export const OpenaiPath = {
  ChatPath: "v1/chat/completions",
  SpeechPath: "v1/audio/speech",
  ImagePath: "v1/images/generations",
  UsagePath: "dashboard/billing/usage",
  SubsPath: "dashboard/billing/subscription",
  ListModelPath: "v1/models",
};

export const Azure = {
  ChatPath: (deployName: string, apiVersion: string) =>
    `deployments/${deployName}/chat/completions?api-version=${apiVersion}`,
  // https://<your_resource_name>.openai.azure.com/openai/deployments/<your_deployment_name>/images/generations?api-version=<api_version>
  ImagePath: (deployName: string, apiVersion: string) =>
    `deployments/${deployName}/images/generations?api-version=${apiVersion}`,
  ExampleEndpoint: "https://{resource-url}/openai",
};

export const RAGFlow = {
  ExampleEndpoint: RAGFLOW_BASE_URL,
  ChatPath: "v1/chat/completions",
  ListModelPath: "v1/models",
};

export const DEFAULT_INPUT_TEMPLATE = `{{input}}`; // input / time / model / lang
export const DEFAULT_SYSTEM_TEMPLATE = `
You are ChatGPT, a large language model trained by {{ServiceProvider}}.
Knowledge cutoff: {{cutoff}}
Current model: {{model}}
Current time: {{time}}
Latex inline: \\(x^2\\) 
Latex block: $$e=mc^2$$
`;

export const MCP_TOOLS_TEMPLATE = `
[clientId]
{{ clientId }}
[tools]
{{ tools }}
`;

export const MCP_SYSTEM_TEMPLATE = `
You are an AI assistant with access to system tools. Your role is to help users by combining natural language understanding with tool operations when needed.

1. AVAILABLE TOOLS:
{{ MCP_TOOLS }}

2. WHEN TO USE TOOLS:
   - ALWAYS USE TOOLS when they can help answer user questions
   - DO NOT just describe what you could do - TAKE ACTION immediately
   - If you're not sure whether to use a tool, USE IT
   - Common triggers for tool use:
     * Questions about files or directories
     * Requests to check, list, or manipulate system resources
     * Any query that can be answered with available tools

3. HOW TO USE TOOLS:
   A. Tool Call Format:
      - Use markdown code blocks with format: \`\`\`json:mcp:{clientId}\`\`\`
      - Always include:
        * method: "tools/call"（Only this method is supported）
        * params: 
          - name: must match an available primitive name
          - arguments: required parameters for the primitive

   B. Response Format:
      - Tool responses will come as user messages
      - Format: \`\`\`json:mcp-response:{clientId}\`\`\`
      - Wait for response before making another tool call

   C. Important Rules:
      - Only use tools/call method
      - Only ONE tool call per message
      - ALWAYS TAKE ACTION instead of just describing what you could do
      - Include the correct clientId in code block language tag
      - Verify arguments match the primitive's requirements

4. INTERACTION FLOW:
   A. When user makes a request:
      - IMMEDIATELY use appropriate tool if available
      - DO NOT ask if user wants you to use the tool
      - DO NOT just describe what you could do
   B. After receiving tool response:
      - Explain results clearly
      - Take next appropriate action if needed
   C. If tools fail:
      - Explain the error
      - Try alternative approach immediately

5. EXAMPLE INTERACTION:

  good example:

   \`\`\`json:mcp:filesystem
   {
     "method": "tools/call",
     "params": {
       "name": "list_allowed_directories",
       "arguments": {}
     }
   }
   \`\`\`"


  \`\`\`json:mcp-response:filesystem
  {
  "method": "tools/call",
  "params": {
    "name": "write_file",
    "arguments": {
      "path": "/Users/river/dev/nextchat/test/joke.txt",
      "content": "为什么数学书总是感到忧伤？因为它有太多的问题。"
    }
  }
  }
\`\`\`

   follwing is the wrong! mcp json example:

   \`\`\`json:mcp:filesystem
   {
      "method": "write_file",
      "params": {
        "path": "NextChat_Information.txt",
        "content": "1"
    }
   }
   \`\`\`

   This is wrong because the method is not tools/call.
   
   \`\`\`{
  "method": "search_repositories",
  "params": {
    "query": "2oeee"
  }
}
   \`\`\`

   This is wrong because the method is not tools/call.!!!!!!!!!!!

   the right format is:
   \`\`\`json:mcp:filesystem
   {
     "method": "tools/call",
     "params": {
       "name": "search_repositories",
       "arguments": {
         "query": "2oeee"
       }
     }
   }
   \`\`\`
   
   please follow the format strictly ONLY use tools/call method!!!!!!!!!!!
   
`;

export const SUMMARIZE_MODEL = "openai/gpt-4o-mini";

export const KnowledgeCutOffDate: Record<string, string> = {
  default: "2021-09",
  // OpenRouter format models
  "openai/gpt-4o-mini": "2023-10",
  "openai/gpt-4.1": "2024-06",
  "openai/gpt-5.2": "2025-01",
  "openai/gpt-5.2-chat": "2025-01",
  "openai/gpt-5.2-codex": "2025-01",
  "anthropic/claude-opus-4.5": "2025-01",
  "anthropic/claude-sonnet-4.5": "2025-01",
  "anthropic/claude-haiku-4.5": "2025-01",
  "google/gemini-3-pro-preview": "2025-01",
  "google/gemini-3-flash-preview": "2025-01",
  "x-ai/grok-4.1-fast": "2025-01",
  "x-ai/grok-code-fast-1": "2025-01",
  "x-ai/grok-4-fast": "2025-01",
  "deepseek/deepseek-v3.2": "2025-01",
  "z-ai/glm-4.7": "2025-01",
  "minimax/minimax-m2.1": "2025-01",
  // Legacy format (for backward compatibility)
  "gpt-4o-mini": "2023-10",
  "gpt-4.1": "2024-06",
  "deepseek-chat": "2024-07",
  "gemini-pro": "2023-12",
};

export const DEFAULT_TTS_ENGINE = "OpenAI-TTS";
export const DEFAULT_TTS_ENGINES = ["OpenAI-TTS", "Edge-TTS"];
export const DEFAULT_TTS_MODEL = "tts-1";
export const DEFAULT_TTS_VOICE = "alloy";
export const DEFAULT_TTS_MODELS = ["tts-1", "tts-1-hd"];
export const DEFAULT_TTS_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
];

export const VISION_MODEL_REGEXES = [
  /vision/i,
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-4-turbo/i,
  /gpt-5/i,
  /claude.*[34]/i,
  /claude-.*opus/i,
  /claude-.*sonnet/i,
  /gemini-1\.5/i,
  /gemini-[23]/i,
  /grok-4/i,
  /glm-4/i,
  /vl/i,
];

export const EXCLUDE_VISION_MODEL_REGEXES = [
  /haiku/i, // Claude Haiku models have limited vision
  /turbo-preview/i, // gpt-4-turbo-preview is text-only
];

// Simplified model list - OpenRouter format for custom API endpoints
// Reference: https://openrouter.ai/models?order=most-popular

const defaultModels = [
  // RAGFlow - 知识库（优先）
  "ragflow/synopsys",
  "ragflow/ae",

  // Anthropic Claude - 编程最强
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",

  // OpenAI GPT - 稳定可靠
  "openai/gpt-5.4",
  "openai/gpt-5.3-chat",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.4-mini",
  "openai/gpt-4o-mini",
  "openai/gpt-oss-120b",

  // OpenAI Image Generation
  "openai/gpt-image-2",

  // Google Gemini - 编程强
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",

  // xAI Grok - 免费/便宜
  "xai/grok-4",
  "xai/grok-4.20-reasoning",
  "xai/grok-4.20-multi-agent",
  "xai/grok-4.1-fast",

  // DeepSeek - 国产性价比
  "deepseek/deepseek-v3.2",

  // Moonshot - 国产新秀
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2-thinking",

  // Alibaba Qwen - 国产新秀
  "alibaba/qwen3.6-plus",
  "alibaba/qwen3-coder-plus",
  "alibaba/qwen3-max-thinking",

  // zhipu
  "z-ai/glm-4.7",
  "z-ai/glm-5",

  // Other
  "minimax/minimax-m2.5",
  "minimax/minimax-m2.7",
];

// Map provider id to display name (= ServiceProvider enum value)
// This is the single source of truth for id → display name mapping.
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  ragflow: "RAGFlow",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "XAI",
  deepseek: "DeepSeek",
  chatglm: "ChatGLM",
  minimax: "MiniMax",
  alibaba: "Alibaba",
  moonshot: "Moonshot",
  meta: "Meta",
  mistral: "Mistral",
};

/** Get display name from provider id. Falls back to capitalized id. */
export function getProviderDisplayName(id: string): string {
  return PROVIDER_DISPLAY_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

// Model provider mapping - only id and sorted are needed.
// providerName (display name) is derived from id via getProviderDisplayName().
const getProviderFromModelName = (
  name: string,
): {
  id: string;
  providerName: string;
  sorted: number;
} => {
  if (name.startsWith("ragflow/")) {
    return {
      id: "ragflow",
      providerName: "RAGFlow",
      sorted: 1,
    };
  } else if (name.startsWith("anthropic/")) {
    return {
      id: "anthropic",
      providerName: "Anthropic",
      sorted: 2,
    };
  } else if (name.startsWith("openai/")) {
    return {
      id: "openai",
      providerName: "OpenAI",
      sorted: 3,
    };
  } else if (name.startsWith("google/")) {
    return {
      id: "google",
      providerName: "Google",
      sorted: 4,
    };
  } else if (name.startsWith("x-ai/")) {
    return { id: "xai", providerName: "XAI", sorted: 5 };
  } else if (name.startsWith("deepseek/")) {
    return {
      id: "deepseek",
      providerName: "DeepSeek",
      sorted: 6,
    };
  } else if (name.startsWith("z-ai/") || name.startsWith("zhipu/")) {
    return {
      id: "chatglm",
      providerName: "ChatGLM",
      sorted: 7,
    };
  } else if (name.startsWith("minimax/")) {
    return {
      id: "minimax",
      providerName: "MiniMax",
      sorted: 8,
    };
  } else if (name.startsWith("qwen/") || name.startsWith("alibaba/")) {
    return {
      id: "alibaba",
      providerName: "Alibaba",
      sorted: 9,
    };
  } else if (name.startsWith("moonshot/") || name.startsWith("moonshotai/")) {
    return {
      id: "moonshot",
      providerName: "Moonshot",
      sorted: 10,
    };
  } else if (name.startsWith("meta-llama/") || name.startsWith("llama/")) {
    return {
      id: "meta",
      providerName: "Meta",
      sorted: 11,
    };
  } else if (name.startsWith("mistral/")) {
    return {
      id: "mistral",
      providerName: "Mistral",
      sorted: 12,
    };
  }
  return {
    id: "other",
    providerName: "Other",
    sorted: 99,
  };
};

let seq = 1000; // 内置的模型序号生成器从1000开始
export const DEFAULT_MODELS = [
  ...defaultModels.map((name) => ({
    name,
    available: true,
    sorted: seq++,
    provider: getProviderFromModelName(name),
  })),
] as const;

// Note: Users can add more models via CUSTOM_MODELS environment variable
// Example: +qwen/qwen3-235b-a22b,+meta-llama/llama-4-maverick

export const CHAT_PAGE_SIZE = 15;
export const MAX_RENDER_MSG_COUNT = 45;

// some famous webdav endpoints
export const internalAllowedWebDavEndpoints = [
  "https://dav.jianguoyun.com/dav/",
  "https://dav.dropdav.com/",
  "https://dav.box.com/dav",
  "https://nanao.teracloud.jp/dav/",
  "https://bora.teracloud.jp/dav/",
  "https://webdav.4shared.com/",
  "https://dav.idrivesync.com",
  "https://webdav.yandex.com",
  "https://app.koofr.net/dav/Koofr",
];

export const DEFAULT_GA_ID = "G-89WN60ZK2E";
