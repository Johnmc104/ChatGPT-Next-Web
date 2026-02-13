import { getServerSideConfig } from "@/app/config/server";
import {
  BAIDU_BASE_URL,
  ApiPath,
  ModelProvider,
  ServiceProvider,
} from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth";
import { isModelNotavailableInServer } from "@/app/utils/model";
import { getAccessToken } from "@/app/utils/baidu";
import {
  normalizeBaseUrl,
  cleanResponseHeaders,
  createTimeoutController,
} from "@/app/api/url-builder";
import { logger } from "@/app/utils/logger";

const serverConfig = getServerSideConfig();

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  logger.debug("[Baidu Route] params", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = auth(req, ModelProvider.Ernie);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  if (!serverConfig.baiduApiKey || !serverConfig.baiduSecretKey) {
    return NextResponse.json(
      {
        error: true,
        message: `missing BAIDU_API_KEY or BAIDU_SECRET_KEY in server env vars`,
      },
      {
        status: 401,
      },
    );
  }

  try {
    const response = await request(req);
    return response;
  } catch (e) {
    logger.error("[Baidu]", e);
    return NextResponse.json(prettyObject(e));
  }
}

async function request(req: NextRequest) {
  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.Baidu, "");

  let baseUrl = normalizeBaseUrl(serverConfig.baiduUrl || BAIDU_BASE_URL);

  logger.debug("[Baidu Proxy]", path);
  logger.debug("[Baidu Base Url]", baseUrl);

  const { signal, cleanup } = createTimeoutController();

  const { access_token } = await getAccessToken(
    serverConfig.baiduApiKey as string,
    serverConfig.baiduSecretKey as string,
  );
  const fetchUrl = `${baseUrl}${path}?access_token=${access_token}`;

  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
    },
    method: req.method,
    body: req.body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal,
  };

  // #1815 try to refuse some request to some models
  if (serverConfig.customModels && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody) as { model?: string };

      // not undefined and is false
      if (
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          ServiceProvider.Baidu as string,
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
      logger.error("[Baidu] filter", e);
    }
  }
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
