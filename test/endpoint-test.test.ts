import { testEndpointConnection } from "../app/services/endpoint/test";
import { fetch as platformFetch } from "../app/utils/stream";

jest.mock("../app/config/client", () => ({
  getClientConfig: () => ({ isApp: false }),
}));
jest.mock("../app/store/access", () => ({
  useAccessStore: { getState: () => ({ accessCode: "" }) },
}));
jest.mock("../app/utils/stream", () => ({ fetch: jest.fn() }));
const fetchMock = platformFetch as jest.Mock;
beforeEach(() => fetchMock.mockReset());
afterEach(() => jest.useRealTimers());

test.each([
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "not-found"],
  [429, "rate-limited"],
  [503, "upstream"],
])("classifies HTTP %i", async (status, code) => {
  fetchMock.mockResolvedValue({ ok: false, status });
  expect(
    await testEndpointConnection("https://api.test", "sample"),
  ).toMatchObject({ ok: false, status, code });
});

test("validates successful responses instead of accepting HTML with status 200", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  });
  expect(await testEndpointConnection("https://api.test", "")).toMatchObject({
    ok: true,
    code: "connected",
  });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("HTML");
    },
  });
  expect(await testEndpointConnection("https://api.test", "")).toMatchObject({
    ok: false,
    code: "response",
  });
});

function pendingFetch() {
  fetchMock.mockImplementation(
    (_url, options: RequestInit) =>
      new Promise(
        (_resolve, reject) =>
          options.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
      ),
  );
}

test("distinguishes the eight-second timeout from user cancellation", async () => {
  jest.useFakeTimers();
  pendingFetch();
  const timeout = testEndpointConnection("https://api.test", "");
  jest.advanceTimersByTime(8000);
  expect(await timeout).toMatchObject({ code: "timeout" });
  const controller = new AbortController();
  const cancelled = testEndpointConnection("https://api.test", "", {
    signal: controller.signal,
  });
  controller.abort();
  expect(await cancelled).toMatchObject({ code: "cancelled" });
  expect(jest.getTimerCount()).toBe(0);
});

test("invalid endpoints and already-cancelled checks do not fetch", async () => {
  expect(await testEndpointConnection("", "")).toMatchObject({
    code: "invalid",
  });
  const controller = new AbortController();
  controller.abort();
  expect(
    await testEndpointConnection("https://api.test", "", {
      signal: controller.signal,
    }),
  ).toMatchObject({ code: "cancelled" });
  expect(fetchMock).not.toHaveBeenCalled();
});
