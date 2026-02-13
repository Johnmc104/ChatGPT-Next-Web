"use client";

import { ApiPath, DEEPSEEK_BASE_URL, DeepSeek } from "@/app/constant";
import { ChatOptions } from "../api";
import { BaseOpenAICompatibleApi } from "./base";
import { RequestPayload } from "./openai";

/**
 * DeepSeek API — OpenAI-compatible with thinking support.
 *
 * Custom buildMessages: strips assistant thinking blocks and ensures
 * the first non-system message is a user message (DeepSeek requirement).
 */
export class DeepSeekApi extends BaseOpenAICompatibleApi {
  constructor() {
    super({
      providerName: "DeepSeek",
      urlConfigKey: "deepseekUrl",
      baseUrl: DEEPSEEK_BASE_URL,
      apiPath: ApiPath.DeepSeek,
      chatPath: DeepSeek.ChatPath,
      supportsThinking: true,
      includeUsageInStream: true,
      stripAssistantThinking: true,
    });
  }

  /**
   * Override to enforce DeepSeek's requirement: the first non-system
   * message must be a user message. Skips leading assistant messages.
   */
  protected async buildMessages(
    messages: ChatOptions["messages"],
    modelName?: string,
  ): Promise<RequestPayload["messages"]> {
    const base = await super.buildMessages(messages, modelName);

    // Filter: ensure first non-system message is user
    const filtered: RequestPayload["messages"] = [];
    let hasFoundFirstUser = false;

    for (const msg of base) {
      if (msg.role === "system") {
        filtered.push(msg);
      } else if (msg.role === "user") {
        filtered.push(msg);
        hasFoundFirstUser = true;
      } else if (hasFoundFirstUser) {
        filtered.push(msg);
      }
      // Skip non-system, non-user messages before first user message
    }

    return filtered;
  }
}
