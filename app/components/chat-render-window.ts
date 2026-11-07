/**
 * Paged render window for the chat message list.
 *
 * Extracted verbatim from `_Chat` in `chat.tsx`. Renders at most
 * 3 * CHAT_PAGE_SIZE messages and shifts the window by one page when the
 * scroll position touches the top or bottom edge.
 */

import { useMemo, useState } from "react";

import { CHAT_PAGE_SIZE } from "../constant";

export interface UseChatRenderWindowParams<T> {
  renderMessages: T[];
  isMobileScreen: boolean;
  setAutoScroll: (enable: boolean) => void;
  scrollDomToBottom: () => void;
}

export function useChatRenderWindow<T>(params: UseChatRenderWindowParams<T>) {
  const { renderMessages, isMobileScreen, setAutoScroll, scrollDomToBottom } =
    params;

  const [hitBottom, setHitBottom] = useState(true);
  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );

  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 3 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom =
      bottomHeight >= e.scrollHeight - (isMobileScreen ? 4 : 10);

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  return {
    messages,
    msgRenderIndex,
    hitBottom,
    onChatBodyScroll,
    scrollToBottom,
  };
}
