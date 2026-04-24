import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import {
  ACCESS_CODE_PREFIX,
  OPENAI_BASE_URL,
  ServiceProvider,
} from "../constant";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";
import { getModelProvider, isModelNotavailableInServer } from "../utils/model";
import { type AuthResult } from "./auth";
import {
  buildFetchUrl,
  normalizeBaseUrl,
  cleanResponseHeaders,
  createTimeoutController,
  fetchWithRetry,
} from "./url-builder";
import { logger } from "@/app/utils/logger";

const serverConfig = getServerSideConfig();

/**
 * Resolve the correct Authorization value for upstream API calls.
 * Priority: 1) User's own API key (X-User-Api-Key header)
 *           2) System API key from authResult
 *           3) Original request Authorization header (only if it's a real API key)
 */
export function resolveAuthHeaderValue(
  req: NextRequest,
  authResult?: AuthResult,
  options?: {
    isBearer?: boolean;
    headerName?: string;
    ignoreUserApiKey?: boolean;
  },
): string {
  const isBearer = options?.isBearer ?? true;
  const headerName = options?.headerName ?? "Authorization";

  // 1. User provided their own API key (skip for providers that manage their own auth)
  if (!options?.ignoreUserApiKey) {
    const userApiKey = req.headers.get("X-User-Api-Key");
    if (userApiKey) {
      return isBearer ? `Bearer ${userApiKey}` : userApiKey;
    }
  }

  // 2. User authenticated with access code, use server's API key
  if (authResult?.systemApiKey) {
    return isBearer
      ? `Bearer ${authResult.systemApiKey}`
      : authResult.systemApiKey;
  }

  // 3. Fallback to original header value
  const original =
    req.headers.get(headerName) ?? req.headers.get("Authorization") ?? "";
  const rawToken = original.replace("Bearer ", "").trim();

  // Safety: never forward access codes to upstream APIs
  if (rawToken.startsWith(ACCESS_CODE_PREFIX) || rawToken.startsWith("nk-")) {
    return "";
  }

  return original;
}

export async function requestOpenai(req: NextRequest, authResult?: AuthResult) {
  const isAzure = req.nextUrl.pathname.includes("azure/deployments");

  // Resolve auth header name and value
  const authHeaderName = isAzure ? "api-key" : "Authorization";
  const isBearer = !isAzure;
  let authValue = resolveAuthHeaderValue(req, authResult, {
    isBearer,
    headerName: authHeaderName,
  });

  // Fallback safety for Azure: if resolveAuthHeaderValue returned empty,
  // try server config directly
  if (!authValue && isAzure && serverConfig.azureApiKey) {
    authValue = serverConfig.azureApiKey;
  }

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/openai/", "");

  let baseUrl = normalizeBaseUrl(
    (isAzure ? serverConfig.azureUrl : serverConfig.baseUrl) || OPENAI_BASE_URL,
  );

  logger.debug("[OpenAI Proxy]", path);
  logger.debug("[Base Url]", baseUrl);

  const { signal, cleanup: cleanupTimeout } = createTimeoutController();

  if (isAzure) {
    const azureApiVersion =
      req?.nextUrl?.searchParams?.get("api-version") ||
      serverConfig.azureApiVersion;
    baseUrl = baseUrl.split("/deployments").shift() as string;
    path = `${req.nextUrl.pathname.replaceAll(
      "/api/azure/",
      "",
    )}?api-version=${azureApiVersion}`;

    // Forward compatibility:
    // if display_name(deployment_name) not set, and '{deploy-id}' in AZURE_URL
    // then using default '{deploy-id}'
    if (serverConfig.customModels && serverConfig.azureUrl) {
      const modelName = path.split("/")[1];
      let realDeployName = "";
      serverConfig.customModels
        .split(",")
        .filter((v) => !!v && !v.startsWith("-") && v.includes(modelName))
        .forEach((m) => {
          const [fullName, displayName] = m.split("=");
          const [_, providerName] = getModelProvider(fullName);
          if (providerName === "azure" && !displayName) {
            const [_, deployId] = (serverConfig?.azureUrl ?? "").split(
              "deployments/",
            );
            if (deployId) {
              realDeployName = deployId;
            }
          }
        });
      if (realDeployName) {
        logger.debug("[Azure] Replace with DeployId", realDeployName);
        path = path.replaceAll(modelName, realDeployName);
      }
    }
  }

  const fetchUrl = buildFetchUrl({
    baseUrl,
    requestPath: "/" + path,
    useCloudflareGateway: true,
  });
  logger.info("[OpenAI] fetchUrl", fetchUrl);
  // Always clone body to a string so fetchWithRetry can safely retry.
  // ReadableStream can only be consumed once — retries with an already-consumed
  // stream would send an empty body.
  const clonedBody = req.body ? await req.text() : null;

  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      [authHeaderName]: authValue,
      ...(serverConfig.openaiOrgId && {
        "OpenAI-Organization": serverConfig.openaiOrgId,
      }),
    },
    method: req.method,
    body: clonedBody,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal,
  };

  // Check if using custom BASE_URL (e.g., OpenRouter, other compatible APIs)
  const isUsingCustomBaseUrl =
    serverConfig.baseUrl && serverConfig.baseUrl !== OPENAI_BASE_URL;

  // #1815 try to refuse gpt4 request
  // Skip model filtering when using custom BASE_URL (OpenRouter compatible APIs)
  if (serverConfig.customModels && clonedBody && !isUsingCustomBaseUrl) {
    try {
      const jsonBody = JSON.parse(clonedBody) as { model?: string };

      // not undefined and is false
      if (
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          [
            ServiceProvider.OpenAI,
            ServiceProvider.Azure,
            jsonBody?.model as string, // support provider-unspecified model
          ],
        )
      ) {
        return NextResponse.json(
          {
            error: true,
            message: `you are not allowed to use ${jsonBody?.model} model`,
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      logger.error("[OpenAI] gpt4 filter", e);
    }
  }

  // Should we wrap this long-running request with SSE heartbeats?
  // The client opts in by sending X-Stream-Heartbeat: 1 for image generation
  // requests. This prevents Cloudflare (and other proxies) from timing out
  // on requests that can take 30s–2min (e.g. gpt-image-2).
  const wantHeartbeat = req.headers.get("X-Stream-Heartbeat") === "1";

  try {
    const res = await fetchWithRetry(fetchUrl, fetchOptions);

    const newHeaders = cleanResponseHeaders(res.headers);

    // Keep OpenAI-Organization header only if configured
    if (!serverConfig.openaiOrgId || serverConfig.openaiOrgId.trim() === "") {
      newHeaders.delete("OpenAI-Organization");
    }

    // If the client requested heartbeat wrapping AND the upstream succeeded,
    // wrap the response body in an SSE stream that first collects the entire
    // upstream body while emitting `: heartbeat\n\n` every 15 s, then sends
    // the payload as `data: <json>\n\n` followed by `data: [DONE]\n\n`.
    if (wantHeartbeat && res.ok && res.body) {
      const upstream = res.body;
      const HEARTBEAT_INTERVAL_MS = 15_000;

      const stream = new ReadableStream({
        async start(ctrl) {
          const encoder = new TextEncoder();
          const heartbeat = encoder.encode(": heartbeat\n\n");

          // Start heartbeat timer
          const timer = setInterval(() => {
            try {
              ctrl.enqueue(heartbeat);
            } catch {
              clearInterval(timer);
            }
          }, HEARTBEAT_INTERVAL_MS);

          try {
            // Collect the full upstream body
            const reader = upstream.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) chunks.push(value);
            }

            clearInterval(timer);

            // Concatenate chunks
            const totalLen = chunks.reduce((n, c) => n + c.length, 0);
            const body = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of chunks) {
              body.set(chunk, offset);
              offset += chunk.length;
            }

            // Send the actual payload as an SSE data event
            const payload = new TextDecoder().decode(body);
            ctrl.enqueue(encoder.encode(`data: ${payload}\n\n`));
            ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
            ctrl.close();
          } catch (e) {
            clearInterval(timer);
            ctrl.error(e);
          }
        },
      });

      newHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
      newHeaders.set("Cache-Control", "no-cache");
      newHeaders.set("Connection", "keep-alive");
      newHeaders.delete("content-length");

      return new Response(stream, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    cleanupTimeout();
  }
}
