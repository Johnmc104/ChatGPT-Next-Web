import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { auth } from "./auth";
import { ModelProvider, ACCESS_CODE_PREFIX } from "@/app/constant";

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[Proxy Route] params ", params);
  console.log(
    "[Proxy Route] Authorization header:",
    req.headers.get("Authorization"),
  );

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  // Authenticate the request
  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  const serverConfig = getServerSideConfig();

  // remove path params from searchParams
  req.nextUrl.searchParams.delete("path");
  req.nextUrl.searchParams.delete("provider");

  const subpath = params.path.join("/");
  const baseUrl = req.headers.get("x-base-url") || serverConfig.baseUrl || "";
  const queryString = req.nextUrl.searchParams.toString();

  // Build the fetch URL, apply cloudflare AI gateway URL transformation
  let fetchUrl = `${baseUrl}/${subpath}`;
  if (queryString) {
    fetchUrl += `?${queryString}`;
  }
  fetchUrl = cloudflareAIGatewayUrl(fetchUrl);

  console.log("[Proxy] fetchUrl:", fetchUrl);

  const skipHeaders = ["connection", "host", "origin", "referer", "cookie"];
  const headers = new Headers(
    Array.from(req.headers.entries()).filter((item) => {
      if (
        item[0].indexOf("x-") > -1 ||
        item[0].indexOf("sec-") > -1 ||
        skipHeaders.includes(item[0])
      ) {
        return false;
      }
      return true;
    }),
  );

  // Set Authorization header for the upstream API call
  // Priority:
  // 1. User's own API key (from X-User-Api-Key header) - user wants to use their key
  // 2. System API key (from auth result) - server provides the key
  // 3. Original Authorization header (backward compatibility)
  const userApiKey = req.headers.get("X-User-Api-Key");

  if (userApiKey) {
    // User provided their own API key, use it for the upstream call
    headers.set("Authorization", `Bearer ${userApiKey}`);
    console.log(
      "[Proxy] Authorization header set with user's own API key (X-User-Api-Key)",
    );
  } else if (authResult.systemApiKey) {
    // User authenticated with access code, use server's API key
    headers.set("Authorization", `Bearer ${authResult.systemApiKey}`);
    console.log("[Proxy] Authorization header set with system API key");
  } else {
    // Fallback: try to use original Authorization header (if it's an API key, not access code)
    const authValue = req.headers.get("Authorization") ?? "";
    if (authValue && !authValue.includes("nk-")) {
      headers.set("Authorization", authValue);
      console.log("[Proxy] Authorization header set with original auth header");
    }
  }

  const controller = new AbortController();
  const fetchOptions: RequestInit = {
    headers,
    method: req.method,
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  try {
    const res = await fetch(fetchUrl, fetchOptions);
    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

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
