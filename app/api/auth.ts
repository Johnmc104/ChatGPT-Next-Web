import { NextRequest } from "next/server";
import { getServerSideConfig, getAccessCodeSet } from "../config/server";
import { sha256 } from "../utils/hash";
import { ACCESS_CODE_PREFIX, ModelProvider } from "../constant";
import { logger } from "@/app/utils/logger";

function getIP(req: NextRequest) {
  let ip = req.ip ?? req.headers.get("x-real-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (!ip && forwardedFor) {
    ip = forwardedFor.split(",").at(0) ?? "";
  }

  return ip;
}

function parseApiKey(bearToken: string) {
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();
  const isApiKey = !token.startsWith(ACCESS_CODE_PREFIX);

  return {
    accessCode: isApiKey ? "" : token.slice(ACCESS_CODE_PREFIX.length),
    apiKey: isApiKey ? token : "",
  };
}

export interface AuthResult {
  error: boolean;
  msg?: string;
  systemApiKey?: string;
}

export async function auth(
  req: NextRequest,
  modelProvider: ModelProvider,
): Promise<AuthResult> {
  const authToken = req.headers.get("Authorization") ?? "";

  // check if it is openai api key or user token
  const { accessCode, apiKey } = parseApiKey(authToken);

  const hashedCode = await sha256(accessCode ?? "");

  const serverConfig = getServerSideConfig();
  const accessCodes = await getAccessCodeSet();
  logger.debug("[Auth] code count:", accessCodes.size);
  logger.debug("[Auth] has access code:", !!accessCode);
  logger.debug("[User IP]", getIP(req));

  if (serverConfig.needCode && !accessCodes.has(hashedCode) && !apiKey) {
    return {
      error: true,
      msg: !accessCode ? "empty access code" : "wrong access code",
    };
  }

  if (serverConfig.hideUserApiKey && !!apiKey) {
    return {
      error: true,
      msg: "you are not allowed to access with your own api key",
    };
  }

  // if user does not provide an api key, inject system api key
  if (!apiKey) {
    const serverConfig = getServerSideConfig();

    let systemApiKey: string | undefined;

    switch (modelProvider) {
      case ModelProvider.Stability:
        systemApiKey = serverConfig.stabilityApiKey;
        break;
      case ModelProvider.RAGFlow:
        systemApiKey = serverConfig.ragflowApiKey;
        break;
      case ModelProvider.GPT:
      default:
        if (req.nextUrl.pathname.includes("azure/deployments")) {
          systemApiKey = serverConfig.azureApiKey;
        } else {
          systemApiKey = serverConfig.apiKey;
        }
    }

    // Unified proxy fallback: when a provider-specific key is not configured
    // but BASE_URL is set (unified proxy mode), fall back to the default apiKey.
    // This allows all providers to share the same API key through the proxy.
    if (!systemApiKey && serverConfig.baseUrl) {
      logger.info(
        "[Auth] provider-specific key not set, falling back to default apiKey (unified proxy mode)",
      );
      systemApiKey = serverConfig.apiKey;
    }

    if (systemApiKey) {
      logger.keyInfo("[Auth] system api key", systemApiKey);
      // Return systemApiKey so the caller can set the Authorization header
      return {
        error: false,
        systemApiKey,
      };
    } else {
      logger.warn("[Auth] no api key available for provider:", modelProvider);
      // Return error if no API key is available
      return {
        error: true,
        msg: "Server API key not configured. Please contact the administrator or provide your own API key.",
      };
    }
  } else {
    logger.info("[Auth] using user-provided api key");
    // User provided their own API key, pass it through
    return {
      error: false,
    };
  }
}
