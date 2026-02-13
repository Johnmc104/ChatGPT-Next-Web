import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import { auth } from "./auth";
import { resolveAuthHeaderValue } from "./common";
import { ModelProvider } from "@/app/constant";
import {
  buildFetchUrl,
  buildUpstreamHeaders,
  cleanResponseHeaders,
  createTimeoutController,
  fetchWithRetry,
} from "./url-builder";
import { logger } from "@/app/utils/logger";

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  logger.debug("[Proxy Route] params", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  // Authenticate the request
  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, { status: 401 });
  }

  const serverConfig = getServerSideConfig();

  // remove path params from searchParams
  req.nextUrl.searchParams.delete("path");
  req.nextUrl.searchParams.delete("provider");

  const subpath = params.path.join("/");
  const baseUrl = req.headers.get("x-base-url") || serverConfig.baseUrl || "";
  const queryString = req.nextUrl.searchParams.toString();

  const fetchUrl = buildFetchUrl({
    baseUrl,
    requestPath: subpath,
    queryString,
    useCloudflareGateway: true,
  });

  logger.info("[Proxy] fetchUrl:", fetchUrl);

  // Build clean upstream headers
  const headers = buildUpstreamHeaders(req);

  // Set Authorization header using unified resolver
  const authValue = resolveAuthHeaderValue(req, authResult);
  if (authValue) {
    headers.set("Authorization", authValue);
  }

  const { signal, cleanup } = createTimeoutController();
  const fetchOptions: RequestInit = {
    headers,
    method: req.method,
    body: req.body,
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
