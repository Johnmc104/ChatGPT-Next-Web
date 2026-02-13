import { NextResponse } from "next/server";

import { ensureModelInfo, getModelInfoCache } from "./cache";
import type { ModelInfoResponse } from "./types";
import { logger } from "@/app/utils/logger";

/**
 * GET /api/model-info
 *
 * Returns cached model metadata (context_length, max_output, pricing).
 * On first call, lazily fetches from OpenRouter API and caches in memory.
 *
 * Response shape: ModelInfoResponse
 */
async function handle() {
  try {
    await ensureModelInfo();

    const { models, updated_at } = getModelInfoCache();

    const response: ModelInfoResponse = {
      models,
      updated_at: updated_at ?? new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        // Client can cache for 10 minutes
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (err) {
    logger.error("[Model Info] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch model info", models: {}, updated_at: null },
      { status: 502 },
    );
  }
}

export const GET = handle;

// Use Node.js runtime for persistent in-memory cache across requests
// (edge runtime does not guarantee memory persistence)
export const runtime = "nodejs";
