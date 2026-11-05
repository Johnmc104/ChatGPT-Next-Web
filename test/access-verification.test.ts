jest.mock("../app/client/api", () => ({ getHeaders: () => ({}) }));
jest.mock("../app/config/client", () => ({ getClientConfig: () => ({}) }));
jest.mock("../app/store/config", () => ({
  DEFAULT_CONFIG: { modelConfig: {} },
}));
jest.mock("../app/utils/fetch", () => ({
  fetchJSON: jest.fn(async () => ({ needCode: false, hasServerApiKey: true })),
}));
jest.mock("../app/services/auth/check", () => ({
  checkAuthorization: jest.fn(),
}));
jest.mock("../app/utils/indexedDB-storage", () => ({
  indexedDBStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

beforeEach(() => jest.resetModules());

test("deduplicates checks and invalidates authorization when the access code changes", async () => {
  const { useAccessStore } = require("../app/store/access");
  const { checkAuthorization } = require("../app/services/auth/check");
  await useAccessStore.getState().fetchConfig();
  useAccessStore.setState({ needCode: true, accessCode: "first" });
  let finish!: (result: unknown) => void;
  checkAuthorization.mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const first = useAccessStore.getState().verifyAuthorization();
  const second = useAccessStore.getState().verifyAuthorization();
  await Promise.resolve();
  expect(checkAuthorization).toHaveBeenCalledTimes(1);
  finish({ ok: true });
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(useAccessStore.getState().isAuthorized()).toBe(true);
  useAccessStore.setState({ accessCode: "changed" });
  expect(useAccessStore.getState().isAuthorized()).toBe(false);
});

test("a response for an old code cannot authorize the new code", async () => {
  const { useAccessStore } = require("../app/store/access");
  const { checkAuthorization } = require("../app/services/auth/check");
  await useAccessStore.getState().fetchConfig();
  useAccessStore.setState({ needCode: true, accessCode: "old" });
  let finish!: (result: unknown) => void;
  checkAuthorization.mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const pending = useAccessStore.getState().verifyAuthorization();
  await Promise.resolve();
  useAccessStore.setState({ accessCode: "new" });
  finish({ ok: true });
  expect(await pending).toBe(false);
  expect(useAccessStore.getState().isAuthorized()).toBe(false);
  expect(useAccessStore.getState().authorizationStatus).toBe("idle");
});
