import { useMemo } from "react";
import { useChatStore } from "../store";
import { isEncoderReady, formatTokenCount } from "../utils/tiktoken";
import { useModelInfo, getContextLength } from "../hooks/useModelInfo";
import { computeEffectiveTokens } from "../utils/token-calc";

/**
 * Hook that computes token usage for the current chat session.
 *
 * Mirrors the actual message-selection logic of getMessagesWithMemory(),
 * respecting historyMessageCount, max_tokens cap, sendMemory, and clearContextIndex.
 *
 * @param userInput  Current text in the input box (optional, included in count when provided)
 *
 * Returns:
 *  - usedTokens:   estimated input tokens that will be sent to API
 *  - contextLimit:  model's context window size
 *  - usageRatio:   usedTokens / contextLimit  (0-1+)
 *  - display:      formatted string like "12.5K / 128K"
 *  - ready:        whether the BPE encoder is loaded (if false, counts are estimates)
 */
export function useTokenCount(userInput?: string) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const { getModelInfo, isLoading: modelInfoLoading } = useModelInfo();

  const modelConfig = session.mask.modelConfig;
  const modelId = modelConfig.model;
  const modelInfo = getModelInfo(modelId);
  const contextLimit = getContextLength(modelId, modelInfo);

  const usedTokens = useMemo(() => {
    return computeEffectiveTokens({
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
  }, [
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

  const usageRatio = contextLimit > 0 ? usedTokens / contextLimit : 0;

  const display = `${formatTokenCount(usedTokens)} / ${formatTokenCount(
    contextLimit,
  )}`;

  return {
    usedTokens,
    contextLimit,
    usageRatio,
    display,
    ready: isEncoderReady(),
    modelInfoLoading,
  };
}
