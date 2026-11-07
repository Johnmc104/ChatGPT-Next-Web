import { act, renderHook } from "@testing-library/react";
import { useChatRenderWindow } from "../app/components/chat-render-window";
import { CHAT_PAGE_SIZE } from "../app/constant";

function setup(count: number, isMobileScreen = false) {
  const setAutoScroll = jest.fn();
  const scrollDomToBottom = jest.fn();
  const renderMessages = Array.from({ length: count }, (_, i) => i);
  const hook = renderHook(() =>
    useChatRenderWindow({
      renderMessages,
      isMobileScreen,
      setAutoScroll,
      scrollDomToBottom,
    }),
  );
  return { hook, setAutoScroll, scrollDomToBottom };
}

function scrollEl(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
) {
  return { scrollTop, clientHeight, scrollHeight } as HTMLElement;
}

describe("useChatRenderWindow", () => {
  test("starts at the last page and renders at most three pages", () => {
    const { hook } = setup(100);
    expect(hook.result.current.msgRenderIndex).toBe(100 - CHAT_PAGE_SIZE);
    expect(hook.result.current.messages).toEqual(
      Array.from(
        { length: CHAT_PAGE_SIZE },
        (_, i) => 100 - CHAT_PAGE_SIZE + i,
      ),
    );

    const short = setup(5);
    expect(short.hook.result.current.msgRenderIndex).toBe(0);
    expect(short.hook.result.current.messages).toHaveLength(5);
  });

  test("touching the top edge moves the window up one page", () => {
    const { hook, setAutoScroll } = setup(100);
    act(() => hook.result.current.onChatBodyScroll(scrollEl(0, 500, 5000)));
    expect(hook.result.current.msgRenderIndex).toBe(100 - 2 * CHAT_PAGE_SIZE);
    expect(hook.result.current.hitBottom).toBe(false);
    expect(setAutoScroll).toHaveBeenLastCalledWith(false);
  });

  test("hitting bottom uses a 10px desktop and 4px mobile threshold", () => {
    const desktop = setup(10);
    act(() =>
      desktop.hook.result.current.onChatBodyScroll(scrollEl(2492, 500, 3000)),
    );
    expect(desktop.hook.result.current.hitBottom).toBe(true);

    const mobile = setup(10, true);
    act(() =>
      mobile.hook.result.current.onChatBodyScroll(scrollEl(2492, 500, 3000)),
    );
    expect(mobile.hook.result.current.hitBottom).toBe(false);
  });

  test("scrollToBottom resets to the last page and scrolls the DOM", () => {
    const { hook, scrollDomToBottom } = setup(100);
    act(() => hook.result.current.onChatBodyScroll(scrollEl(0, 500, 5000)));
    act(() => hook.result.current.scrollToBottom());
    expect(hook.result.current.msgRenderIndex).toBe(100 - CHAT_PAGE_SIZE);
    expect(scrollDomToBottom).toHaveBeenCalledTimes(1);
  });
});
