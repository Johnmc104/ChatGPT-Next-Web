import { NextRequest, NextResponse } from "next/server";
import { ModelProvider } from "@/app/constant";
import { auth } from "../../auth";

import { refreshModelInfo, getModelInfoCache } from "../cache";
import { logger } from "@/app/utils/logger";

/**
 * POST /api/model-info/refresh
 *
 * Manually trigger a refresh of the model info cache from OpenRouter.
 * Requires the same authorization as chat requests, e.g.
 *   curl -X POST -H "Authorization: Bearer nk-<code>" <site>/api/model-info/refresh
 */
async function handle(req: NextRequest) {
  const authResult = await auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(
      { success: false, code: authResult.code },
      { status: 401 },
    );
  }
  try {
    const count = await refreshModelInfo();
    const { updated_at } = getModelInfoCache();

    return NextResponse.json({
      success: true,
      count,
      updated_at,
    });
  } catch (err: any) {
    logger.error("[Model Info Refresh] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? "Unknown error",
      },
      { status: 502 },
    );
  }
}

export const POST = handle;

export const runtime = "nodejs";
