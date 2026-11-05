import { ACCESS_CODE_PREFIX, ServiceProvider } from "../../constant";
import { validateEndpointUrl } from "./config";

export interface EndpointDiagnosticConfig {
  url: string;
  apiKey: string;
  provider?: ServiceProvider;
  apiVersion?: string;
  isApp?: boolean;
  accessCode?: string;
}

/** Construct only read-only diagnostics; never send a chat/generation request. */
export function buildEndpointDiagnostic(config: EndpointDiagnosticConfig) {
  const validation = validateEndpointUrl(config.url);
  if (!validation.valid || !validation.normalized) return undefined;
  const relative = validation.normalized.startsWith("/");
  const target = new URL(validation.normalized, "https://app.invalid");
  const provider = config.provider ?? ServiceProvider.OpenAI;
  let base = target.pathname.replace(/\/+$/, "");
  let path: string;
  if (provider === ServiceProvider.Azure) {
    base = base.replace(/\/openai(?:\/.*)?$/i, "");
    path = "/openai/models";
    target.searchParams.set("api-version", config.apiVersion || "2024-10-21");
  } else if (provider === ServiceProvider.Stability) {
    base = base.replace(/\/v[12](?:beta)?(?:\/.*)?$/i, "");
    path = "/v1/user/account";
  } else {
    base = base.replace(/\/(?:v1\/)?(?:chat\/completions|models)$/i, "");
    path = /\/v1$/i.test(base) ? "/models" : "/v1/models";
  }
  target.pathname = base + path;
  target.hash = "";
  const key = config.apiKey.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  const direct = !relative && config.isApp;
  if (direct) {
    if (key) {
      headers[
        provider === ServiceProvider.Azure ? "api-key" : "Authorization"
      ] = provider === ServiceProvider.Azure ? key : `Bearer ${key}`;
    }
  } else {
    if (config.accessCode?.trim()) {
      headers.Authorization = `Bearer ${ACCESS_CODE_PREFIX}${config.accessCode.trim()}`;
    } else if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
    if (key) headers["X-User-Api-Key"] = key;
    if (provider === ServiceProvider.Azure && key) headers["api-key"] = key;
  }
  if (relative) return { url: target.pathname + target.search, headers };
  if (direct) return { url: target.toString(), headers };
  // Give the server proxy an origin and an already-normalized request path.
  headers["X-Base-URL"] = target.origin;
  return { url: `/api/proxy${target.pathname}${target.search}`, headers };
}
