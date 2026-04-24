import { useEffect, RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store";
import { useAccessStore } from "../store/access";
import { copyToClipboard, getMessageTextContent } from "../utils";
import { showConfirm } from "./ui-lib";
import { Path, UNFINISHED_INPUT } from "../constant";
import Locale from "../locales";
import { ChatSession, ChatMessage } from "../store/chat-types";
import { safeLocalStorage } from "../utils/platform";

const localStorage = safeLocalStorage();

export function useChatKeyboardShortcuts(opts: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  messages: ChatMessage[];
  setShowShortcutKeyModal: (v: boolean) => void;
  session: ChatSession;
}) {
  const { inputRef, messages, setShowShortcutKeyModal, session } = opts;
  const chatStore = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        setTimeout(() => {
          chatStore.newSession();
          navigate(Path.Chat);
        }, 10);
      } else if (event.shiftKey && event.key.toLowerCase() === "escape") {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "Semicolon"
      ) {
        event.preventDefault();
        const copyCodeButton =
          document.querySelectorAll<HTMLElement>(".copy-code-button");
        if (copyCodeButton.length > 0) {
          copyCodeButton[copyCodeButton.length - 1].click();
        }
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        const lastNonUserMessage = messages
          .filter((message) => message.role !== "user")
          .pop();
        if (lastNonUserMessage) {
          const lastMessageContent = getMessageTextContent(lastNonUserMessage);
          copyToClipboard(lastMessageContent);
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcutKeyModal(true);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "backspace"
      ) {
        event.preventDefault();
        chatStore.updateTargetSession(session, (session) => {
          if (session.clearContextIndex === session.messages.length) {
            session.clearContextIndex = undefined;
          } else {
            session.clearContextIndex = session.messages.length;
            session.memoryPrompt = "";
          }
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    messages,
    chatStore,
    navigate,
    session,
    inputRef,
    setShowShortcutKeyModal,
  ]);
}
