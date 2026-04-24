/**
 * ChatMessageItem — renders a single chat message row.
 *
 * Extracted from chat.tsx to reduce the monolith and allow React.memo
 * to skip re-renders when a message hasn't changed.
 */

import React from "react";
import { Fragment } from "react";

import EditIcon from "../icons/rename.svg";
import ResetIcon from "../icons/reload.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import CopyIcon from "../icons/copy.svg";
import SpeakIcon from "../icons/speak.svg";
import SpeakStopIcon from "../icons/speak-stop.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CloseIcon from "../icons/close.svg";
import StopIcon from "../icons/pause.svg";

import { ChatImage } from "./image-preview";
import { ChatAction } from "./chat-actions";
import { ClearContextDivider } from "./chat-input";
import { Avatar } from "./emoji";
import { MaskAvatar } from "./mask";
import { IconButton } from "./button";
import { showPrompt } from "./ui-lib";
import {
  copyToClipboard,
  getMessageImages,
  getMessageTextContent,
} from "../utils";
import type { ChatMessage } from "../store";
import type { MultimodalContent } from "../client/api";
import Locale from "../locales";
import styles from "./chat.module.scss";

import dynamic from "next/dynamic";
import LoadingIcon from "../icons/three-dots.svg";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

export interface ChatMessageItemProps {
  message: ChatMessage & { preview?: boolean };
  /** Index within the visible messages array */
  index: number;
  /** Whether this message is a context message (pinned) */
  isContext: boolean;
  /** Total visible message count (for defaultShow optimisation) */
  totalCount: number;
  /** Whether to show the clear-context divider after this message */
  showClearContextDivider: boolean;
  /** Current user avatar */
  userAvatar: string;
  /** Current mask avatar */
  maskAvatar: string;
  /** Model from session mask config (fallback when message.model is empty) */
  sessionModel: string;
  /** Whether user is on mobile */
  isMobileScreen: boolean;
  /** Font size setting */
  fontSize: number;
  /** Font family setting */
  fontFamily: string;
  /** TTS enabled */
  ttsEnabled: boolean;
  /** TTS speech status */
  speechStatus: boolean;
  /** Scroll container ref for Markdown lazy rendering */
  scrollRef: React.RefObject<HTMLDivElement>;

  // Callbacks
  onDelete: (msgId: string) => void;
  onResend: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onUserStop: (messageId: string) => void;
  onSpeech: (text: string) => void;
  onEditMessage: (
    messageId: string,
    newContent: string | MultimodalContent[],
  ) => void;
  onSetUserInput: (input: string) => void;
  /** Display string for message cost (tokens / $) */
  costDisplay: string;
}

function _ChatMessageItem({
  message,
  index,
  isContext,
  totalCount,
  showClearContextDivider,
  userAvatar,
  maskAvatar,
  sessionModel,
  isMobileScreen,
  fontSize,
  fontFamily,
  ttsEnabled,
  speechStatus,
  scrollRef,
  onDelete,
  onResend,
  onPin,
  onUserStop,
  onSpeech,
  onEditMessage,
  onSetUserInput,
  costDisplay,
}: ChatMessageItemProps) {
  const isUser = message.role === "user";
  const showActions =
    index > 0 &&
    !(message.preview || message.content.length === 0) &&
    !isContext;
  const showTyping = message.preview || message.streaming;

  const images = getMessageImages(message);

  return (
    <Fragment key={message.id}>
      <div
        className={
          isUser ? styles["chat-message-user"] : styles["chat-message"]
        }
      >
        <div className={styles["chat-message-container"]}>
          <div className={styles["chat-message-header"]}>
            <div className={styles["chat-message-avatar"]}>
              <div className={styles["chat-message-edit"]}>
                <IconButton
                  icon={<EditIcon />}
                  aria={Locale.Chat.Actions.Edit}
                  onClick={async () => {
                    const newMessage = await showPrompt(
                      Locale.Chat.Actions.Edit,
                      getMessageTextContent(message),
                      10,
                    );
                    let newContent: string | MultimodalContent[] = newMessage;
                    const msgImages = getMessageImages(message);
                    if (msgImages.length > 0) {
                      newContent = [{ type: "text", text: newMessage }];
                      for (const img of msgImages) {
                        newContent.push({
                          type: "image_url",
                          image_url: { url: img },
                        });
                      }
                    }
                    onEditMessage(message.id, newContent);
                  }}
                />
              </div>
              {isUser ? (
                <Avatar avatar={userAvatar} />
              ) : (
                <>
                  {["system"].includes(message.role) ? (
                    <Avatar avatar="2699-fe0f" />
                  ) : (
                    <MaskAvatar
                      avatar={maskAvatar}
                      model={message.model || sessionModel}
                    />
                  )}
                </>
              )}
            </div>
            {!isUser && (
              <div className={styles["chat-model-name"]}>
                {message.model}
                {message.usage && (
                  <span
                    className={styles["chat-message-cost"]}
                    title={`Prompt: ${message.usage.promptTokens.toLocaleString()} tokens\nCompletion: ${message.usage.completionTokens.toLocaleString()} tokens\nTotal: ${message.usage.totalTokens.toLocaleString()} tokens`}
                  >
                    {costDisplay}
                  </span>
                )}
              </div>
            )}

            {showActions && (
              <div className={styles["chat-message-actions"]}>
                <div className={styles["chat-input-actions"]}>
                  {message.streaming ? (
                    <ChatAction
                      text={Locale.Chat.Actions.Stop}
                      icon={<StopIcon />}
                      onClick={() => onUserStop(message.id ?? index)}
                    />
                  ) : (
                    <>
                      <ChatAction
                        text={Locale.Chat.Actions.Retry}
                        icon={<ResetIcon />}
                        onClick={() => onResend(message)}
                      />
                      <ChatAction
                        text={Locale.Chat.Actions.Delete}
                        icon={<DeleteIcon />}
                        onClick={() => onDelete(message.id ?? index)}
                      />
                      <ChatAction
                        text={Locale.Chat.Actions.Pin}
                        icon={<PinIcon />}
                        onClick={() => onPin(message)}
                      />
                      <ChatAction
                        text={Locale.Chat.Actions.Copy}
                        icon={<CopyIcon />}
                        onClick={() =>
                          copyToClipboard(getMessageTextContent(message))
                        }
                      />
                      {ttsEnabled && (
                        <ChatAction
                          text={
                            speechStatus
                              ? Locale.Chat.Actions.StopSpeech
                              : Locale.Chat.Actions.Speech
                          }
                          icon={
                            speechStatus ? <SpeakStopIcon /> : <SpeakIcon />
                          }
                          onClick={() =>
                            onSpeech(getMessageTextContent(message))
                          }
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          {message?.tools?.length == 0 && showTyping && (
            <div className={styles["chat-message-status"]}>
              {Locale.Chat.Typing}
            </div>
          )}
          {/*@ts-ignore*/}
          {message?.tools?.length > 0 && (
            <div className={styles["chat-message-tools"]}>
              {message?.tools?.map((tool) => (
                <div
                  key={tool.id}
                  title={tool?.errorMsg}
                  className={styles["chat-message-tool"]}
                >
                  {tool.isError === false ? (
                    <ConfirmIcon />
                  ) : tool.isError === true ? (
                    <CloseIcon />
                  ) : (
                    <LoadingButtonIcon />
                  )}
                  <span>{tool?.function?.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className={styles["chat-message-item"]}>
            <Markdown
              key={message.streaming ? "loading" : "done"}
              content={getMessageTextContent(message)}
              loading={
                (message.preview || message.streaming) &&
                message.content.length === 0 &&
                !isUser
              }
              onDoubleClickCapture={() => {
                if (!isMobileScreen) return;
                onSetUserInput(getMessageTextContent(message));
              }}
              fontSize={fontSize}
              fontFamily={fontFamily}
              parentRef={scrollRef}
              defaultShow={index >= totalCount - 6}
            />
            {(() => {
              if (images.length === 1) {
                return (
                  <ChatImage
                    src={images[0]}
                    allImages={images}
                    index={0}
                    className={styles["chat-message-item-image"]}
                  />
                );
              }
              if (images.length > 1) {
                return (
                  <div
                    className={styles["chat-message-item-images"]}
                    style={
                      { "--image-count": images.length } as React.CSSProperties
                    }
                  >
                    {images.map((image, imgIdx) => (
                      <ChatImage
                        key={imgIdx}
                        src={image}
                        allImages={images}
                        index={imgIdx}
                        multi
                        className={styles["chat-message-item-image-multi"]}
                      />
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </div>
          {message?.audio_url && (
            <div className={styles["chat-message-audio"]}>
              <audio src={message.audio_url} controls />
            </div>
          )}
          <div className={styles["chat-message-action-date"]}>
            {isContext ? Locale.Chat.IsContext : message.date.toLocaleString()}
          </div>
        </div>
      </div>
      {showClearContextDivider && <ClearContextDivider />}
    </Fragment>
  );
}

export const ChatMessageItem = React.memo(_ChatMessageItem);
