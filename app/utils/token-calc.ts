import { ChatMessage } from "../store";
import { getMessageTextContent } from "../utils";
import { countTokens } from "./tiktoken";

/**
 * Mirror the message-selection logic of getMessagesWithMemory() in chat store,
 * but synchronously and without MCP / system-prompt generation.
 *
 * Returns the estimated number of input tokens that will actually be sent
 * to the API for the next request.
 */
export interface TokenCalcParams {
  messages: ChatMessage[];
  clearContextIndex: number;
  historyMessageCount: number;
  maxTokens: number;
  sendMemory: boolean;
  memoryPrompt: string;
  lastSummarizeIndex: number;
  maskContext: Array<{ role: string; content: string | any }>;
  userInput?: string;
}

export function computeEffectiveTokens(params: TokenCalcParams): number {
  const {
    messages,
    clearContextIndex,
    historyMessageCount,
    maxTokens,
    sendMemory,
    memoryPrompt,
    lastSummarizeIndex,
    maskContext,
    userInput,
  } = params;

  const totalMessageCount = messages.length;

  // ── Determine which messages are in scope ──
  // Mirror: shortTermMemoryStartIndex = max(0, total - historyMessageCount)
  const shortTermMemoryStartIndex = Math.max(
    0,
    totalMessageCount - historyMessageCount,
  );

  // Long-term memory start index (only relevant if sendMemory is on)
  const shouldSendLongTermMemory =
    sendMemory &&
    memoryPrompt.length > 0 &&
    lastSummarizeIndex > clearContextIndex;

  const memoryStartIndex = shouldSendLongTermMemory
    ? Math.min(lastSummarizeIndex, shortTermMemoryStartIndex)
    : shortTermMemoryStartIndex;

  // clearContextIndex takes precedence
  const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);

  // ── Token-budget loop (mirrors getMessagesWithMemory) ──
  // Walk from newest message backward, accumulating tokens up to maxTokens
  let messageTokens = 0;
  let messageCount = 0;
  for (
    let i = totalMessageCount - 1;
    i >= contextStartIndex && messageTokens < maxTokens;
    i -= 1
  ) {
    const msg = messages[i];
    if (!msg || msg.isError) continue;
    messageTokens += countTokens(getMessageTextContent(msg));
    messageCount += 1;
  }

  // Per-message overhead (~4 tokens each) + 3 priming tokens
  let total = messageTokens + messageCount * 4 + 3;

  // ── Long-term memory prompt ──
  if (shouldSendLongTermMemory && memoryPrompt) {
    total += countTokens(memoryPrompt) + 4; // +4 for message wrapper
  }

  // ── Mask context prompts ──
  if (maskContext) {
    for (const ctx of maskContext) {
      total += countTokens(typeof ctx.content === "string" ? ctx.content : "");
      total += 4; // message overhead
    }
  }

  // ── User input (draft in text box, not yet sent) ──
  if (userInput) {
    total += countTokens(userInput) + 4;
  }

  return total;
}
