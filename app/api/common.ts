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
  options?: { isBearer?: boolean; headerName?: string },
): string {
  const isBearer = options?.isBearer ?? true;
  const headerName = options?.headerName ?? "Authorization";

  // 1. User provided their own API key
  const userApiKey = req.headers.get("X-User-Api-Key");
  if (userApiKey) {
    return isBearer ? `Bearer ${userApiKey}` : userApiKey;
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
  const controller = new AbortController();

  const isAzure = req.nextUrl.pathname.includes("azure/deployments");

  var authValue,
    authHeaderName = "";
  if (isAzure) {
    authValue =
      req.headers
        .get("Authorization")
        ?.trim()
        .replaceAll("Bearer ", "")
        .trim() ?? "";

    authHeaderName = "api-key";
  } else {
    authValue = req.headers.get("Authorization") ?? "";
    authHeaderName = "Authorization";
  }

  // Resolve the correct auth value for upstream API calls:
  // Priority: 1) User's own API key  2) System API key  3) Original auth header
  const userApiKey = req.headers.get("X-User-Api-Key");
  if (userApiKey) {
    // User provided their own API key
    authValue = isAzure ? userApiKey : `Bearer ${userApiKey}`;
  } else if (authResult?.systemApiKey) {
    // User authenticated with access code, use server's API key
    authValue = isAzure
      ? authResult.systemApiKey
      : `Bearer ${authResult.systemApiKey}`;
  } else if (
    authValue.includes(ACCESS_CODE_PREFIX) ||
    authValue.replace("Bearer ", "").trim().startsWith("nk-")
  ) {
    // Fallback safety: if the auth header still contains an access code prefix,
    // try to use the server's API key to prevent forwarding access codes upstream
    const fallbackKey = isAzure
      ? serverConfig.azureApiKey
      : serverConfig.apiKey;
    if (fallbackKey) {
      authValue = isAzure ? fallbackKey : `Bearer ${fallbackKey}`;
    }
  }

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/openai/", "");

  let baseUrl =
    (isAzure ? serverConfig.azureUrl : serverConfig.baseUrl) || OPENAI_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // Known API endpoint paths
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

  // Check if BASE_URL already contains an API endpoint path
  // If so, we need to handle path replacement intelligently
  let baseUrlEndpoint = "";
  for (const endpoint of apiEndpoints) {
    if (baseUrl.toLowerCase().endsWith(endpoint)) {
      baseUrlEndpoint = endpoint;
      break;
    }
  }

  // Extract the base URL without the endpoint (if present)
  const baseUrlWithoutEndpoint = baseUrlEndpoint
    ? baseUrl.slice(0, -baseUrlEndpoint.length)
    : baseUrl;

  // Determine if the current request path matches the endpoint in BASE_URL
  const requestPath = "/" + path;
  const requestMatchesBaseEndpoint =
    baseUrlEndpoint && requestPath.toLowerCase() === baseUrlEndpoint;

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);
  console.log("[Base URL endpoint]", baseUrlEndpoint || "none");
  console.log("[Request path]", requestPath);
  console.log("[Request matches base endpoint]", requestMatchesBaseEndpoint);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

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
        console.log("[Replace with DeployId", realDeployName);
        path = path.replaceAll(modelName, realDeployName);
      }
    }
  }

  // Determine the final URL:
  // 1. If BASE_URL has an endpoint and request matches it -> use BASE_URL directly
  // 2. If BASE_URL has an endpoint but request is different -> replace endpoint
  // 3. If BASE_URL has no endpoint -> append path as usual
  let fetchUrl: string;
  if (baseUrlEndpoint) {
    if (requestMatchesBaseEndpoint) {
      // Request matches the endpoint in BASE_URL, use it directly
      fetchUrl = baseUrl;
    } else {
      // Request is for a different endpoint, replace the endpoint part
      fetchUrl = cloudflareAIGatewayUrl(
        `${baseUrlWithoutEndpoint}${requestPath}`,
      );
    }
  } else {
    // BASE_URL doesn't have an endpoint, append path normally
    fetchUrl = cloudflareAIGatewayUrl(`${baseUrl}/${path}`);
  }
  console.log("fetchUrl", fetchUrl);
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
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  // Check if using custom BASE_URL (e.g., OpenRouter, other compatible APIs)
  const isUsingCustomBaseUrl =
    serverConfig.baseUrl && serverConfig.baseUrl !== OPENAI_BASE_URL;

  // #1815 try to refuse gpt4 request
  // Skip model filtering when using custom BASE_URL (OpenRouter compatible APIs)
  if (serverConfig.customModels && req.body && !isUsingCustomBaseUrl) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

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
      console.error("[OpenAI] gpt4 filter", e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // Extract the OpenAI-Organization header from the response
    const openaiOrganizationHeader = res.headers.get("OpenAI-Organization");

    // Check if serverConfig.openaiOrgId is defined and not an empty string
    if (serverConfig.openaiOrgId && serverConfig.openaiOrgId.trim() !== "") {
      // If openaiOrganizationHeader is present, log it; otherwise, log that the header is not present
      console.log("[Org ID]", openaiOrganizationHeader);
    } else {
      console.log("[Org ID] is not set up.");
    }

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    // Conditionally delete the OpenAI-Organization header from the response if [Org ID] is undefined or empty (not setup in ENV)
    // Also, this is to prevent the header from being sent to the client
    if (!serverConfig.openaiOrgId || serverConfig.openaiOrgId.trim() === "") {
      newHeaders.delete("OpenAI-Organization");
    }

    // The latest version of the OpenAI API forced the content-encoding to be "br" in json response
    // So if the streaming is disabled, we need to remove the content-encoding header
    // Because Vercel uses gzip to compress the response, if we don't remove the content-encoding header
    // The browser will try to decode the response with brotli and fail
    newHeaders.delete("content-encoding");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
