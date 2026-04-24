/**
 * Zustand persist migration logic for the chat store.
 *
 * Extracted from chat.ts (F-11b) to keep the store file focused on
 * state definitions and CRUD operations.
 */

import { nanoid } from "nanoid";
import { useAppConfig } from "./config";
import { ChatSession, createEmptySession } from "./chat-types";

/** The shape of DEFAULT_CHAT_STATE — kept in sync via the generic param. */
interface ChatState {
  sessions: ChatSession[];
  currentSessionIndex: number;
  lastInput: string;
}

export const CHAT_STORE_VERSION = 3.3;

export function migrateChatStore(
  persistedState: unknown,
  version: number,
): ChatState {
  const state = persistedState as any;
  const newState = JSON.parse(JSON.stringify(state)) as ChatState;

  if (version < 2) {
    newState.sessions = [];

    const oldSessions = state.sessions;
    for (const oldSession of oldSessions) {
      const newSession = createEmptySession();
      newSession.topic = oldSession.topic;
      newSession.messages = [...oldSession.messages];
      newSession.mask.modelConfig.sendMemory = true;
      newSession.mask.modelConfig.historyMessageCount = 4;
      newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
      newState.sessions.push(newSession);
    }
  }

  if (version < 3) {
    // migrate id to nanoid
    newState.sessions.forEach((s) => {
      s.id = nanoid();
      s.messages.forEach((m) => (m.id = nanoid()));
    });
  }

  // Enable `enableInjectSystemPrompts` attribute for old sessions.
  // Resolve issue of old sessions not automatically enabling.
  if (version < 3.1) {
    newState.sessions.forEach((s) => {
      if (
        // Exclude those already set by user
        !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
      ) {
        // Because users may have changed this configuration,
        // the user's current configuration is used instead of the default
        const config = useAppConfig.getState();
        s.mask.modelConfig.enableInjectSystemPrompts =
          config.modelConfig.enableInjectSystemPrompts;
      }
    });
  }

  // add default summarize model for every session
  if (version < 3.2) {
    newState.sessions.forEach((s) => {
      const config = useAppConfig.getState();
      s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
      s.mask.modelConfig.compressProviderName =
        config.modelConfig.compressProviderName;
    });
  }
  // revert default summarize model for every session
  if (version < 3.3) {
    newState.sessions.forEach((s) => {
      const config = useAppConfig.getState();
      s.mask.modelConfig.compressModel = "";
      s.mask.modelConfig.compressProviderName = "";
    });
  }

  return newState as any;
}
