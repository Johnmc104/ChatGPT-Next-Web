import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { getServerSideConfig } from "@/app/config/server";
import {
  ACCESS_CODE_PREFIX,
  ApiPath,
  GEMINI_BASE_URL,
  ModelProvider,
} from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { resolveAuthHeaderValue } from "@/app/api/common";
import {
  normalizeBaseUrl,
  cleanResponseHeaders,
  createTimeoutController,
} from "@/app/api/url-builder";
import { logger } from "@/app/utils/logger";

const serverConfig = getServerSideConfig();

export async function handle(
  req: NextRequest,
  { params }: { params: { provider: string; path: string[] } },
) {
  logger.debug("[Google Route] params", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = auth(req, ModelProvider.GeminiPro);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  const bearToken =
    req.headers.get("x-goog-api-key") || req.headers.get("Authorization") || "";
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();

  // Don't use access code as API key - use server key instead
  const isAccessCode =
    token.startsWith(ACCESS_CODE_PREFIX) || token.startsWith("nk-");
  const apiKey =
    token && !isAccessCode
      ? token
      : authResult.systemApiKey || serverConfig.googleApiKey;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: true,
        message: `missing GOOGLE_API_KEY in server env vars`,
      },
      {
        status: 401,
      },
    );
  }
  try {
    const response = await request(req, apiKey);
    return response;
  } catch (e) {
    logger.error("[Google]", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
export const preferredRegion = [
  "bom1",
  "cle1",
  "cpt1",
  "gru1",
  "hnd1",
  "iad1",
  "icn1",
  "kix1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
];

async function request(req: NextRequest, apiKey: string) {
  let baseUrl = normalizeBaseUrl(serverConfig.googleUrl || GEMINI_BASE_URL);

  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.Google, "");

  logger.debug("[Google Proxy]", path);
  logger.debug("[Google Base Url]", baseUrl);

  const { signal, cleanup } = createTimeoutController();
  const fetchUrl = `${baseUrl}${path}${
    req?.nextUrl?.searchParams?.get("alt") === "sse" ? "?alt=sse" : ""
  }`;

  logger.info("[Google] fetchUrl:", fetchUrl);
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-goog-api-key": apiKey,
    },
    method: req.method,
    body: req.body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal,
  };

  try {
    const res = await fetch(fetchUrl, fetchOptions);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: cleanResponseHeaders(res.headers),
    });
  } finally {
    cleanup();
  }
}
