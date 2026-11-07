/**
 * Message-level action handlers for the chat view.
 *
 * Extracted verbatim from `_Chat` in `chat.tsx` to keep the orchestrator
 * component focused on layout and composition. Behavior — including
 * authorization checks, ChatControllerPool stop, and resend ordering — is
 * identical to the inline implementation.
 */

import type React from "react";
import { useCallback } from "react";

import { ChatMessage, useAccessStore, useChatStore } from "../store";
import type { ChatSession } from "../store/chat-types";
import { MultimodalContent } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import {
  getMessageImages,
  getMessageTextContent,
  selectOrCopy,
} from "../utils";
import { showToast } from "./ui-lib";
import Locale from "../locales";

type ChatStore = ReturnType<typeof useChatStore.getState>;

export interface UseChatMessageActionsParams {
  chatStore: ChatStore;
  session: ChatSession;
  userInput: string;
  setUserInput: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  setShowPromptModal: (value: boolean) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export interface ChatMessageActions {
  deleteMessage: (msgId?: string) => void;
  onDelete: (msgId: string) => void;
  onResend: (message: ChatMessage) => Promise<void>;
  onPinMessage: (message: ChatMessage) => void;
  onEditMessage: (
    messageId: string,
    newContent: string | MultimodalContent[],
  ) => void;
  onRightClick: (e: any, message: ChatMessage) => void;
  onUserStop: (messageId: string) => void;
}

export function useChatMessageActions(
  params: UseChatMessageActionsParams,
): ChatMessageActions {
  const {
    chatStore,
    session,
    userInput,
    setUserInput,
    setIsLoading,
    setShowPromptModal,
    inputRef,
  } = params;

  const onUserStop = useCallback(
    (messageId: string) => {
      ChatControllerPool.stop(session.id, messageId);
    },
    [session.id],
  );

  const onRightClick = useCallback(
    (e: any, message: ChatMessage) => {
      if (selectOrCopy(e.currentTarget, getMessageTextContent(message))) {
        if (userInput.length === 0) {
          setUserInput(getMessageTextContent(message));
        }
        e.preventDefault();
      }
    },
    [userInput, setUserInput],
  );

  const deleteMessage = useCallback(
    (msgId?: string) => {
      chatStore.updateTargetSession(
        session,
        (session) =>
          (session.messages = session.messages.filter((m) => m.id !== msgId)),
      );
    },
    [chatStore, session],
  );

  const onDelete = useCallback(
    (msgId: string) => {
      deleteMessage(msgId);
    },
    [deleteMessage],
  );

  const onResend = useCallback(
    async (message: ChatMessage) => {
      const resendingIndex = session.messages.findIndex(
        (m) => m.id === message.id,
      );

      if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
        console.error("[Chat] failed to find resending message", message);
        return;
      }

      let userMessage: ChatMessage | undefined;
      let botMessage: ChatMessage | undefined;

      if (message.role === "assistant") {
        botMessage = message;
        for (let i = resendingIndex; i >= 0; i -= 1) {
          if (session.messages[i].role === "user") {
            userMessage = session.messages[i];
            break;
          }
        }
      } else if (message.role === "user") {
        userMessage = message;
        for (let i = resendingIndex; i < session.messages.length; i += 1) {
          if (session.messages[i].role === "assistant") {
            botMessage = session.messages[i];
            break;
          }
        }
      }

      if (userMessage === undefined) {
        console.error("[Chat] failed to resend", message);
        return;
      }

      try {
        if (!(await useAccessStore.getState().verifyAuthorization())) {
          const code = useAccessStore.getState().authorizationError;
          showToast(
            code ? Locale.Auth.Validation[code] : Locale.Auth.MissingCode,
          );
          return;
        }
      } catch {
        showToast(Locale.Auth.ConfigError);
        return;
      }
      deleteMessage(userMessage.id);
      deleteMessage(botMessage?.id);

      setIsLoading(true);
      const textContent = getMessageTextContent(userMessage);
      const images = getMessageImages(userMessage);
      chatStore
        .onUserInput(textContent, images)
        .then(() => setIsLoading(false));
      inputRef.current?.focus();
    },
    [chatStore, session.messages, deleteMessage, setIsLoading, inputRef],
  );

  const onPinMessage = useCallback(
    (message: ChatMessage) => {
      chatStore.updateTargetSession(session, (session) =>
        session.mask.context.push(message),
      );

      showToast(Locale.Chat.Actions.PinToastContent, {
        text: Locale.Chat.Actions.PinToastAction,
        onClick: () => {
          setShowPromptModal(true);
        },
      });
    },
    [chatStore, session, setShowPromptModal],
  );

  const onEditMessage = useCallback(
    (messageId: string, newContent: string | MultimodalContent[]) => {
      chatStore.updateTargetSession(session, (session) => {
        const m = session.mask.context
          .concat(session.messages)
          .find((m) => m.id === messageId);
        if (m) {
          m.content = newContent;
        }
      });
    },
    [chatStore, session],
  );

  return {
    deleteMessage,
    onDelete,
    onResend,
    onPinMessage,
    onEditMessage,
    onRightClick,
    onUserStop,
  };
}
