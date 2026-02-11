import { useMemo } from "react";
import { useChatStore } from "../store";
import { getMessageTextContent } from "../utils";
import {
  countTokens,
  countMessagesTokens,
  isEncoderReady,
  formatTokenCount,
} from "../utils/tiktoken";
import { useModelInfo, getContextLength } from "../hooks/useModelInfo";

/**
 * Hook that computes token usage for the current chat session.
 *
 * Returns:
 *  - usedTokens:   tokens in active context (after clearContextIndex)
 *  - contextLimit:  model's context window size
 *  - usageRatio:   usedTokens / contextLimit  (0-1+)
 *  - display:      formatted string like "12.5K / 128K"
 *  - ready:        whether the BPE encoder is loaded (if false, counts are estimates)
 */
export function useTokenCount() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const { getModelInfo, isLoading: modelInfoLoading } = useModelInfo();

  const modelId = session.mask.modelConfig.model;
  const modelInfo = getModelInfo(modelId);
  const contextLimit = getContextLength(modelId, modelInfo);

  const usedTokens = useMemo(() => {
    const messages = session.messages;
    const clearIdx = session.clearContextIndex ?? 0;
    const activeMessages = messages.slice(clearIdx);

    // Count message tokens
    let total = 0;
    for (const msg of activeMessages) {
      if (msg.isError) continue;
      const text = getMessageTextContent(msg);
      total += countTokens(text);
    }

    // Add overhead: ~4 tokens per message + 3 priming tokens
    total += activeMessages.filter((m) => !m.isError).length * 4 + 3;

    // Add system prompt / memory prompt estimate
    if (session.memoryPrompt) {
      total += countTokens(session.memoryPrompt);
    }

    // Add mask context prompts
    if (session.mask?.context) {
      for (const ctx of session.mask.context) {
        total += countTokens(
          typeof ctx.content === "string" ? ctx.content : "",
        );
        total += 4; // message overhead
      }
    }

    return total;
  }, [
    session.messages,
    session.clearContextIndex,
    session.memoryPrompt,
    session.mask?.context,
    // Re-compute when encoder becomes ready (isEncoderReady changes from false→true)
    // We read it here so React can track re-renders via the store's message changes
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
