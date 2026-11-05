/**
 * Built-in model catalog and provider metadata.
 * Keep capability detection in model-detection.ts; this file only owns catalog data.
 */

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
  "Anthropic/claude-opus-5",
  "Anthropic/claude-opus-4.6",
  "Anthropic/claude-sonnet-5",
  "Anthropic/claude-sonnet-4.6",
  "Anthropic/claude-haiku-4.5",

  // OpenAI GPT - 稳定可靠
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-4o-mini",
  "openai/gpt-oss-120b",

  // OpenAI Image Generation
  "openai/gpt-image-2",

  // Google Gemini - 编程强
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.1-flash-lite-preview",

  // xAI Grok - 免费/便宜
  "xai/grok-4.3",
  "xai/grok-4.20",
  "xai/grok-4.20-reasoning",
  "xai/grok-4.20-multi-agent",

  // DeepSeek - 国产性价比
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",

  // Moonshot - 国产新秀
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2-thinking",

  // Alibaba Qwen - 国产新秀
  "alibaba/qwen3.7-max",
  "alibaba/qwen3.7-plus",
  "alibaba/qwen3-coder-plus",
  "alibaba/qwen3-max-thinking",

  // zhipu
  "zai/glm-5.2",
  "zai/glm-5.1",
  "zai/glm-5",

  // Other
  "minimax/minimax-m3",
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
