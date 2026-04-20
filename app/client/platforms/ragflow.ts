"use client";

import { ApiPath, RAGFLOW_BASE_URL, RAGFlow } from "@/app/constant";
import { BaseOpenAICompatibleApi } from "./base";

/**
 * RAGFlow API — OpenAI-compatible knowledge base proxy.
 *
 * RAGFlow wraps knowledge bases as OpenAI-compatible endpoints.
 * Models use the "ragflow/" prefix (e.g. "ragflow/synopsys").
 */
export class RAGFlowApi extends BaseOpenAICompatibleApi {
  constructor() {
    super({
      providerName: "RAGFlow",
      urlConfigKey: "ragflowUrl",
      baseUrl: RAGFLOW_BASE_URL,
      apiPath: ApiPath.RAGFlow,
      chatPath: RAGFlow.ChatPath,
      supportsVision: false,
    });
  }
}
