"use client";

import { ApiPath, ByteDance, BYTEDANCE_BASE_URL } from "@/app/constant";
import { BaseOpenAICompatibleApi } from "./base";

/**
 * ByteDance (Doubao) API — OpenAI-compatible with thinking + vision.
 */
export class DoubaoApi extends BaseOpenAICompatibleApi {
  constructor() {
    super({
      providerName: "ByteDance",
      urlConfigKey: "bytedanceUrl",
      baseUrl: BYTEDANCE_BASE_URL,
      apiPath: ApiPath.ByteDance,
      chatPath: ByteDance.ChatPath,
      supportsThinking: true,
      includeUsageInStream: true,
      supportsVision: true,
      stripAssistantThinking: true,
    });
  }
}
export { ByteDance };
