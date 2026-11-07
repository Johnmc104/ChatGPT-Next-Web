import { act, renderHook } from "@testing-library/react";

const stop = jest.fn();
const verifyAuthorization = jest.fn();
const showToast = jest.fn();

jest.mock("../app/client/controller", () => ({
  ChatControllerPool: { stop: (...args: any[]) => stop(...args) },
}));
jest.mock("../app/components/ui-lib", () => ({
  showToast: (...args: any[]) => showToast(...args),
}));
jest.mock("../app/store", () => ({
  useAccessStore: {
    getState: () => ({
      verifyAuthorization,
      authorizationError: undefined,
    }),
  },
  useChatStore: { getState: () => ({}) },
}));

import { useChatMessageActions } from "../app/components/chat-message-actions";

function makeSession() {
  return {
    id: "s1",
    messages: [
      { id: "u1", role: "user", content: "hello" },
      { id: "a1", role: "assistant", content: "hi" },
      { id: "u2", role: "user", content: "again" },
    ],
    mask: { context: [] as any[] },
  } as any;
}

function setup() {
  const session = makeSession();
  const chatStore = {
    updateTargetSession: jest.fn((target: any, fn: (s: any) => void) =>
      fn(target),
    ),
    onUserInput: jest.fn(() => Promise.resolve(true)),
  } as any;
  const setIsLoading = jest.fn();
  const focus = jest.fn();
  const hook = renderHook(() =>
    useChatMessageActions({
      chatStore,
      session,
      userInput: "",
      setUserInput: jest.fn(),
      setIsLoading,
      setShowPromptModal: jest.fn(),
      inputRef: { current: { focus } as any },
    }),
  );
  return { hook, session, chatStore, setIsLoading, focus };
}

beforeEach(() => jest.clearAllMocks());

describe("useChatMessageActions", () => {
  test("onUserStop stops the controller for the current session", () => {
    const { hook } = setup();
    hook.result.current.onUserStop("a1");
    expect(stop).toHaveBeenCalledWith("s1", "a1");
  });

  test("onDelete removes only the target message", () => {
    const { hook, session } = setup();
    hook.result.current.onDelete("a1");
    expect(session.messages.map((m: any) => m.id)).toEqual(["u1", "u2"]);
  });

  test("onEditMessage updates message content", () => {
    const { hook, session } = setup();
    hook.result.current.onEditMessage("u2", "edited");
    expect(session.messages[2].content).toBe("edited");
  });

  test("onResend of an assistant message resends the preceding user turn", async () => {
    verifyAuthorization.mockResolvedValue(true);
    const { hook, session, chatStore, setIsLoading, focus } = setup();
    await act(() => hook.result.current.onResend(session.messages[1]));
    expect(session.messages.map((m: any) => m.id)).toEqual(["u2"]);
    expect(setIsLoading).toHaveBeenCalledWith(true);
    expect(chatStore.onUserInput).toHaveBeenCalledWith("hello", []);
    expect(focus).toHaveBeenCalled();
  });

  test("onResend is blocked when authorization fails", async () => {
    verifyAuthorization.mockResolvedValue(false);
    const { hook, session, chatStore } = setup();
    await act(() => hook.result.current.onResend(session.messages[1]));
    expect(chatStore.onUserInput).not.toHaveBeenCalled();
    expect(session.messages).toHaveLength(3);
    expect(showToast).toHaveBeenCalled();
  });
});
