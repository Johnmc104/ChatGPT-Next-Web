import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import {
  ANTHROPIC_BASE_URL,
  Anthropic,
  ApiPath,
  ModelProvider,
  ServiceProvider,
  DEEPSEEK_BASE_URL,
  BYTEDANCE_BASE_URL,
  ALIBABA_BASE_URL,
  MOONSHOT_BASE_URL,
  IFLYTEK_BASE_URL,
  XAI_BASE_URL,
  CHATGLM_BASE_URL,
  SILICONFLOW_BASE_URL,
  AI302_BASE_URL,
} from "../constant";
import { prettyObject } from "../utils/format";
import { auth, type AuthResult } from "./auth";
import { resolveAuthHeaderValue } from "./common";
import { isModelNotavailableInServer } from "../utils/model";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";

const serverConfig = getServerSideConfig();

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** Display name for logs */
  name: string;
  /** Used to select the correct system API key via auth() */
  modelProvider: ModelProvider;
  /** The Next.js API path prefix, e.g. "/api/deepseek" */
  apiPath: string;
  /** Used for model-availability filtering */
  serviceProvider: string;
  /** Returns the upstream base URL (from env or default) */
  getBaseUrl: () => string;
  /** Optional path allow-list; if set, requests to unlisted paths are rejected */
  allowedPaths?: Set<string>;
  /** Whether to wrap the fetch URL with cloudflareAIGatewayUrl (default false) */
  useCloudflareGateway?: boolean;
  /** Override the auth header name (default "Authorization") */
  authHeaderName?: string;
  /** Whether the auth value should be "Bearer <key>" (default true) */
  authIsBearer?: boolean;
  /** Extra headers to send upstream, computed per-request */
  extraHeaders?: (req: NextRequest) => Record<string, string>;
}

/**
 * Registry of providers that share the generic request handler.
 * Keyed by ApiPath value so the route dispatcher can look them up directly.
 */
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  [ApiPath.DeepSeek]: {
    name: "DeepSeek",
    modelProvider: ModelProvider.DeepSeek,
    apiPath: ApiPath.DeepSeek,
    serviceProvider: ServiceProvider.DeepSeek,
    getBaseUrl: () => serverConfig.deepseekUrl || DEEPSEEK_BASE_URL,
  },
  [ApiPath.ByteDance]: {
    name: "ByteDance",
    modelProvider: ModelProvider.Doubao,
    apiPath: ApiPath.ByteDance,
    serviceProvider: ServiceProvider.ByteDance,
    getBaseUrl: () => serverConfig.bytedanceUrl || BYTEDANCE_BASE_URL,
  },
  [ApiPath.Alibaba]: {
    name: "Alibaba",
    modelProvider: ModelProvider.Qwen,
    apiPath: ApiPath.Alibaba,
    serviceProvider: ServiceProvider.Alibaba,
    getBaseUrl: () => serverConfig.alibabaUrl || ALIBABA_BASE_URL,
    extraHeaders: (req) => ({
      "X-DashScope-SSE": req.headers.get("X-DashScope-SSE") ?? "disable",
    }),
  },
  [ApiPath.Moonshot]: {
    name: "Moonshot",
    modelProvider: ModelProvider.Moonshot,
    apiPath: ApiPath.Moonshot,
    serviceProvider: ServiceProvider.Moonshot,
    getBaseUrl: () => serverConfig.moonshotUrl || MOONSHOT_BASE_URL,
  },
  [ApiPath.Iflytek]: {
    name: "Iflytek",
    modelProvider: ModelProvider.Iflytek,
    apiPath: ApiPath.Iflytek,
    serviceProvider: ServiceProvider.Iflytek,
    getBaseUrl: () => serverConfig.iflytekUrl || IFLYTEK_BASE_URL,
  },
  [ApiPath.XAI]: {
    name: "XAI",
    modelProvider: ModelProvider.XAI,
    apiPath: ApiPath.XAI,
    serviceProvider: ServiceProvider.XAI,
    getBaseUrl: () => serverConfig.xaiUrl || XAI_BASE_URL,
  },
  [ApiPath.ChatGLM]: {
    name: "ChatGLM",
    modelProvider: ModelProvider.ChatGLM,
    apiPath: ApiPath.ChatGLM,
    serviceProvider: ServiceProvider.ChatGLM,
    getBaseUrl: () => serverConfig.chatglmUrl || CHATGLM_BASE_URL,
  },
  [ApiPath.SiliconFlow]: {
    name: "SiliconFlow",
    modelProvider: ModelProvider.SiliconFlow,
    apiPath: ApiPath.SiliconFlow,
    serviceProvider: ServiceProvider.SiliconFlow,
    getBaseUrl: () => serverConfig.siliconFlowUrl || SILICONFLOW_BASE_URL,
  },
  [ApiPath["302.AI"]]: {
    name: "302.AI",
    modelProvider: ModelProvider["302.AI"],
    apiPath: ApiPath["302.AI"],
    serviceProvider: ServiceProvider["302.AI"],
    getBaseUrl: () => serverConfig.ai302Url || AI302_BASE_URL,
  },
  [ApiPath.Anthropic]: {
    name: "Anthropic",
    modelProvider: ModelProvider.Claude,
    apiPath: ApiPath.Anthropic,
    serviceProvider: ServiceProvider.Anthropic,
    getBaseUrl: () =>
      serverConfig.anthropicUrl || serverConfig.baseUrl || ANTHROPIC_BASE_URL,
    allowedPaths: new Set([Anthropic.ChatPath, Anthropic.ChatPath1]),
    useCloudflareGateway: true,
    authHeaderName: "x-api-key",
    authIsBearer: false,
    extraHeaders: (req) => ({
      "Cache-Control": "no-store",
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version":
        req.headers.get("anthropic-version") ||
        serverConfig.anthropicApiVersion ||
        Anthropic.Vision,
    }),
  },
};

// ---------------------------------------------------------------------------
// Generic handler – works for any provider in the registry
// ---------------------------------------------------------------------------

export function createProviderHandler(config: ProviderConfig) {
  return async function handle(
    req: NextRequest,
    { params }: { params: { path: string[] } },
  ) {
    console.log(`[${config.name} Route] params `, params);

    if (req.method === "OPTIONS") {
      return NextResponse.json({ body: "OK" }, { status: 200 });
    }

    // Optional path allow-list
    if (config.allowedPaths) {
      const subpath = params.path.join("/");
      if (!config.allowedPaths.has(subpath)) {
        console.log(`[${config.name} Route] forbidden path `, subpath);
        return NextResponse.json(
          { error: true, msg: "you are not allowed to request " + subpath },
          { status: 403 },
        );
      }
    }

    const authResult = auth(req, config.modelProvider);
    if (authResult.error) {
      return NextResponse.json(authResult, { status: 401 });
    }

    try {
      return await requestProvider(req, authResult, config);
    } catch (e) {
      console.error(`[${config.name}] `, e);
      return NextResponse.json(prettyObject(e));
    }
  };
}

async function requestProvider(
  req: NextRequest,
  authResult: AuthResult,
  config: ProviderConfig,
) {
  const controller = new AbortController();

  let path = `${req.nextUrl.pathname}`.replaceAll(config.apiPath, "");

  // In unified proxy mode (BASE_URL is set), route through the unified proxy
  // instead of the provider's own upstream URL.
  let baseUrl: string;
  if (serverConfig.baseUrl && !config.allowedPaths) {
    // Use BASE_URL for generic providers (those without allowedPaths restrictions)
    baseUrl = serverConfig.baseUrl;
    console.log(`[${config.name}] using unified proxy (BASE_URL)`);
  } else {
    baseUrl = config.getBaseUrl();
  }
  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  // Smart URL construction: if BASE_URL already contains an API endpoint path
  // (e.g. .../openrouter/v1/chat/completions), avoid duplicating it.
  const apiEndpoints = [
    "/v1/chat/completions",
    "/v1/completions",
    "/v1/embeddings",
    "/v1/images/generations",
    "/v1/audio/speech",
    "/v1/audio/transcriptions",
    "/v1/models",
    "/chat/completions",
  ];

  let baseUrlEndpoint = "";
  for (const endpoint of apiEndpoints) {
    if (baseUrl.toLowerCase().endsWith(endpoint)) {
      baseUrlEndpoint = endpoint;
      break;
    }
  }

  const requestPath = path.startsWith("/") ? path : `/${path}`;
  let fetchUrl: string;

  if (baseUrlEndpoint) {
    const baseUrlWithoutEndpoint = baseUrl.slice(0, -baseUrlEndpoint.length);
    if (requestPath.toLowerCase() === baseUrlEndpoint) {
      // Request matches the endpoint already in BASE_URL, use BASE_URL directly
      fetchUrl = baseUrl;
    } else {
      // Request is for a different endpoint, replace the endpoint part
      fetchUrl = `${baseUrlWithoutEndpoint}${requestPath}`;
    }
  } else {
    fetchUrl = `${baseUrl}${requestPath}`;
  }

  if (config.useCloudflareGateway) {
    fetchUrl = cloudflareAIGatewayUrl(fetchUrl);
  }

  console.log("[fetchUrl]", fetchUrl);

  // Build headers
  const authHeaderName = config.authHeaderName ?? "Authorization";
  const authValue = resolveAuthHeaderValue(req, authResult, {
    isBearer: config.authIsBearer ?? true,
    headerName: authHeaderName,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [authHeaderName]: authValue,
    ...(config.extraHeaders?.(req) ?? {}),
  };

  const fetchOptions: RequestInit = {
    headers,
    method: req.method,
    body: req.body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  // Model filtering
  if (serverConfig.customModels && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody) as { model?: string };
      if (
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          config.serviceProvider,
        )
      ) {
        return NextResponse.json(
          {
            error: true,
            message: `you are not allowed to use ${jsonBody?.model} model`,
          },
          { status: 403 },
        );
      }
    } catch (e) {
      console.error(`[${config.name}] filter`, e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    newHeaders.set("X-Accel-Buffering", "no");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
