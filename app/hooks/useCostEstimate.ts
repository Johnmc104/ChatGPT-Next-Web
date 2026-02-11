import { useMemo } from "react";
import { useChatStore } from "../store";
import { useModelInfo, getContextLength } from "./useModelInfo";
import { computeEffectiveTokens } from "../utils/token-calc";

/**
 * Estimate the cost of sending the next message.
 *
 * Cost = inputTokens × pricing.input  +  estimatedOutputTokens × pricing.output
 *
 * Mirrors getMessagesWithMemory() logic via computeEffectiveTokens:
 *  - Respects historyMessageCount, max_tokens cap, sendMemory, clearContextIndex
 *
 * @param userInput  Current text in the input box (not yet sent)
 */
export function useCostEstimate(userInput: string) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const { getModelInfo } = useModelInfo();

  const modelConfig = session.mask.modelConfig;
  const modelId = modelConfig.model;
  const modelInfo = getModelInfo(modelId);

  return useMemo(() => {
    if (!modelInfo?.pricing) {
      return { cost: null, display: "" };
    }

    const { input: inputPrice, output: outputPrice } = modelInfo.pricing;

    // ── Input tokens: mirrors actual send logic ──
    const inputTokens = computeEffectiveTokens({
      messages: session.messages,
      clearContextIndex: session.clearContextIndex ?? 0,
      historyMessageCount: modelConfig.historyMessageCount,
      maxTokens: modelConfig.max_tokens,
      sendMemory: modelConfig.sendMemory,
      memoryPrompt: session.memoryPrompt ?? "",
      lastSummarizeIndex: session.lastSummarizeIndex ?? 0,
      maskContext: session.mask?.context ?? [],
      userInput,
    });

    // ── Output tokens: estimate ──
    // Use a conservative estimate: min(max_output, 1024)
    const estimatedOutput = Math.min(modelInfo.max_output ?? 4096, 1024);

    // ── Cost calculation ──
    const inputCost = inputTokens * inputPrice;
    const outputCost = estimatedOutput * outputPrice;
    const totalCost = inputCost + outputCost;

    return {
      cost: totalCost,
      inputTokens,
      estimatedOutput,
      display: formatCost(totalCost),
    };
  }, [
    modelInfo,
    session.messages,
    session.clearContextIndex,
    session.memoryPrompt,
    session.lastSummarizeIndex,
    session.mask?.context,
    modelConfig.historyMessageCount,
    modelConfig.max_tokens,
    modelConfig.sendMemory,
    userInput,
  ]);
}

/**
 * Format a dollar cost into a compact display string.
 *   0          → "$0"
 *   0.00001    → "<$0.01"
 *   0.0523     → "$0.05"
 *   1.234      → "$1.23"
 *   12.5       → "$12.50"
 */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return "<$0.01";
  return "$" + cost.toFixed(2);
}
