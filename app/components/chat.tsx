/**
 * Chat page — main orchestrator component.
 *
 * Sub-components have been extracted to:
 *   chat-actions.tsx        — ChatAction, ChatActions, MCPAction, TokenUsageIndicator
 *   chat-modals.tsx         — SessionConfigModel, EditMessageModal, DeleteImageButton, ShortcutKeyModal
 *   chat-input.tsx          — PromptToast, PromptHints, useSubmitHandler, ClearContextDivider, RenderPrompt
 *   chat-hooks.tsx          — useScrollToBottom
 *   chat-message-item.tsx   — ChatMessageItem (per-message row, React.memo'd)
 *   chat-message-actions.ts — useChatMessageActions (delete/resend/pin/edit/stop)
 *   chat-render-window.ts   — useChatRenderWindow (paged message window, scroll)
 */

import { useDebouncedCallback } from "use-debounce";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import SendWhiteIcon from "../icons/send-white.svg";

import { useCostEstimate, formatCost } from "../hooks/useCostEstimate";
import { useModelInfo } from "../hooks/useModelInfo";

import {
  BOT_HELLO,
  ChatMessage,
  createMessage,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";

import {
  autoGrowTextArea,
  getMessageTextContent,
  safeLocalStorage,
  useMobileScreen,
} from "../utils";

import { usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import styles from "./chat.module.scss";

import { showConfirm, showToast } from "./ui-lib";
import { useNavigate } from "react-router-dom";
import { Path, UNFINISHED_INPUT } from "../constant";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { ChatControllerPool } from "../client/controller";
import { settleStaleMessage } from "../store/chat-repair";
import { ExportMessageModal } from "./exporter";

import isEmpty from "lodash-es/isEmpty";
import { RealtimeChat } from "@/app/components/realtime-chat";
import clsx from "clsx";

// --- Import extracted components for internal use ---
import { ChatActions } from "./chat-actions";
import { EditMessageModal as EditMessageModalComponent } from "./chat-modals";
import { DeleteImageButton as DeleteImageButtonComponent } from "./chat-modals";
import { ShortcutKeyModal as ShortcutKeyModalComponent } from "./chat-modals";
import { useChatTTS } from "./chat-tts";
import { useChatKeyboardShortcuts } from "./chat-keyboard-shortcuts";
import { useChatImages } from "./chat-images";
import { useChatMessageActions } from "./chat-message-actions";
import { useChatRenderWindow } from "./chat-render-window";
import { logger } from "@/app/utils/logger";
import {
  parseSettingsLink,
  previewSettingsLink,
} from "../domain/settings/link";
import { applySettingsLink } from "../services/settings/link";
import {
  useSubmitHandler,
  PromptHints as PromptHintsComponent,
  RenderPrompt,
} from "./chat-input";
import { useScrollToBottom } from "../hooks/useChatScroll";
import { ChatMessageItem } from "./chat-message-item";
import { ChatHeader } from "./chat-header";
import type { ImageAttachment } from "../domain/media/image-attachment";
import { openImageLightbox } from "./image-preview";

// --- Module-level singletons ---

const localStorage = safeLocalStorage();

function ImageAttachmentCard(props: {
  attachment: ImageAttachment;
  onRemove: () => void;
}) {
  const { attachment, onRemove } = props;
  const [filePreview, setFilePreview] = useState("");
  useEffect(() => {
    if (!attachment.file || attachment.url) return;
    const preview = URL.createObjectURL(attachment.file);
    setFilePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [attachment.file, attachment.url]);
  const preview = attachment.url ?? filePreview;
  const status =
    attachment.status === "queued"
      ? Locale.Chat.Images.Queued
      : attachment.status === "uploading"
        ? Locale.Chat.Images.Uploading
        : attachment.status === "failed"
          ? Locale.Chat.Images.FailedStatus
          : attachment.status === "sending"
            ? Locale.Chat.Images.Sending
            : Locale.Chat.Images.Ready;
  return (
    <div
      className={clsx(styles["attach-image"], {
        [styles["attach-image-failed"]]: attachment.status === "failed",
        [styles["attach-image-pending"]]:
          attachment.status === "queued" || attachment.status === "uploading",
      })}
      style={preview ? { backgroundImage: `url("${preview}")` } : undefined}
      title={`${attachment.fileName}: ${status}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (preview) openImageLightbox([preview]);
      }}
    >
      <div className={styles["attach-image-status"]}>{status}</div>
      <div className={styles["attach-image-mask"]}>
        <DeleteImageButtonComponent deleteImage={onRemove} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// _Chat — the main chat view (1 instance per session via key={session.id})
// ---------------------------------------------------------------------------

function _Chat() {
  type RenderMessage = ChatMessage & { preview?: boolean };

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const {
    fontSize,
    fontFamily,
    sendPreviewBubble,
    disablePromptHint,
    tightBorder,
    avatar,
    modelConfig,
  } = useAppConfig((s) => ({
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    sendPreviewBubble: s.sendPreviewBubble,
    disablePromptHint: s.disablePromptHint,
    tightBorder: s.tightBorder,
    avatar: s.avatar,
    modelConfig: s.modelConfig,
  }));
  const ttsEnabled = useAppConfig((s) => s.ttsConfig.enable);
  const configUpdate = useAppConfig((s) => s.update);

  const [showExport, setShowExport] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { display: costDisplay } = useCostEstimate(userInput);
  const { getModelInfo: getModelPricing } = useModelInfo();

  const getMessageCostDisplay = useCallback(
    (message: ChatMessage): string => {
      if (!message.usage) return "";
      const modelId = message.model || session.mask.modelConfig.model;
      const info = getModelPricing(modelId);
      if (!info?.pricing) {
        return `${message.usage.promptTokens}+${message.usage.completionTokens} tokens`;
      }
      const cost =
        message.usage.promptTokens * info.pricing.input +
        message.usage.completionTokens * info.pricing.output;
      return formatCost(cost);
    },
    [getModelPricing, session.mask.modelConfig.model],
  );

  const { submitKey, shouldSubmit } = useSubmitHandler();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottom = scrollRef?.current
    ? Math.abs(
        scrollRef.current.scrollHeight -
          (scrollRef.current.scrollTop + scrollRef.current.clientHeight),
      ) <= 1
    : false;
  const isAttachWithTop = useMemo(() => {
    const lastMessage = scrollRef.current?.lastElementChild as HTMLElement;
    if (!scrollRef?.current || !lastMessage) return false;
    const topDistance =
      lastMessage!.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top;
    return topDistance < 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef?.current?.scrollHeight]);

  const isTyping = userInput !== "";

  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    scrollRef,
    (isScrolledToBottom || isAttachWithTop) && !isTyping,
    session.messages,
  );
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const {
    attachments,
    attachImages,
    maxAttachImages,
    beginImageSubmission,
    setAttachImages,
    uploading,
    setUploading,
    handlePaste,
    handleDrop,
    imageError,
    removeAttachment,
    clearImages,
    retryImages,
    canRetryImages,
    uploadImage,
  } = useChatImages();

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  const [inputRows, setInputRows] = useState(2);
  const measure = useDebouncedCallback(
    () => {
      const rows = inputRef.current ? autoGrowTextArea(inputRef.current) : 1;
      const inputRows = Math.min(
        20,
        Math.max(2 + Number(!isMobileScreen), rows),
      );
      setInputRows(inputRows);
    },
    100,
    { leading: true, trailing: true },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [userInput]);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => chatStore.newSession(),
    newm: () => navigate(Path.NewChat),
    prev: () => chatStore.nextSession(-1),
    next: () => chatStore.nextSession(1),
    clear: () =>
      chatStore.updateTargetSession(
        session,
        (session) => (session.clearContextIndex = session.messages.length),
      ),
    fork: () => chatStore.forkSession(),
    del: () => chatStore.deleteSession(chatStore.currentSessionIndex),
  });

  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    setUserInput(text);
    const n = text.trim().length;

    if (n === 0) {
      setPromptHints([]);
    } else if (text.match(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const doSubmit = (userInput: string) => {
    if (userInput.trim() === "" && isEmpty(attachImages)) return;
    const matchCommand = chatCommands.match(userInput);
    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      return;
    }
    if (isLoading || uploading) return;
    setIsLoading(true);
    const finishImageSubmission = beginImageSubmission();
    chatStore
      .onUserInput(userInput, attachImages)
      .then((accepted) => {
        finishImageSubmission(accepted);
        if (!accepted) return;
        setAttachImages((current) =>
          current.filter((image) => !attachImages.includes(image)),
        );
        chatStore.setLastInput(userInput);
        setUserInput((current) => (current === userInput ? "" : current));
        setPromptHints([]);
        if (!isMobileScreen) inputRef.current?.focus();
        setAutoScroll(true);
      })
      .catch(() => {
        finishImageSubmission(false);
        showToast(Locale.Chat.Images.ReadFailed);
      })
      .finally(() => setIsLoading(false));
  };

  const onPromptSelect = (prompt: RenderPrompt) => {
    setTimeout(() => {
      setPromptHints([]);
      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  useEffect(() => {
    chatStore.updateTargetSession(session, (session) => {
      // Settle replies whose request is gone (reload, crash, other tab).
      // A reply that is still waiting for its first token stays untouched.
      session.messages.forEach((m) =>
        settleStaleMessage(m, ChatControllerPool.isActive(session.id, m.id)),
      );

      if (session.mask.syncGlobalConfig) {
        logger.info("[Mask] syncing from global, name = ", session.mask.name);
        session.mask.modelConfig = { ...modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(chatStore.lastInput ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };

  const accessStore = useAccessStore();
  const { speechStatus, openaiSpeech } = useChatTTS();

  const context: RenderMessage[] = useMemo(() => {
    return session.mask.hideContext ? [] : session.mask.context.slice();
  }, [session.mask.context, session.mask.hideContext]);

  if (
    context.length === 0 &&
    session.messages.at(0)?.content !== BOT_HELLO.content
  ) {
    const copiedHello = Object.assign({}, BOT_HELLO);
    if (
      accessStore.configStatus === "ready" &&
      !(
        accessStore.accessCode.trim() &&
        ["idle", "checking"].includes(accessStore.authorizationStatus)
      ) &&
      !accessStore.isAuthorized()
    ) {
      copiedHello.content = Locale.Error.Unauthorized;
    }
    context.push(copiedHello);
  }

  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [sendPreviewBubble, context, isLoading, session.messages, userInput]);

  const {
    messages,
    msgRenderIndex,
    hitBottom,
    onChatBodyScroll,
    scrollToBottom,
  } = useChatRenderWindow({
    renderMessages,
    isMobileScreen,
    setAutoScroll,
    scrollDomToBottom,
  });

  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const { onDelete, onResend, onPinMessage, onEditMessage, onUserStop } =
    useChatMessageActions({
      chatStore,
      session,
      userInput,
      setUserInput,
      setIsLoading,
      setShowPromptModal,
      inputRef,
    });


  const autoFocus = !isMobileScreen;
  const showMaxIcon = !isMobileScreen;

  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
    code: async (text) => {
      try {
        await useAccessStore.getState().fetchConfig();
      } catch {
        showToast(Locale.Auth.ConfigError);
        return;
      }
      if (useAccessStore.getState().disableFastLink) return;
      showConfirm(Locale.URLCommand.Code + "\n••••••••").then((res) => {
        if (res) {
          accessStore.update((access) => (access.accessCode = text));
        }
      });
    },
    settings: async (text) => {
      try {
        await useAccessStore.getState().fetchConfig();
      } catch {
        showToast(Locale.Auth.ConfigError);
        return;
      }
      if (useAccessStore.getState().disableFastLink) return;

      const result = parseSettingsLink(text);
      if (!result.ok) {
        showToast(Locale.URLCommand.Errors[result.error]);
        return;
      }
      void showConfirm(
        <div>
          <p>{Locale.URLCommand.Settings}</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {previewSettingsLink(result.value)}
          </pre>
        </div>,
      ).then((confirmed) => {
        if (!confirmed) return;
        applySettingsLink(result.value);
        showToast(Locale.URLCommand.Applied);
      });
    },
  });

  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    const key = UNFINISHED_INPUT(session.id);
    const mayBeUnfinishedInput = localStorage.getItem(key);
    if (mayBeUnfinishedInput && userInput.length === 0) {
      setUserInput(mayBeUnfinishedInput);
      localStorage.removeItem(key);
    }

    const dom = inputRef.current;
    return () => {
      localStorage.setItem(key, dom?.value ?? "");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // shortcut keys
  const [showShortcutKeyModal, setShowShortcutKeyModal] = useState(false);

  useChatKeyboardShortcuts({
    inputRef,
    messages,
    setShowShortcutKeyModal,
    session,
  });

  const [showChatSidePanel, setShowChatSidePanel] = useState(false);

  return (
    <>
      <div className={styles.chat} key={session.id}>
        <ChatHeader
          topic={session.topic}
          messageCount={session.messages.length}
          isMobileScreen={isMobileScreen}
          showMaxIcon={showMaxIcon}
          tightBorder={tightBorder}
          hitBottom={hitBottom}
          showPromptModal={showPromptModal}
          setShowPromptModal={setShowPromptModal}
          onRefresh={() => {
            showToast(Locale.Chat.Actions.RefreshToast);
            chatStore.summarizeSession(true, session);
          }}
          onEditMessage={() => setIsEditingMessage(true)}
          onExport={() => setShowExport(true)}
          onToggleBorder={() =>
            configUpdate((config) => (config.tightBorder = !config.tightBorder))
          }
        />
        <div className={styles["chat-main"]}>
          <div className={styles["chat-body-container"]}>
            <div
              className={styles["chat-body"]}
              ref={scrollRef}
              onScroll={(e) => onChatBodyScroll(e.currentTarget)}
              onMouseDown={() => inputRef.current?.blur()}
              onTouchStart={() => {
                inputRef.current?.blur();
                setAutoScroll(false);
              }}
            >
              {messages.map((message, i) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  index={i}
                  isContext={i < context.length}
                  totalCount={messages.length}
                  showClearContextDivider={i === clearContextIndex - 1}
                  userAvatar={avatar}
                  maskAvatar={session.mask.avatar}
                  sessionModel={session.mask.modelConfig.model}
                  isMobileScreen={isMobileScreen}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  ttsEnabled={ttsEnabled}
                  speechStatus={speechStatus}
                  scrollRef={scrollRef}
                  onDelete={onDelete}
                  onResend={onResend}
                  onPin={onPinMessage}
                  onUserStop={onUserStop}
                  onSpeech={openaiSpeech}
                  onEditMessage={onEditMessage}
                  onSetUserInput={setUserInput}
                  costDisplay={getMessageCostDisplay(message)}
                  messageRevision={`${message.streaming ? "streaming" : "done"}:${getMessageTextContent(message).length}:${message.tools?.length ?? 0}:${message.isError ? "error" : "ok"}`}
                />
              ))}
            </div>
            <div className={styles["chat-input-panel"]}>
              <PromptHintsComponent
                prompts={promptHints}
                onPromptSelect={onPromptSelect}
              />

              <ChatActions
                uploadImage={uploadImage}
                setAttachImages={setAttachImages}
                setUploading={setUploading}
                showPromptModal={() => setShowPromptModal(true)}
                scrollToBottom={scrollToBottom}
                hitBottom={hitBottom}
                uploading={uploading}
                showPromptHints={() => {
                  if (promptHints.length > 0) {
                    setPromptHints([]);
                    return;
                  }
                  inputRef.current?.focus();
                  setUserInput("/");
                  onSearch("");
                }}
                setShowShortcutKeyModal={setShowShortcutKeyModal}
                setUserInput={setUserInput}
                setShowChatSidePanel={setShowChatSidePanel}
                userInput={userInput}
              />
              {(attachments.length > 0 || imageError) && (
                <div
                  role="status"
                  className={clsx(styles["attach-status-bar"], {
                    [styles["attach-status-bar-error"]]: !!imageError,
                  })}
                >
                  <span className={styles["attach-status-count"]}>
                    {Locale.Chat.Images.Count(
                      attachImages.length,
                      maxAttachImages,
                    )}
                  </span>
                  {imageError && (
                    <span
                      role="alert"
                      className={styles["attach-status-error"]}
                    >
                      {imageError}
                    </span>
                  )}
                  <span className={styles["attach-status-actions"]}>
                    {canRetryImages && (
                      <button
                        type="button"
                        className={styles["attach-status-link"]}
                        onClick={retryImages}
                        disabled={uploading}
                      >
                        {Locale.Chat.Images.Retry}
                      </button>
                    )}
                    {attachments.length > 0 && (
                      <button
                        type="button"
                        className={styles["attach-status-link"]}
                        onClick={clearImages}
                      >
                        {Locale.Chat.Images.TextOnly}
                      </button>
                    )}
                  </span>
                </div>
              )}
              <label
                className={clsx(styles["chat-input-panel-inner"], {
                  [styles["chat-input-panel-inner-attach"]]:
                    attachments.length !== 0,
                })}
                htmlFor="chat-input"
              >
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  className={styles["chat-input"]}
                  placeholder={Locale.Chat.Input(submitKey)}
                  onInput={(e) => onInput(e.currentTarget.value)}
                  value={userInput}
                  onKeyDown={onInputKeyDown}
                  onFocus={scrollToBottom}
                  onClick={scrollToBottom}
                  onPaste={handlePaste}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("Files"))
                      event.preventDefault();
                  }}
                  onDrop={handleDrop}
                  rows={inputRows}
                  autoFocus={autoFocus}
                  style={{
                    fontSize: fontSize,
                    fontFamily: fontFamily,
                  }}
                />
                {attachments.length != 0 && (
                  <div
                    className={styles["attach-images"]}
                    title={`${attachImages.length}/${maxAttachImages} images attached`}
                  >
                    {attachments.map((attachment) => (
                      <ImageAttachmentCard
                        key={attachment.id}
                        attachment={attachment}
                        onRemove={() => removeAttachment(attachment.id)}
                      />
                    ))}
                  </div>
                )}
                <IconButton
                  icon={<SendWhiteIcon />}
                  text={
                    costDisplay
                      ? `${Locale.Chat.Send} ${costDisplay}`
                      : Locale.Chat.Send
                  }
                  className={styles["chat-input-send"]}
                  type="primary"
                  onClick={() => doSubmit(userInput)}
                />
              </label>
            </div>
          </div>
          <div
            className={clsx(styles["chat-side-panel"], {
              [styles["mobile"]]: isMobileScreen,
              [styles["chat-side-panel-show"]]: showChatSidePanel,
            })}
          >
            {showChatSidePanel && (
              <RealtimeChat
                onClose={() => {
                  setShowChatSidePanel(false);
                }}
                onStartVoice={async () => {
                  logger.info("start voice");
                }}
              />
            )}
          </div>
        </div>
      </div>
      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModalComponent
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}

      {showShortcutKeyModal && (
        <ShortcutKeyModalComponent
          onClose={() => setShowShortcutKeyModal(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat — public wrapper, remounts _Chat on session change
// ---------------------------------------------------------------------------

export function Chat() {
  const sessionId = useChatStore((s) => s.currentSession().id);
  return <_Chat key={sessionId}></_Chat>;
}
