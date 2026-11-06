import { ApiPath } from "@/app/constant";
import { NextRequest, NextResponse } from "next/server";
import { handle as openaiHandler } from "../../openai";
import { handle as proxyHandler } from "../../proxy";
import { logger } from "@/app/utils/logger";

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; path: string[] }> },
) {
  const resolvedParams = await params;
  const apiPath = `/api/${resolvedParams.provider}`;
  logger.debug(`[${resolvedParams.provider} Route] params`, resolvedParams);

  // All providers route through the unified proxy architecture.
  // OpenAI and Azure have special handling (GPT-4 filtering, Azure URL rewriting).
  // Everything else is a generic proxy pass-through.
  switch (apiPath) {
    case ApiPath.Azure:
    case ApiPath.OpenAI:
    case ApiPath.Stability:
      return openaiHandler(req, {
        params: Promise.resolve({ path: resolvedParams.path }),
      });
    default:
      return proxyHandler(req, {
        params: Promise.resolve({ path: resolvedParams.path }),
      });
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
export const preferredRegion = [
  "arn1",
  "bom1",
  "cdg1",
  "cle1",
  "cpt1",
  "dub1",
  "fra1",
  "gru1",
  "hnd1",
  "iad1",
  "icn1",
  "kix1",
  "lhr1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
];
