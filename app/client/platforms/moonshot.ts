"use client";

import { ApiPath, MOONSHOT_BASE_URL, Moonshot } from "@/app/constant";
import { BaseOpenAICompatibleApi } from "./base";

/**
 * Moonshot API — pure OpenAI-compatible provider.
 * All logic is in the base class; only config differs.
 */
export class MoonshotApi extends BaseOpenAICompatibleApi {
  constructor() {
    super({
      providerName: "Moonshot",
      urlConfigKey: "moonshotUrl",
      baseUrl: MOONSHOT_BASE_URL,
      apiPath: ApiPath.Moonshot,
      chatPath: Moonshot.ChatPath,
    });
  }
}
