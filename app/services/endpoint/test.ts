import { useAccessStore } from "../../store/access";
import { buildEndpointDiagnostic } from "../../domain/endpoint/diagnostic";
import { ServiceProvider } from "../../constant";

export type EndpointTestCode =
  | "connected"
  | "invalid"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "upstream"
  | "http"
  | "response"
  | "network"
  | "timeout"
  | "cancelled";

export interface EndpointTestResult {
  ok: boolean;
  code: EndpointTestCode;
  status?: number;
  latencyMs: number;
}

export async function testEndpointConnection(
  baseUrl: string,
  apiKey: string,
  options: {
    provider?: ServiceProvider;
    apiVersion?: string;
    signal?: AbortSignal;
  } = {},
): Promise<EndpointTestResult> {
  const request = buildEndpointDiagnostic({
    url: baseUrl,
    apiKey,
    ...options,
    accessCode: useAccessStore.getState().accessCode,
  });
  if (!request) return { ok: false, code: "invalid", latencyMs: 0 };
  if (options.signal?.aborted)
    return { ok: false, code: "cancelled", latencyMs: 0 };
  const started = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 8_000);
  const result = (
    code: EndpointTestCode,
    status?: number,
  ): EndpointTestResult => ({
    ok: code === "connected",
    code,
    status,
    latencyMs: Math.round(performance.now() - started),
  });
  try {
    const response = await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const code =
        response.status === 401
          ? "unauthorized"
          : response.status === 403
          ? "forbidden"
          : response.status === 404
          ? "not-found"
          : response.status === 429
          ? "rate-limited"
          : response.status >= 500
          ? "upstream"
          : "http";
      return result(code, response.status);
    }
    // A login page or reverse-proxy HTML response is not a successful API check.
    try {
      const body = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        body.error ||
        ([ServiceProvider.OpenAI, ServiceProvider.RAGFlow].includes(
          options.provider ?? ServiceProvider.OpenAI,
        ) &&
          !Array.isArray(body.data))
      ) {
        return result("response", response.status);
      }
    } catch {
      if (controller.signal.aborted)
        return result(timedOut ? "timeout" : "cancelled");
      return result("response", response.status);
    }
    return result("connected", response.status);
  } catch {
    return result(
      controller.signal.aborted
        ? timedOut
          ? "timeout"
          : "cancelled"
        : "network",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
