import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import {
  ACCESS_CODE_PREFIX,
  ModelProvider,
  STABILITY_BASE_URL,
} from "@/app/constant";
import { auth } from "@/app/api/auth";
import {
  normalizeBaseUrl,
  cleanResponseHeaders,
  createTimeoutController,
} from "@/app/api/url-builder";
import { logger } from "@/app/utils/logger";

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  logger.debug("[Stability] params", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const controller = new AbortController();

  const serverConfig = getServerSideConfig();

  let baseUrl = normalizeBaseUrl(
    serverConfig.stabilityUrl || STABILITY_BASE_URL,
  );

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/stability/", "");

  logger.debug("[Stability Proxy]", path);
  logger.debug("[Stability Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  const authResult = auth(req, ModelProvider.Stability);

  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  // Resolve the API key: prefer user's own key, then system key from auth, then server config
  const userApiKey = req.headers.get("X-User-Api-Key");
  const bearToken = req.headers.get("Authorization") ?? "";
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();
  const isAccessCode =
    token.startsWith(ACCESS_CODE_PREFIX) || token.startsWith("nk-");

  const key = userApiKey
    ? userApiKey
    : token && !isAccessCode
    ? token
    : authResult.systemApiKey || serverConfig.stabilityApiKey;

  if (!key) {
    return NextResponse.json(
      {
        error: true,
        message: `missing STABILITY_API_KEY in server env vars`,
      },
      {
        status: 401,
      },
    );
  }

  const fetchUrl = `${baseUrl}/${path}`;
  logger.info("[Stability] fetchUrl:", fetchUrl);
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": req.headers.get("Content-Type") || "multipart/form-data",
      Accept: req.headers.get("Accept") || "application/json",
      Authorization: `Bearer ${key}`,
    },
    method: req.method,
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  try {
    const res = await fetch(fetchUrl, fetchOptions);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: cleanResponseHeaders(res.headers),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
