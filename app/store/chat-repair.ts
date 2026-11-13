/**
 * Repair of chat state that outlived the request that produced it.
 *
 * A reply is only "in progress" while its request controller is alive. After
 * a reload, a crash or a dropped connection, messages can be left with
 * `streaming: true` or with empty content. Left alone, a single stale
 * `streaming: true` also blocks every IndexedDB write of the chat store (see
 * shouldSkipStreamingChatWrite), so this runs after hydration and whenever a
 * session is opened.
 */

import { looksLikeLeakedTopic } from "../domain/chat/topic";
import { prettyObject } from "../utils/format";
import { getMessageImages, getMessageTextContent } from "../utils/message";
import Locale from "../locales";
// Type-only: chat-types pulls in the mask/config stores, which would create
// an import cycle through chat.ts.
import type { ChatMessage, ChatSession } from "./chat-types";

export const INTERRUPTED_REPLY_MESSAGE = "response interrupted";

function hasNoOutput(message: ChatMessage): boolean {
  return (
    getMessageTextContent(message).trim().length === 0 &&
    getMessageImages(message).length === 0 &&
    !message.tools?.length
  );
}

/**
 * Settle a message whose request is no longer running: clear `streaming`
 * and turn an empty reply into a visible error. Returns true if changed.
 */
export function settleStaleMessage(
  message: ChatMessage,
  requestActive: boolean,
): boolean {
  if (requestActive) return false;
  const emptyReply =
    message.role === "assistant" && !message.isError && hasNoOutput(message);
  if (!message.streaming && !emptyReply) return false;

  message.streaming = false;
  if (emptyReply) {
    message.isError = true;
    message.content = prettyObject({
      error: true,
      message: INTERRUPTED_REPLY_MESSAGE,
    });
  }
  return true;
}

/**
 * Repair persisted sessions after hydration: no request survives a reload,
 * so every streaming message is stale; titles that are leaked response JSON
 * are reset so they get regenerated. Returns true if anything changed.
 */
export function repairChatSessions(sessions: ChatSession[]): boolean {
  let changed = false;
  for (const session of sessions) {
    if (session.topic && looksLikeLeakedTopic(session.topic)) {
      session.topic = Locale.Store.DefaultTopic;
      changed = true;
    }
    for (const message of session.messages) {
      if (settleStaleMessage(message, false)) changed = true;
    }
  }
  return changed;
}
