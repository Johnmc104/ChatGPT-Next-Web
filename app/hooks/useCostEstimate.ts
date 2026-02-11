import { useMemo } from "react";
import { useChatStore } from "../store";
import { countTokens } from "../utils/tiktoken";
import { useModelInfo, getContextLength } from "./useModelInfo";
import { getMessageTextContent } from "../utils";

/**
 * Estimate the cost of sending the next message.
 *
 * Cost = inputTokens × pricing.input  +  estimatedOutputTokens × pricing.output
 *
 * - inputTokens: all tokens that will be sent (context + new user input)
 * - estimatedOutputTokens: uses max_output capped at 4096, or 1024 as fallback
 *
 * @param userInput  Current text in the input box (not yet sent)
 */
export function useCostEstimate(userInput: string) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const { getModelInfo } = useModelInfo();

  const modelId = session.mask.modelConfig.model;
  const modelInfo = getModelInfo(modelId);

  return useMemo(() => {
    if (!modelInfo?.pricing) {
      return { cost: null, display: "" };
    }

    const { input: inputPrice, output: outputPrice } = modelInfo.pricing;

    // If pricing is zero (free model), show $0.00
    // If pricing is not available, return null

    // ── Input tokens: context + user's new message ──
    const messages = session.messages;
    const clearIdx = session.clearContextIndex ?? 0;
    const activeMessages = messages.slice(clearIdx);

    let inputTokens = 0;
    for (const msg of activeMessages) {
      if (msg.isError) continue;
      inputTokens += countTokens(getMessageTextContent(msg));
    }
    // Per-message overhead (~4 tokens each) + priming
    inputTokens += activeMessages.filter((m) => !m.isError).length * 4 + 3;

    // System / memory prompts
    if (session.memoryPrompt) {
      inputTokens += countTokens(session.memoryPrompt);
    }
    if (session.mask?.context) {
      for (const ctx of session.mask.context) {
        inputTokens += countTokens(
          typeof ctx.content === "string" ? ctx.content : "",
        );
        inputTokens += 4;
      }
    }

    // Add the user's current input
    if (userInput) {
      inputTokens += countTokens(userInput) + 4;
    }

    // ── Output tokens: estimate ──
    // Use a conservative estimate: min(max_output, 1024)
    // Most responses are well under max_output
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
    session.mask?.context,
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
