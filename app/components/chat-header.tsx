/**
 * ChatHeader — window title bar for the chat page.
 *
 * Extracted from chat.tsx to reduce the main component size.
 */

import React from "react";
import clsx from "clsx";

import RenameIcon from "../icons/rename.svg";
import ExportIcon from "../icons/share.svg";
import ReturnIcon from "../icons/return.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import ReloadIcon from "../icons/reload.svg";

import { IconButton } from "./button";
import { PromptToast } from "./chat-input";
import { DEFAULT_TOPIC } from "../store";
import Locale from "../locales";
import styles from "./chat.module.scss";
import { Path } from "../constant";
import { useNavigate } from "react-router-dom";

export interface ChatHeaderProps {
  topic: string;
  messageCount: number;
  isMobileScreen: boolean;
  showMaxIcon: boolean;
  tightBorder: boolean;
  hitBottom: boolean;
  showPromptModal: boolean;
  setShowPromptModal: (v: boolean) => void;
  onRefresh: () => void;
  onEditMessage: () => void;
  onExport: () => void;
  onToggleBorder: () => void;
}

function _ChatHeader({
  topic,
  messageCount,
  isMobileScreen,
  showMaxIcon,
  tightBorder,
  hitBottom,
  showPromptModal,
  setShowPromptModal,
  onRefresh,
  onEditMessage,
  onExport,
  onToggleBorder,
}: ChatHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="window-header" data-tauri-drag-region>
      {isMobileScreen && (
        <div className="window-actions">
          <div className={"window-action-button"}>
            <IconButton
              icon={<ReturnIcon />}
              bordered
              title={Locale.Chat.Actions.ChatList}
              onClick={() => navigate(Path.Home)}
            />
          </div>
        </div>
      )}

      <div className={clsx("window-header-title", styles["chat-body-title"])}>
        <div
          className={clsx(
            "window-header-main-title",
            styles["chat-body-main-title"],
          )}
          onClickCapture={onEditMessage}
        >
          {!topic ? DEFAULT_TOPIC : topic}
        </div>
        <div className="window-header-sub-title">
          {Locale.Chat.SubTitle(messageCount)}
        </div>
      </div>
      <div className="window-actions">
        <div className="window-action-button">
          <IconButton
            icon={<ReloadIcon />}
            bordered
            title={Locale.Chat.Actions.RefreshTitle}
            onClick={onRefresh}
          />
        </div>
        {!isMobileScreen && (
          <div className="window-action-button">
            <IconButton
              icon={<RenameIcon />}
              bordered
              title={Locale.Chat.EditMessage.Title}
              aria={Locale.Chat.EditMessage.Title}
              onClick={onEditMessage}
            />
          </div>
        )}
        <div className="window-action-button">
          <IconButton
            icon={<ExportIcon />}
            bordered
            title={Locale.Chat.Actions.Export}
            onClick={onExport}
          />
        </div>
        {showMaxIcon && (
          <div className="window-action-button">
            <IconButton
              icon={tightBorder ? <MinIcon /> : <MaxIcon />}
              bordered
              title={Locale.Chat.Actions.FullScreen}
              aria={Locale.Chat.Actions.FullScreen}
              onClick={onToggleBorder}
            />
          </div>
        )}
      </div>

      <PromptToast
        showToast={!hitBottom}
        showModal={showPromptModal}
        setShowModal={setShowPromptModal}
      />
    </div>
  );
}

export const ChatHeader = React.memo(_ChatHeader);
