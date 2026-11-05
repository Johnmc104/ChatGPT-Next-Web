import { getClientConfig } from "@/app/config/client";
import { getHeaders } from "@/app/client/api";
import { validateEndpointUrl } from "@/app/domain/endpoint/config";

export interface EndpointTestResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  message: string;
}

export async function testEndpointConnection(
  baseUrl: string,
  apiKey: string,
): Promise<EndpointTestResult> {
  const validation = validateEndpointUrl(baseUrl);
  if (!validation.valid || !validation.normalized) {
    return {
      ok: false,
      latencyMs: 0,
      message: `接口地址无效 / Invalid endpoint (${validation.code ?? "unknown"})`,
    };
  }

  const normalized = validation.normalized;
  const isApp = !!getClientConfig()?.isApp;
  const isRelative = normalized.startsWith("/");
  const endpoint = `${normalized.replace(/\/$/, "")}/v1/models`;
  const headers: Record<string, string> = {
    ...getHeaders(false),
    ...(apiKey.trim() ? { "X-User-Api-Key": apiKey.trim() } : {}),
  };

  if (!isRelative && !isApp) {
    headers["X-Base-URL"] = normalized;
  }

  const url = isRelative
    ? endpoint
    : !isApp
    ? "/api/proxy/v1/models"
    : endpoint;
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - started);
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        latencyMs,
        message: `连接成功 / Connected (${response.status}, ${latencyMs} ms)`,
      };
    }
    return {
      ok: false,
      status: response.status,
      latencyMs,
      message:
        response.status === 401 || response.status === 403
          ? `认证失败 / Authentication failed (${response.status})`
          : `接口返回错误 / Endpoint returned ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: false,
      latencyMs,
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "连接超时 / Connection timed out"
          : "无法连接接口 / Unable to reach endpoint",
    };
  } finally {
    clearTimeout(timeout);
  }
}
