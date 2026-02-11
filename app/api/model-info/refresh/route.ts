import { NextResponse } from "next/server";

import { refreshModelInfo, getModelInfoCache } from "../cache";

/**
 * POST /api/model-info/refresh
 *
 * Manually trigger a refresh of the model info cache from OpenRouter.
 * Reserved for admin use — trigger via:
 *   curl -X POST http://localhost:3000/api/model-info/refresh
 *
 * No authentication for now (manual curl only, not exposed in UI).
 */
async function handle() {
  try {
    const count = await refreshModelInfo();
    const { updated_at } = getModelInfoCache();

    return NextResponse.json({
      success: true,
      count,
      updated_at,
    });
  } catch (err: any) {
    console.error("[Model Info Refresh] Error:", err);
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
