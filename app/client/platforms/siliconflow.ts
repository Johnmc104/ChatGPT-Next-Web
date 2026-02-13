"use client";

import {
  ApiPath,
  SILICONFLOW_BASE_URL,
  SiliconFlow,
  DEFAULT_MODELS,
} from "@/app/constant";
import { getHeaders, LLMModel } from "../api";
import { BaseOpenAICompatibleApi } from "./base";
import { fetch } from "@/app/utils/stream";

export interface SiliconFlowListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

/**
 * SiliconFlow API — OpenAI-compatible with thinking + auto vision + model listing.
 */
export class SiliconflowApi extends BaseOpenAICompatibleApi {
  private disableListModels = false;

  constructor() {
    super({
      providerName: "SiliconFlow",
      urlConfigKey: "siliconflowUrl",
      baseUrl: SILICONFLOW_BASE_URL,
      apiPath: ApiPath.SiliconFlow,
      chatPath: SiliconFlow.ChatPath,
      supportsThinking: true,
      includeUsageInStream: true,
      supportsVision: "auto",
      stripAssistantThinking: true,
    });
  }

  async models(): Promise<LLMModel[]> {
    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const res = await fetch(this.path(SiliconFlow.ListModelPath), {
      method: "GET",
      headers: { ...getHeaders() },
    });

    const resJson = (await res.json()) as SiliconFlowListModelResponse;
    const chatModels = resJson.data;
    console.log("[Models]", chatModels);

    if (!chatModels) return [];

    let seq = 1000;
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "siliconflow",
        providerName: "SiliconFlow",
        providerType: "siliconflow",
        sorted: 14,
      },
    }));
  }
}
