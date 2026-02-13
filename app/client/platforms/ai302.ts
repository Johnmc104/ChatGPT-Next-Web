"use client";

import { ApiPath, AI302_BASE_URL, DEFAULT_MODELS, AI302 } from "@/app/constant";
import { getHeaders, LLMModel } from "../api";
import { BaseOpenAICompatibleApi } from "./base";
import { fetch } from "@/app/utils/stream";

export interface Ai302ListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

/**
 * 302.AI API — OpenAI-compatible with thinking + auto vision + model listing.
 */
export class Ai302Api extends BaseOpenAICompatibleApi {
  private disableListModels = false;

  constructor() {
    super({
      providerName: "302.AI",
      urlConfigKey: "ai302Url",
      baseUrl: AI302_BASE_URL,
      apiPath: ApiPath["302.AI"],
      chatPath: AI302.ChatPath,
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

    const res = await fetch(this.path(AI302.ListModelPath), {
      method: "GET",
      headers: { ...getHeaders() },
    });

    const resJson = (await res.json()) as Ai302ListModelResponse;
    const chatModels = resJson.data;
    console.log("[Models]", chatModels);

    if (!chatModels) return [];

    let seq = 1000;
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "ai302",
        providerName: "302.AI",
        providerType: "ai302",
        sorted: 15,
      },
    }));
  }
}
