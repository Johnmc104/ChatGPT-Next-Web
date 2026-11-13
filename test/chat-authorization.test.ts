import { createChatActions } from "../app/store/chat-requests";
import { useAccessStore } from "../app/store/access";
import { getClientApi } from "../app/client/api";

jest.mock("../app/store/access", () => ({
  useAccessStore: { getState: jest.fn() },
}));
jest.mock("../app/client/api", () => ({
  getClientApi: jest.fn(),
  getHeaders: () => ({}),
}));
jest.mock("../app/utils/toast", () => ({ showToast: jest.fn() }));
jest.mock("../app/mcp/actions", () => ({}));
jest.mock("../app/store/chat-types", () => ({
  DEFAULT_TOPIC: "New chat",
  createMessage: jest.fn(),
}));
jest.mock("../app/utils/indexedDB-storage", () => ({
  indexedDBStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

test("rejected site authorization never creates messages or calls a model", async () => {
  (useAccessStore.getState as jest.Mock).mockReturnValue({
    verifyAuthorization: async () => false,
    authorizationError: "invalid-code",
  });
  const get = jest.fn();
  const set = jest.fn();
  const actions = createChatActions(set, get);
  expect(
    await actions.onUserInput("retain this draft", [
      "https://fixture.test/image.png",
    ]),
  ).toBe(false);
  expect(get).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  expect(getClientApi).not.toHaveBeenCalled();
});
