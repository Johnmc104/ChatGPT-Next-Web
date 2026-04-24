/**
 * Dedicated image-edit endpoint using Node.js (Serverless) runtime.
 *
 * The /v1/images/edits endpoint requires multipart/form-data, which is
 * incompatible with requestOpenai() (hardcoded Content-Type: application/json).
 * This route directly forwards the FormData to the upstream OpenAI API.
 *
 * Uses Node.js runtime (not Edge) for longer timeout (image edits can take
 * 30-120+ seconds). Also wraps the response with SSE heartbeats to keep
 * Cloudflare and other proxies alive.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import { ModelProvider, OPENAI_BASE_URL } from "@/app/constant";
import { auth } from "../auth";
import { resolveAuthHeaderValue } from "../common";
import { normalizeBaseUrl, buildFetchUrl } from "../url-builder";
import { wrapWithHeartbeat, SSE_HEADERS } from "../utils/sse-heartbeat";
import { logger } from "@/app/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  logger.debug("[Image-Edit Route] request received");

  const authResult = await auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, { status: 401 });
  }

  try {
    const serverConfig = getServerSideConfig();

    // Resolve upstream URL
    const baseUrl = normalizeBaseUrl(serverConfig.baseUrl || OPENAI_BASE_URL);
    const fetchUrl = buildFetchUrl({
      baseUrl,
      requestPath: "/v1/images/edits",
      useCloudflareGateway: true,
    });

    // Resolve auth
    const authValue = resolveAuthHeaderValue(req, authResult);

    // Forward the multipart/form-data body directly.
    // The browser sets the correct Content-Type with boundary automatically;
    // we must NOT set Content-Type ourselves so the boundary is preserved.
    const formData = await req.formData();
    const upstreamForm = new FormData();
    for (const [key, value] of formData.entries()) {
      upstreamForm.append(key, value);
    }

    logger.info("[Image-Edit] forwarding to", fetchUrl);

    const response = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        Authorization: authValue,
        ...(serverConfig.openaiOrgId && {
          "OpenAI-Organization": serverConfig.openaiOrgId,
        }),
      },
      body: upstreamForm,
    });

    // If upstream returned an error, forward it
    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[Image-Edit] upstream error", response.status, errorText);
      return new Response(errorText, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Wrap response with SSE heartbeats (shared utility)
    const wantHeartbeat = req.headers.get("X-Stream-Heartbeat") === "1";

    if (wantHeartbeat && response.body) {
      const stream = wrapWithHeartbeat(
        response.body as ReadableStream<Uint8Array>,
      );

      return new Response(stream, {
        status: 200,
        headers: SSE_HEADERS,
      });
    }

    // No heartbeat requested — forward the JSON response directly
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    logger.error("[Image-Edit]", e);
    return NextResponse.json(
      { error: true, message: String(e) },
      { status: 500 },
    );
  }
}
