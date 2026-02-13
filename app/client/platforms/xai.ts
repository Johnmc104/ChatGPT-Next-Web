"use client";

import { ApiPath, XAI_BASE_URL, XAI } from "@/app/constant";
import { BaseOpenAICompatibleApi } from "./base";

/**
 * XAI (Grok) API — OpenAI-compatible provider with vision support.
 */
export class XAIApi extends BaseOpenAICompatibleApi {
  constructor() {
    super({
      providerName: "XAI",
      urlConfigKey: "xaiUrl",
      baseUrl: XAI_BASE_URL,
      apiPath: ApiPath.XAI,
      chatPath: XAI.ChatPath,
      supportsVision: true,
    });
  }
}
