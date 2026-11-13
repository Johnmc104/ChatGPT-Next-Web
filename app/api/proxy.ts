import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import { auth, checkAccessCode } from "./auth";
import { resolveAuthHeaderValue } from "./common";
import { ModelProvider } from "@/app/constant";
import {
  buildFetchUrl,
  buildUpstreamHeaders,
  cleanResponseHeaders,
  createTimeoutController,
  fetchWithRetry,
  normalizeBaseUrl,
} from "./url-builder";
import { logger } from "@/app/utils/logger";

export interface ProxyTarget {
  /** Upstream configured on the server. Only it may receive the server key. */
  serverBaseUrl: string;
  /** Provider used for authentication and server-key selection. */
  provider: ModelProvider;
  /** Whether the client may choose the upstream via `X-Base-URL`. */
  allowClientBaseUrl: boolean;
}

export type ResolvedUpstream =
  { baseUrl: string; trusted: boolean } | { error: string };

/**
 * Decide which upstream a proxied request goes to and whether it is the
 * server's own upstream ("trusted"). Server credentials must never be sent
 * to an upstream the client picked: an access-code holder could otherwise
 * point `X-Base-URL` at their own host and receive the server API key.
 */
export function resolveUpstream(
  clientBaseUrl: string | null,
  target: ProxyTarget,
): ResolvedUpstream {
  const serverBaseUrl = target.serverBaseUrl.trim();
  const requested = target.allowClientBaseUrl ? clientBaseUrl?.trim() : "";

  if (requested) {
    let protocol: string;
    try {
      protocol = new URL(normalizeBaseUrl(requested)).protocol;
    } catch {
      return { error: "invalid upstream URL" };
    }
    if (protocol !== "https:" && protocol !== "http:") {
      return { error: "unsupported upstream protocol" };
    }
    const trusted =
      !!serverBaseUrl &&
      normalizeBaseUrl(requested) === normalizeBaseUrl(serverBaseUrl);
    return { baseUrl: requested, trusted };
  }

  if (!serverBaseUrl) {
    return { error: "upstream URL is not configured on the server" };
  }
  return { baseUrl: serverBaseUrl, trusted: true };
}

function defaultTarget(): ProxyTarget {
  return {
    serverBaseUrl: getServerSideConfig().baseUrl ?? "",
    provider: ModelProvider.GPT,
    allowClientBaseUrl: true,
  };
}

export async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  target: ProxyTarget = defaultTarget(),
) {
  const resolvedParams = await params;
  logger.debug("[Proxy Route] params", resolvedParams);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = await auth(req, target.provider);
  if (authResult.error) {
    return NextResponse.json(authResult, { status: 401 });
  }

  const upstream = resolveUpstream(req.headers.get("x-base-url"), target);
  if ("error" in upstream) {
    return NextResponse.json(
      { error: true, message: upstream.error },
      { status: 400 },
    );
  }

  // A client-chosen upstream turns this route into a general relay; when the
  // site requires an access code, a user key alone is not enough for it.
  if (!upstream.trusted && getServerSideConfig().needCode) {
    const codeStatus = await checkAccessCode(req);
    if (codeStatus !== "valid") {
      return NextResponse.json(
        {
          error: true,
          code: codeStatus === "missing" ? "missing-code" : "invalid-code",
          msg: "An access code is required for custom endpoints and plugins.",
        },
        { status: 401 },
      );
    }
  }

  // remove path params from searchParams
  req.nextUrl.searchParams.delete("path");
  req.nextUrl.searchParams.delete("provider");

  const fetchUrl = buildFetchUrl({
    baseUrl: upstream.baseUrl,
    requestPath: resolvedParams.path.join("/"),
    queryString: req.nextUrl.searchParams.toString(),
    useCloudflareGateway: true,
  });

  logger.info("[Proxy] fetchUrl:", fetchUrl, "trusted:", upstream.trusted);

  const headers = buildUpstreamHeaders(req);
  // A client-chosen upstream only receives the user's own credentials.
  const authValue = resolveAuthHeaderValue(
    req,
    upstream.trusted ? authResult : undefined,
  );
  headers.delete("authorization");
  if (authValue) {
    headers.set("Authorization", authValue);
  }

  // Always clone body to a string so fetchWithRetry can safely retry.
  // ReadableStream can only be consumed once — retries with an already-consumed
  // stream would send an empty body.
  const clonedBody = req.body ? await req.text() : null;

  const { signal, cleanup } = createTimeoutController();
  const fetchOptions: RequestInit = {
    headers,
    method: req.method,
    body: clonedBody,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal,
  };

  try {
    const res = await fetchWithRetry(fetchUrl, fetchOptions);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: cleanResponseHeaders(res.headers),
    });
  } finally {
    cleanup();
  }
}
