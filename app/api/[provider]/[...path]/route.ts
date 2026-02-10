import { ApiPath } from "@/app/constant";
import { NextRequest, NextResponse } from "next/server";
import { handle as openaiHandler } from "../../openai";
import { handle as azureHandler } from "../../azure";
import { handle as googleHandler } from "../../google";
import { handle as baiduHandler } from "../../baidu";
import { handle as stabilityHandler } from "../../stability";
import { handle as proxyHandler } from "../../proxy";
import { PROVIDER_CONFIGS, createProviderHandler } from "../../provider";

async function handle(
  req: NextRequest,
  { params }: { params: { provider: string; path: string[] } },
) {
  const apiPath = `/api/${params.provider}`;
  console.log(`[${params.provider} Route] params `, params);

  // Check the generic provider registry first
  const providerConfig = PROVIDER_CONFIGS[apiPath];
  if (providerConfig) {
    return createProviderHandler(providerConfig)(req, { params });
  }

  // Special handlers that need provider-specific logic
  switch (apiPath) {
    case ApiPath.Azure:
      return azureHandler(req, { params });
    case ApiPath.Google:
      return googleHandler(req, { params });
    case ApiPath.Baidu:
      return baiduHandler(req, { params });
    // case ApiPath.Tencent: using "/api/tencent"
    case ApiPath.Stability:
      return stabilityHandler(req, { params });
    case ApiPath.OpenAI:
      return openaiHandler(req, { params });
    default:
      return proxyHandler(req, { params });
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
