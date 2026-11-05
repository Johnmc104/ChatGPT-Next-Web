import { checkAuthorization } from "../app/services/auth/check";
import { ACCESS_CODE_PREFIX } from "../app/constant";

afterEach(() => jest.useRealTimers());
test("validates access using the site-only route", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ok: true }),
  });
  expect(await checkAuthorization(" demo ")).toEqual({ ok: true });
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/auth/check",
    expect.objectContaining({
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${ACCESS_CODE_PREFIX}demo` },
    }),
  );
});

test("distinguishes invalid access codes and network failures", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    json: async () => ({ ok: false, code: "invalid-code" }),
  });
  expect(await checkAuthorization("bad")).toEqual({
    ok: false,
    code: "invalid-code",
  });
  (fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));
  expect(await checkAuthorization("demo")).toEqual({
    ok: false,
    code: "network",
  });
});

test("times out and releases its timer", async () => {
  jest.useFakeTimers();
  (fetch as jest.Mock).mockImplementationOnce(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new Error("abort")),
        ),
      ),
  );
  const result = checkAuthorization("demo");
  jest.advanceTimersByTime(8000);
  expect(await result).toEqual({ ok: false, code: "timeout" });
  expect(jest.getTimerCount()).toBe(0);
});
