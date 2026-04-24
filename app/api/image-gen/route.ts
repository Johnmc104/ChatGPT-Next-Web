/**
 * Dedicated image-generation endpoint using Node.js (Serverless) runtime.
 *
 * The main API route (/api/openai/...) runs on Vercel Edge Runtime, which has a
 * 25-second execution limit. Image generation models like gpt-image-2 can take
 * 30–120+ seconds, causing timeouts.
 *
 * This route uses the Node.js runtime with maxDuration=300, giving up to 5 minutes
 * for image generation. It also wraps the response in an SSE stream with heartbeat
 * comments every 15 seconds to keep Cloudflare (100s proxy timeout) alive.
 */
import { NextRequest, NextResponse } from "next/server";
import { ModelProvider } from "@/app/constant";
import { auth } from "../auth";
import { requestOpenai } from "../common";
import { logger } from "@/app/utils/logger";

// Node.js runtime — supports up to 300s on Vercel Pro (60s on Hobby)
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  logger.debug("[Image-Gen Route] request received");

  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, { status: 401 });
  }

  try {
    // The request body has the image generation payload.
    // We need to forward it to /v1/images/generations on the upstream.
    // requestOpenai reads the path from req.nextUrl.pathname, so we need to
    // rewrite it to look like /api/openai/v1/images/generations.
    const url = new URL(req.url);
    url.pathname = "/api/openai/v1/images/generations";
    const rewrittenReq = new NextRequest(url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      // @ts-ignore
      duplex: "half",
    });

    const response = await requestOpenai(rewrittenReq, authResult);
    return response;
  } catch (e) {
    logger.error("[Image-Gen]", e);
    return NextResponse.json(
      { error: true, message: String(e) },
      { status: 500 },
    );
  }
}
